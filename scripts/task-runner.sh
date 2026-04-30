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
MAX_PARALLEL=2
TARGET_TASK=""
POLL_INTERVAL=10  # 扫描间隔 (秒)
MAX_AUTO_RETRIES=3  # 失败任务自动重试上限

# ============================================================
# 参数解析
# ============================================================
while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto) AUTO_MODE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --max-parallel) MAX_PARALLEL="$2"; shift 2 ;;
    --task) TARGET_TASK="$2"; shift 2 ;;
    --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
    --max-auto-retries) MAX_AUTO_RETRIES="$2"; shift 2 ;;
    --dashboard|--list-available|--mark-complete|--mark-failed|--deps|--reset-retries|--help|-h)
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
  for lock in ${_ACTIVE_LOCKS[@]+"${_ACTIVE_LOCKS[@]}"}; do
    [[ -f "$lock" ]] && rm -f "$lock"
  done
  rm -rf "$PROJECT_DIR/.running" 2>/dev/null || true
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
  for idx in ${!_ACTIVE_LOCKS[@]+"${!_ACTIVE_LOCKS[@]}"}; do
    if [[ "${_ACTIVE_LOCKS[$idx]}" == "$lock_file" ]]; then
      unset '_ACTIVE_LOCKS[$idx]'
      break
    fi
  done
}

# ============================================================
# 重试计数器
# ============================================================

get_retry_count() {
  local task_id="$1"
  cat "$LOCK_DIR/${task_id}.retries" 2>/dev/null || echo 0
}

increment_retry_count() {
  local task_id="$1"
  local count
  count=$(get_retry_count "$task_id")
  echo $((count + 1)) > "$LOCK_DIR/${task_id}.retries"
}

reset_retry_count() {
  local task_id="$1"
  rm -f "$LOCK_DIR/${task_id}.retries"
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

# 验证任务交付物 (提取测试标准中的命令并执行)
verify_task() {
  local task_file="$1"
  local log_file="$2"
  local verify_passed=0
  local verify_failed=0

  # 提取测试标准部分
  local criteria
  criteria=$(sed -n '/^## 测试标准/,/^## /p' "$task_file" | grep -v '^## ')

  # 提取反引号中的可执行命令
  local cmds=()
  while IFS= read -r line; do
    # 匹配 `command` 格式
    while [[ "$line" =~ \`([^\`]+)\` ]]; do
      cmds+=("${BASH_REMATCH[1]}")
      line=${line#*\`}
      line=${line#*\`}
    done
  done <<< "$criteria"

  if [[ ${#cmds[@]} -eq 0 ]]; then
    echo "  → 验证: 未找到可执行命令，跳过"
    return 0
  fi

  echo "  → 开始验证 (${#cmds[@]} 条命令)..."

  local cmd
  for cmd in "${cmds[@]}"; do
    # 过滤危险命令
    if echo "$cmd" | grep -qE '^[[:space:]]*(rm[[:space:]]+-rf|sudo|chmod[[:space:]]+777|>.*/dev/)'; then
      echo "    ⚠ 跳过危险命令: $cmd"
      continue
    fi

    printf "    → %s ... " "$cmd"
    if eval "$cmd" >> "$log_file" 2>&1; then
      echo "✓"
      verify_passed=$((verify_passed + 1))
    else
      echo "✗ (exit=$?)"
      verify_failed=$((verify_failed + 1))
    fi
  done

  echo "  → 验证结果: ${verify_passed} 通过, ${verify_failed} 失败"

  if [[ $verify_failed -gt 0 ]]; then
    return 1
  fi
  return 0
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

请阅读下面的任务文件，完成该任务的所有交付物。你必须进行自我验证。

### 执行流程 (严格遵守)

**第1步: 实现**
- 完成「交付物」中列出的所有条目
- 遵循项目中已有的代码模式和约定

**第2步: 自测 (必须执行)**
- 运行「测试标准」中的每一条验证命令
- 如果某条测试失败，修复代码后重新运行，最多重试3次
- 如果3次后仍失败，在最后输出中明确报告失败原因

**第3步: 确认**
- 确认所有交付物都已创建
- 确认所有测试标准都已通过
- 在输出的最后用以下格式报告结果:

\`\`\`
=== 验证报告 ===
通过: X/N
失败: Y/N
(列出每条测试的结果)
\`\`\`

### 重要提醒
- 不要修改 .md 任务文件的 status 字段，由编排器统一管理
- 不要跳过验证步骤，每条测试标准都必须实际执行
- 如果测试标准要求启动服务或安装依赖，必须执行这些步骤

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
  local retry=0
  local max_retries=2

  # 清空日志，后续全部追加
  : > "$log_file"
  : > "$err_file"

  while true; do
    # 执行 claude
    {
      if [[ $retry -eq 0 ]]; then
        echo "=== 第1次尝试 ==="
      else
        echo ""
        echo "=== 第$((retry + 1))次尝试 (修复模式) ==="
      fi
      echo "start: $(date '+%Y-%m-%d %H:%M:%S')"
    } >> "$log_file"

    claude --print --dangerously-skip-permissions < "$prompt_file" \
      > >(tee -a "$log_file") \
      2> >(tee -a "$err_file" >&2)
    exit_code=$?

    # 如果 err 日志为空，删除它
    [[ -f "$err_file" ]] && [[ ! -s "$err_file" ]] && rm -f "$err_file"

    # 写入结束标记
    {
      echo ""
      echo "---"
      echo "attempt: $((retry + 1))"
      echo "exit_code: $exit_code"
      echo "end_time: $(date '+%Y-%m-%d %H:%M:%S')"
    } >> "$log_file"

    # 扫描异常
    local anomalies
    anomalies=$(scan_log_for_anomalies "$log_file")

    # 硬错误直接退出
    if [[ $exit_code -ne 0 ]]; then
      echo ""
      echo "  ✗ 任务 $task_id 执行失败 (exit=$exit_code)"
      echo "$anomalies"
      update_status "$task_file" "failed"
      break
    fi

    if [[ -n "$anomalies" ]]; then
      echo ""
      echo "  ⚠ 任务 $task_id 进程退出 0，但日志检测到异常:"
      echo "$anomalies"
      echo "  → 标记为 failed，请检查日志后重试"
      update_status "$task_file" "failed"
      exit_code=1
      break
    fi

    # 自动验证
    if verify_task "$task_file" "$log_file"; then
      echo ""
      echo "  ✓ 任务 $task_id 执行成功 (验证通过)"
      update_status "$task_file" "completed"
      reset_retry_count "$task_id"
      break
    fi

    # 验证失败，尝试重试
    retry=$((retry + 1))
    if [[ $retry -ge $max_retries ]]; then
      echo ""
      echo "  ✗ 任务 $task_id 验证失败 (已重试 ${max_retries} 次)"
      update_status "$task_file" "failed"
      exit_code=1
      break
    fi

    echo "  ↻ 验证未通过，生成修复 prompt 重试 (${retry}/${max_retries})..."

    # 生成修复 prompt
    rm -f "$prompt_file"
    prompt_file=$(mktemp)
    cat > "$prompt_file" <<RETRY_PROMPT
## 修复任务: $task_id — $name

上次实现未通过验证。请检查以下测试标准并修复代码:

\`\`\`
$(sed -n '/^## 测试标准/,/^## /p' "$task_file")
\`\`\`

### 要求
1. 定位验证失败的原因
2. 修复代码或补充缺失的交付物
3. 重新运行所有测试命令，确保全部通过
4. 用以下格式报告修复结果:

\`\`\`
=== 修复报告 ===
问题: <失败的测试>
修复: <做了什么>
验证: <通过/失败>
\`\`\`

### 原始任务
\`\`\`
$(cat "$task_file")
\`\`\`
RETRY_PROMPT
    echo "  → 重试 prompt: $prompt_file"
  done

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
  reset_retry_count "$task_id"
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

# 恢复僵尸/失败任务：
#   1. in_progress + 无锁文件  → 进程崩溃，重置为 pending
#   2. pending + 陈旧锁文件    → 锁残留但进程已死，清除锁
#   3. failed                  → 在重试上限内重置为 pending
recover_zombies() {
  for task_file in $(list_tasks); do
    local id status
    id=$(basename "$task_file" .md)
    status=$(get_status "$task_file")

    # 情况1: in_progress 但无锁 → 进程异常退出
    if [[ "$status" == "in_progress" ]] && [[ ! -f "$LOCK_DIR/${id}.lock" ]]; then
      echo "  ↻ 恢复僵尸任务 (in_progress/无锁): $id → pending"
      update_status "$task_file" "pending"
      continue
    fi

    # 情况2: pending 但有陈旧锁 → 检查对应 PID 是否存活
    if [[ "$status" == "pending" ]] && [[ -f "$LOCK_DIR/${id}.lock" ]]; then
      local pid_file="$PROJECT_DIR/.running/${id}.pid"
      local pid_alive=false
      if [[ -f "$pid_file" ]]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null || true)
        [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && pid_alive=true
      fi
      if [[ "$pid_alive" == "false" ]]; then
        echo "  ↻ 清除僵尸锁 (pending/陈旧锁): $id"
        rm -f "$LOCK_DIR/${id}.lock"
        [[ -f "$pid_file" ]] && rm -f "$pid_file"
      fi
      continue
    fi

    # 情况3: failed → 在重试上限内自动重试
    if [[ "$status" == "failed" ]]; then
      local retries
      retries=$(get_retry_count "$id")
      if [[ $retries -lt $MAX_AUTO_RETRIES ]]; then
        increment_retry_count "$id"
        echo "  ↻ 重试失败任务: $id (第 $((retries + 1))/${MAX_AUTO_RETRIES} 次) → pending"
        update_status "$task_file" "pending"
      else
        echo "  ✗ 任务 $id 已达最大重试次数 ($MAX_AUTO_RETRIES)，跳过"
      fi
      continue
    fi
  done
}

# ============================================================
# 主循环
# ============================================================

main_loop() {
  echo "════════════════════════════════════════════════════════════"
  echo "  仿微信系统 — Task Runner 启动"
  echo "  自动模式: $AUTO_MODE | 并发数: $MAX_PARALLEL"
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
      # 自动模式：并发执行任务
      local _running_dir="$PROJECT_DIR/.running"
      mkdir -p "$_running_dir"

      # 清理已完成的后台任务
      local done_pid done_id
      for pid_file in "$_running_dir"/*.pid; do
        [[ -f "$pid_file" ]] || continue
        done_id=$(basename "$pid_file" .pid)
        done_pid=$(cat "$pid_file")
        if ! kill -0 "$done_pid" 2>/dev/null; then
          wait "$done_pid" 2>/dev/null || true
          echo "  ✓ 后台任务 $done_id 完成"
          rm -f "$pid_file"
        fi
      done

      # 计算可用槽位
      local running_count slots launch_id
      running_count=0
      for pid_file in "$_running_dir"/*.pid; do
        [[ -f "$pid_file" ]] && running_count=$((running_count + 1))
      done
      slots=$((MAX_PARALLEL - running_count))

      if [[ $slots -gt 0 ]]; then
        while IFS= read -r line; do
          [[ -z "$line" ]] && continue
          [[ $slots -le 0 ]] && break
          launch_id=$(echo "$line" | awk '{print $1}')
          [[ -z "$launch_id" ]] && continue

          echo "  → 启动后台任务: $launch_id (可用槽位: $slots)"
          execute_task "$launch_id" &
          echo $! > "$_running_dir/${launch_id}.pid"
          slots=$((slots - 1))
        done <<< "$available"
      fi

      printf "  → 运行中: %d/%d，%ds 后重新扫描...\n" \
        $((MAX_PARALLEL - slots)) "$MAX_PARALLEL" "$POLL_INTERVAL"
      sleep "$POLL_INTERVAL"
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
    --max-parallel N    最大并发任务数 (默认: 2)
    --dry-run           只显示可执行任务，不实际执行
    --task T004         只执行指定任务
    --poll-interval N   扫描间隔秒数 (默认: 10)
    --max-auto-retries N  失败任务自动重试上限 (默认: 3)

  命令:
    --help, -h          显示此帮助信息
    --dashboard         显示任务仪表盘
    --list-available    列出所有可执行任务 (pending + 依赖满足)
    --mark-complete ID  标记任务为 completed
    --mark-failed ID    标记任务为 failed
    --deps ID           查看任务的依赖树及状态
    --tail ID           实时查看任务日志 (tail -f)
    --reset-retries ID  清除任务重试计数 (ID 可用 "all")

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
    ./scripts/task-runner.sh --auto --max-parallel 3

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
  --reset-retries)
    task_id="${2:-}"
    if [[ -z "$task_id" ]]; then
      echo "Usage: $0 --reset-retries <TASK_ID|all>"
      exit 1
    fi
    if [[ "$task_id" == "all" ]]; then
      rm -f "$LOCK_DIR"/*.retries
      echo "✓ 已清除所有任务的重试计数"
    else
      reset_retry_count "$task_id"
      echo "✓ 已清除 $task_id 的重试计数"
    fi
    ;;
  --tail)
    task_id="${2:-}"
    log_file="$PROJECT_DIR/logs/${task_id}.log"
    if [[ ! -f "$log_file" ]]; then
      echo "Log not found: $log_file"
      echo "Available logs:"
      ls -la "$PROJECT_DIR/logs/"*.log 2>/dev/null || echo "  (none)"
      exit 1
    fi
    echo "Tailing $log_file (Ctrl-C to stop)..."
    tail -f "$log_file"
    ;;
  *)
    main_loop
    ;;
esac
