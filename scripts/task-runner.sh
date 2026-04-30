#!/usr/bin/env bash
#
# task-runner.sh — 长时间运行的任务编排器
#
# 功能:
#   1. 持续扫描 tasks/ 目录，解析任务文件的 frontmatter
#   2. 找到所有 status=pending 且依赖已满足的任务
#   3. 按优先级和依赖顺序调度执行
#   4. 调度后更新任务状态，支持并发 agent 执行
#
# 用法:
#   ./scripts/task-runner.sh                    # 交互模式，逐个确认
#   ./scripts/task-runner.sh --auto             # 自动模式，不询问
#   ./scripts/task-runner.sh --max-parallel 3   # 最多 3 个任务并发
#   ./scripts/task-runner.sh --dry-run          # 只显示可执行任务，不实际执行
#   ./scripts/task-runner.sh --task T004        # 只执行指定任务
#
# 状态流转:
#   pending → in_progress → completed
#   pending → in_progress → failed (可重试)
#   blocked (依赖未满足时自动标记)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TASKS_DIR="$PROJECT_DIR/tasks"
LOCK_DIR="$PROJECT_DIR/.task-locks"

# ============================================================
# 配置
# ============================================================
AUTO_MODE=false
DRY_RUN=false
TARGET_TASK=""
POLL_INTERVAL=10  # 扫描间隔 (秒)

# ============================================================
# 参数解析
# ============================================================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto) AUTO_MODE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --task) TARGET_TASK="$2"; shift 2 ;;
    --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
    --dashboard|--list-available|--mark-complete|--mark-failed|--deps|--help|-h)
      # 这些由下方的命令分发处理，这里不消费
      break
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

mkdir -p "$LOCK_DIR"

# 全局锁追踪，用于退出时清理
_ACTIVE_LOCKS=()

# 退出/信号时清理残留锁
cleanup_on_exit() {
  local exit_code=$?
  for lock in "${_ACTIVE_LOCKS[@]}"; do
    [[ -f "$lock" ]] && rm -f "$lock"
  done
  exit $exit_code
}

trap cleanup_on_exit EXIT INT TERM HUP

# 安全创建锁 (记录到清理列表)
acquire_lock() {
  local lock_file="$1"
  touch "$lock_file"
  _ACTIVE_LOCKS+=("$lock_file")
}

# 正常释放锁 (从清理列表移除)
release_lock() {
  local lock_file="$1"
  rm -f "$lock_file"
  local idx
  for idx in "${!_ACTIVE_LOCKS[@]}"; do
    if [[ "${_ACTIVE_LOCKS[$idx]}" == "$lock_file" ]]; then
      unset '_ACTIVE_LOCKS[$idx]'
      break
    fi
  done
}

# 扫描日志中的异常信号
scan_log_for_anomalies() {
  local log_file="$1"
  local anomalies=""

  # 只匹配明确的失败信号，避免误报
  if grep -qiE 'pending your approval|need write permission|approve.*write request' "$log_file" 2>/dev/null; then
    anomalies="${anomalies}  - 检测到权限阻塞 (agent 等待批准，未能写文件)\n"
  fi

  if grep -qiE 'Execution error|fatal:|command not found|cannot.*create' "$log_file" 2>/dev/null; then
    anomalies="${anomalies}  - 检测到执行错误\n"
  fi

  # 日志为空或只有极少内容 (agent 立即退出)
  local line_count
  line_count=$(wc -l < "$log_file" 2>/dev/null || echo 0)
  if [[ $line_count -le 3 ]]; then
    anomalies="${anomalies}  - 日志内容过少 (${line_count} 行)，agent 可能未正常执行\n"
  fi

  printf '%b\n' "$anomalies"
}

# ============================================================
# 工具函数
# ============================================================

# 从 markdown 文件解析 frontmatter 中的字段
parse_frontmatter() {
  local file="$1"
  local field="$2"
  # 在 --- 和 --- 之间查找 key: value
  awk -v field="$field" '
    /^---$/ { fm++; next }
    fm==1 && $1 == field":" {
      # 处理数组 [a,b,c] 或简单值
      $1=""
      sub(/^[[:space:]]+/, "")
      print
    }
    fm==2 { exit }
  ' "$file"
}

# 获取任务状态
get_status() {
  parse_frontmatter "$1" "status" | tr -d ' '
}

# 获取依赖列表
get_dependencies() {
  local raw
  raw=$(parse_frontmatter "$1" "dependencies")
  # 解析 [T001, T002] 或 [] 格式
  echo "$raw" | tr -d '[]" ' | tr ',' '\n' | grep -v '^$' || true
}

# 获取优先级
get_priority() {
  parse_frontmatter "$1" "priority" | tr -d ' '
}

# 获取阶段
get_phase() {
  parse_frontmatter "$1" "phase" | tr -d ' '
}

# 获取任务名
get_name() {
  parse_frontmatter "$1" "name" | tr -d '"'
}

# 获取负责 agent
get_agent() {
  parse_frontmatter "$1" "agent" | tr -d ' '
}

# 更新任务状态
update_status() {
  local file="$1"
  local new_status="$2"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY-RUN] Would update $(basename "$file") status → $new_status"
    return
  fi

  # 使用 sed 替换 status 行
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^status: .*/status: $new_status/" "$file"
  else
    sed -i "s/^status: .*/status: $new_status/" "$file"
  fi
  echo "  ✓ $(basename "$file") status → $new_status"
}

# 检查依赖是否全部完成
deps_satisfied() {
  local file="$1"
  local dep
  while IFS= read -r dep; do
    [[ -z "$dep" ]] && continue
    local dep_file="$TASKS_DIR/${dep}.md"
    if [[ ! -f "$dep_file" ]]; then
      echo "  ⚠ 依赖任务文件不存在: $dep"
      return 1
    fi
    local dep_status
    dep_status=$(get_status "$dep_file")
    if [[ "$dep_status" != "completed" ]]; then
      return 1
    fi
  done < <(get_dependencies "$file")
  return 0
}

# 列出所有任务文件
list_tasks() {
  find "$TASKS_DIR" -name "T*.md" -not -name "INDEX.md" | sort
}

# ============================================================
# 核心逻辑：查找可执行任务
# ============================================================

find_available_tasks() {
  local tasks_found=0

  for task_file in $(list_tasks); do
    local id status priority
    id=$(basename "$task_file" .md)
    status=$(get_status "$task_file")

    # 只处理 pending 状态
    if [[ "$status" != "pending" ]]; then
      continue
    fi

    # 如果指定了目标任务，只处理该任务
    if [[ -n "$TARGET_TASK" ]] && [[ "$id" != "$TARGET_TASK" ]]; then
      continue
    fi

    # 检查依赖
    if ! deps_satisfied "$task_file"; then
      continue
    fi

    # 检查是否有并发锁
    if [[ -f "$LOCK_DIR/${id}.lock" ]]; then
      continue
    fi

    # 可用任务
    priority=$(get_priority "$task_file")
    local name
    name=$(get_name "$task_file")
    local phase
    phase=$(get_phase "$task_file")
    local agent
    agent=$(get_agent "$task_file")

    printf "%-6s %-10s %-8s %-12s %s\n" \
      "$id" "$phase" "$priority" "$agent" "$name"
    tasks_found=$((tasks_found + 1))
  done

  return $tasks_found
}

# ============================================================
# 核心逻辑：执行任务
# ============================================================

execute_task() {
  local task_id="$1"
  local task_file="$TASKS_DIR/${task_id}.md"
  local name agent phase

  name=$(get_name "$task_file")
  agent=$(get_agent "$task_file")
  phase=$(get_phase "$task_file")

  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  执行任务: $task_id — $name"
  echo "║  阶段: $phase | Agent: $agent"
  echo "╚══════════════════════════════════════════════════════════════╝"

  # 创建锁文件
  acquire_lock "$LOCK_DIR/${task_id}.lock"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY-RUN] 跳过实际执行"
    release_lock "$LOCK_DIR/${task_id}.lock"
    return 0
  fi

  # 生成 agent prompt
  local prompt_file
  if ! prompt_file=$(mktemp); then
    echo "  ✗ 无法创建临时 prompt 文件"
    release_lock "$LOCK_DIR/${task_id}.lock"
    return 1
  fi

  cat > "$prompt_file" <<PROMPT
## 任务: $task_id — $name

请阅读任务文件 \`$task_file\` 了解完整需求，然后实现该任务。

### 工作流程
1. 仔细阅读任务文件中描述的交付物和测试标准
2. 实现代码，确保满足所有交付物
3. 运行测试标准中的验证步骤

### 重要提醒
- 只实现本任务范围内的功能
- 遵循项目中已有的代码模式和约定
- 确保不与已有代码冲突
- 完成后请验证测试标准全部通过
- 不要修改 .md 任务文件的 status 字段，由编排器统一管理

### 任务文件
\`\`\`
$(cat "$task_file")
\`\`\`
PROMPT

  # 交互模式: 只打印 prompt，不修改状态
  if [[ "$AUTO_MODE" != "true" ]]; then
    echo "  → Agent prompt: $prompt_file"
    echo "  → 请将以上 prompt 发送给 agent: $agent"
    echo ""
    echo "  💡 完成后请运行: ./scripts/task-runner.sh --task $task_id --mark-complete"
    echo ""
    release_lock "$LOCK_DIR/${task_id}.lock"
    rm -f "$prompt_file"
    return 0
  fi

  source ~/.claude/ccd.sh

  # 更新状态为 in_progress
  if ! update_status "$task_file" "in_progress"; then
    echo "  ✗ 无法更新任务状态"
    release_lock "$LOCK_DIR/${task_id}.lock"
    rm -f "$prompt_file"
    return 1
  fi

  local log_file="$PROJECT_DIR/logs/${task_id}.log"
  local err_file="$PROJECT_DIR/logs/${task_id}.err.log"
  mkdir -p "$(dirname "$log_file")"

  echo "  → 自动执行中..."
  echo "  → 开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "  → 日志文件: $log_file"
  echo ""

  cd "$PROJECT_DIR"
  local exit_code=0

  # stdout 和 stderr 分开记录，stderr 单独保存便于排查
  claude --print --dangerously-skip-permissions < "$prompt_file" \
    > >(tee "$log_file") \
    2> >(tee "$err_file" >&2)
  exit_code=$?

  # 如果 err 日志为空，删除它
  [[ -f "$err_file" ]] && [[ ! -s "$err_file" ]] && rm -f "$err_file"

  # 写入结束标记
  {
    echo ""
    echo "---"
    echo "exit_code: $exit_code"
    echo "end_time: $(date '+%Y-%m-%d %H:%M:%S')"
  } >> "$log_file"

  # 扫描日志中的异常信号
  local anomalies
  anomalies=$(scan_log_for_anomalies "$log_file")

  if [[ $exit_code -eq 0 ]] && [[ -z "$anomalies" ]]; then
    echo ""
    echo "  ✓ 任务 $task_id 执行成功"
    update_status "$task_file" "completed"
  elif [[ $exit_code -eq 0 ]] && [[ -n "$anomalies" ]]; then
    echo ""
    echo "  ⚠ 任务 $task_id 进程退出 0，但日志检测到异常:"
    echo "$anomalies"
    echo "  → 标记为 failed，请检查日志后重试"
    update_status "$task_file" "failed"
    exit_code=1
  else
    echo ""
    echo "  ✗ 任务 $task_id 执行失败 (exit=$exit_code)"
    echo "$anomalies"
    update_status "$task_file" "failed"
  fi

  echo "  → 结束时间: $(date '+%Y-%m-%d %H:%M:%S')"
  rm -f "$prompt_file"
  release_lock "$LOCK_DIR/${task_id}.lock"
  return $exit_code
}

# 标记任务完成 (外部调用)
mark_complete() {
  local task_id="$1"
  local task_file="$TASKS_DIR/${task_id}.md"

  if [[ ! -f "$task_file" ]]; then
    echo "✗ 任务文件不存在: $task_file"
    return 1
  fi

  update_status "$task_file" "completed"
  release_lock "$LOCK_DIR/${task_id}.lock"
}

# 标记任务失败
mark_failed() {
  local task_id="$1"
  local task_file="$TASKS_DIR/${task_id}.md"

  if [[ ! -f "$task_file" ]]; then
    echo "✗ 任务文件不存在: $task_file"
    return 1
  fi

  update_status "$task_file" "failed"
  release_lock "$LOCK_DIR/${task_id}.lock"
}

# ============================================================
# 状态仪表盘
# ============================================================

show_dashboard() {
  local total=0 pending=0 in_progress=0 completed=0 failed=0 blocked=0

  for task_file in $(list_tasks); do
    total=$((total + 1))
    case "$(get_status "$task_file")" in
      pending)
        if deps_satisfied "$task_file" 2>/dev/null; then
          pending=$((pending + 1))
        else
          blocked=$((blocked + 1))
        fi
        ;;
      in_progress) in_progress=$((in_progress + 1)) ;;
      completed) completed=$((completed + 1)) ;;
      failed) failed=$((failed + 1)) ;;
    esac
  done

  local pct=$(( completed * 100 / total ))
  local bar_len=30
  local filled=$(( completed * bar_len / total ))
  local bar
  bar=$(printf '%*s' "$filled" '' | tr ' ' '█')
  bar="${bar}$(printf '%*s' $((bar_len - filled)) '' | tr ' ' '░')"

  clear 2>/dev/null || true
  echo ""
  echo "  ╔═══════════════════════════════════════════════════════╗"
  echo "  ║          仿微信系统 — 任务编排控制台                    ║"
  echo "  ╠═══════════════════════════════════════════════════════╣"
  printf "  ║  总任务: %-3d  | 待执行: %-3d | 进行中: %-3d        ║\n" "$total" "$pending" "$in_progress"
  printf "  ║  已完成: %-3d  | 受阻: %-3d   | 失败: %-3d          ║\n" "$completed" "$blocked" "$failed"
  printf "  ║  进度: [%s] %3d%%                     ║\n" "$bar" "$pct"
  echo "  ╠═══════════════════════════════════════════════════════╣"
  echo "  ║  ID    阶段  优先级  Agent        任务名              ║"
  echo "  ╠═══════════════════════════════════════════════════════╣"

  for task_file in $(list_tasks); do
    local id status priority phase agent name
    id=$(basename "$task_file" .md)
    status=$(get_status "$task_file")
    priority=$(get_priority "$task_file")
    phase=$(get_phase "$task_file")
    agent=$(get_agent "$task_file")
    name=$(get_name "$task_file")

    local icon=" "
    case "$status" in
      completed) icon="✅" ;;
      in_progress) icon="🔄" ;;
      failed) icon="❌" ;;
      pending)
        if deps_satisfied "$task_file" 2>/dev/null; then
          icon="⬜"
        else
          icon="🔒"
        fi
        ;;
    esac

    printf "  ║  %s %-4s %-5s %-5s %-12s %s\n" \
      "$icon" "$id" "$phase" "$priority" "$agent" "$(echo "$name" | cut -c1-30)"
  done

  echo "  ╚═══════════════════════════════════════════════════════╝"
  echo ""
  echo "  模式: $([ "$AUTO_MODE" == "true" ] && echo '自动' || echo '交互')"
  echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
}

# ============================================================
# 僵尸任务恢复
# ============================================================

# 恢复卡在 in_progress 但没有锁文件的任务 (进程崩溃/被中断导致)
recover_zombies() {
  for task_file in $(list_tasks); do
    local id status
    id=$(basename "$task_file" .md)
    status=$(get_status "$task_file")

    if [[ "$status" != "in_progress" ]]; then
      continue
    fi

    if [[ ! -f "$LOCK_DIR/${id}.lock" ]]; then
      echo "  ↻ 恢复僵尸任务: $id → pending"
      update_status "$task_file" "pending"
    fi
  done
}

# ============================================================
# 主循环
# ============================================================

main_loop() {
  echo "════════════════════════════════════════════════════════════"
  echo "  仿微信系统 — Task Runner 启动"
  echo "  自动模式: $AUTO_MODE"
  echo "  轮询间隔: ${POLL_INTERVAL}s"
  echo "════════════════════════════════════════════════════════════"

  local iteration=0

  while true; do
    iteration=$((iteration + 1))

    # 恢复僵尸任务
    recover_zombies

    # 显示仪表盘
    show_dashboard

    # 查找可执行任务
    local available
    available=$(find_available_tasks 2>/dev/null || true)

    if [[ -z "$available" ]]; then
      echo "  → 没有可执行的任务 (pending + 依赖满足)"
      echo "  → 等待 ${POLL_INTERVAL}s 后重新扫描..."

      # 检查是否全部完成
      local all_done=true
      for task_file in $(list_tasks); do
        local status
        status=$(get_status "$task_file")
        if [[ "$status" != "completed" ]]; then
          all_done=false
          break
        fi
      done

      if [[ "$all_done" == "true" ]]; then
        echo ""
        echo "════════════════════════════════════════════════════════════"
        echo "  🎉  全部任务已完成！"
        echo "════════════════════════════════════════════════════════════"
        exit 0
      fi

      sleep "$POLL_INTERVAL"
      continue
    fi

    # 单任务模式下只取目标任务
    if [[ -n "$TARGET_TASK" ]]; then
      local target_id="$TARGET_TASK"
      execute_task "$target_id"
      echo ""
      echo "════════════════════════════════════════════════════════════"
      echo "  单任务模式完成: $target_id"
      echo "════════════════════════════════════════════════════════════"
      exit 0
    fi

    # 交互模式：让用户选择
    if [[ "$AUTO_MODE" != "true" ]]; then
      echo ""
      echo "  可执行的任务:"
      echo "$available"
      echo ""
      echo "  输入任务 ID 执行，或:"
      echo "    (a)uto — 切换自动模式"
      echo "    (q)uit  — 退出"
      echo "    (Enter) — 等待下一轮扫描"
      echo ""
      read -r -p "  → " choice

      case "$choice" in
        q|quit|exit)
          echo "  退出 Task Runner"
          exit 0
          ;;
        a|auto)
          AUTO_MODE=true
          echo "  已切换到自动模式"
          continue
          ;;
        "")
          sleep "$POLL_INTERVAL"
          continue
          ;;
        T*)
          execute_task "$choice"
          ;;
        *)
          echo "  无效选择"
          ;;
      esac
    else
      # 自动模式：取第一个可用任务
      local first_task
      first_task=$(echo "$available" | head -1 | awk '{print $1}')
      if [[ -n "$first_task" ]]; then
        execute_task "$first_task"
      fi
      sleep 2
    fi
  done
}

# ============================================================
# 帮助信息
# ============================================================

show_help() {
  cat <<'HELP'

  ╔══════════════════════════════════════════════════════════════╗
  ║              task-runner.sh — 任务编排器                      ║
  ╚══════════════════════════════════════════════════════════════╝

  用法:
    ./scripts/task-runner.sh [选项] [命令]

  选项 (用于 run 模式):
    --auto              自动模式，不询问，按顺序执行任务
    --dry-run           只显示可执行任务，不实际执行
    --task T004         只执行指定任务
    --poll-interval N   扫描间隔秒数 (默认: 10)

  命令:
    --help, -h          显示此帮助信息
    --dashboard         显示任务仪表盘
    --list-available    列出所有可执行任务 (pending + 依赖满足)
    --mark-complete ID  标记任务为 completed
    --mark-failed ID    标记任务为 failed
    --deps ID           查看任务的依赖树及状态

  状态:
    pending       → 等待执行 (依赖满足后自动调度)
    in_progress   → 正在执行中
    completed     → 已完成
    failed        → 执行失败 (可手动重试)
    blocked       → 受阻 (依赖未满足)

  示例:
    # 查看仪表盘
    ./scripts/task-runner.sh --dashboard

    # 列出可执行任务
    ./scripts/task-runner.sh --list-available

    # 自动运行所有任务
    ./scripts/task-runner.sh --auto

    # 只运行 T004
    ./scripts/task-runner.sh --task T004

    # 预演模式
    ./scripts/task-runner.sh --dry-run

    # 标记任务完成
    ./scripts/task-runner.sh --mark-complete T004

HELP
}

# ============================================================
# 命令分发
# ============================================================

case "${1:-}" in
  --help|-h)
    show_help
    ;;
  --mark-complete)
    mark_complete "${2:-}"
    ;;
  --mark-failed)
    mark_failed "${2:-}"
    ;;
  --dashboard)
    show_dashboard
    ;;
  --list-available)
    find_available_tasks
    ;;
  --deps)
    # 显示某任务的依赖树
    task_id="${2:-}"
    if [[ -z "$task_id" ]]; then
      echo "Usage: $0 --deps <TASK_ID>"
      exit 1
    fi
    echo "依赖关系 for $task_id:"
    deps=$(get_dependencies "$TASKS_DIR/${task_id}.md")
    if [[ -z "$deps" ]]; then
      echo "  (无依赖)"
    else
      for dep in $deps; do
        ds=$(get_status "$TASKS_DIR/${dep}.md")
        echo "  $dep [$ds]"
      done
    fi
    ;;
  *)
    main_loop
    ;;
esac
