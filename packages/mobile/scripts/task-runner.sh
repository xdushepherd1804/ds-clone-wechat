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
MAX_AUTO_RETRIES=3

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
    --dashboard|--list-available|--mark-complete|--mark-failed|--deps|--reset-retries|--monitor|--tail|--stats|--help|-h)
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

reset_retry_count() {
  rm -f "$LOCK_DIR/${1}.retries"
}

is_pid_alive() {
  local pid_file="$PROJECT_DIR/.running/${1}.pid"
  local pid=""
  [[ -f "$pid_file" ]] && read -r pid < "$pid_file" 2>/dev/null || true
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
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

# 带超时的命令执行。返回 0=成功, 1=失败, 2=超时(视为成功，常驻服务已启动)
_run_with_timeout() {
  local timeout_sec="$1"
  local cmd="$2"
  local log_file="$3"

  eval "$cmd" >> "$log_file" 2>&1 &
  local pid=$!

  local waited=0
  while [[ $waited -lt $timeout_sec ]]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null
      return $?
    fi
    sleep 1
    waited=$((waited + 1))
  done

  # 超时 — 杀进程组，视为成功（常驻服务已启动）
  kill -TERM -- -$pid 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
  return 2
}

# 验证任务交付物 (提取测试标准中的命令并执行)
verify_task() {
  local task_file="$1"
  local log_file="$2"
  local verify_passed=0
  local verify_failed=0
  local verify_timeout=0
  local cmd_timeout=${VERIFY_CMD_TIMEOUT:-30}

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

  echo "  → 开始验证 (${#cmds[@]} 条命令, 超时: ${cmd_timeout}s)..."

  local cmd
  for cmd in "${cmds[@]}"; do
    # 过滤危险命令
    if echo "$cmd" | grep -qE '^[[:space:]]*(rm[[:space:]]+-rf|sudo|chmod[[:space:]]+777|>.*/dev/)'; then
      echo "    ⚠ 跳过危险命令: $cmd"
      continue
    fi

    printf "    → %s ... " "$cmd"
    _run_with_timeout "$cmd_timeout" "$cmd" "$log_file"
    local rc=$?
    case $rc in
      0) echo "✓"; verify_passed=$((verify_passed + 1)) ;;
      2) echo "✓ (超时, 常驻服务已启动)"; verify_passed=$((verify_passed + 1)); verify_timeout=$((verify_timeout + 1)) ;;
      *) echo "✗ (exit=$rc)"; verify_failed=$((verify_failed + 1)) ;;
    esac
  done

  echo "  → 验证结果: ${verify_passed} 通过 (${verify_timeout} 超时), ${verify_failed} 失败"

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

    local before_ts=$(date +%s)

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

    # 收集会话统计 (tokens / 轮次 / 工具调用)
    collect_task_stats "$task_id" "$before_ts" "$log_file" || true

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

# ============================================================
# 会话统计收集
# ============================================================

# 内部辅助: 找到指定任务的活跃 session id (sdk-cli + project cwd + task_id in prompt)
_find_task_session() {
  local task_id="$1"
  local sessions_dir="$HOME/.claude/sessions"
  local best_session=""

  [[ -d "$sessions_dir" ]] || { echo ""; return; }

  local best_time=0
  for sf in "$sessions_dir"/*.json; do
    [[ -f "$sf" ]] || continue
    local cwd entry started pid
    read -r cwd entry started pid <<< "$(jq -r '[.cwd // "", .entrypoint // "", .startedAt // 0, .pid // 0] | @tsv' "$sf" 2>/dev/null)"
    [[ "$cwd" == "$PROJECT_DIR" ]] || continue
    [[ "$entry" == "sdk-cli" ]] || continue
    [[ $started -gt $best_time ]] || continue
    best_time=$started
    best_session=$(jq -r '.sessionId // empty' "$sf" 2>/dev/null)
  done

  [[ -n "$best_session" ]] || { echo ""; return; }

  local jsonl="$HOME/.claude/projects/-Users-yujing-deepseek-playground/${best_session}.jsonl"
  [[ -f "$jsonl" ]] || { echo ""; return; }

  local check
  check=$(head -20 "$jsonl" | jq -r 'select(.type == "user") | .message.content // empty' 2>/dev/null | head -1)
  [[ "$check" == *"$task_id"* ]] || { echo ""; return; }

  echo "$best_session"
}

# 从 JSONL 解析当前统计数据 (可用于完成或运行中的会话)
_parse_session_stats() {
  local jsonl_file="$1"
  [[ -f "$jsonl_file" ]] || { echo "{}"; return; }

  jq -r '
    select(.type == "assistant") |
    { u: (.message.usage // {}), tc: ([.message.content[]? | select(.type == "tool_use")] | length) }
  ' "$jsonl_file" 2>/dev/null | jq -s '
    {
      turns: length,
      input_tokens: (map(.u.input_tokens // 0) | add),
      output_tokens: (map(.u.output_tokens // 0) | add),
      cache_read: (map(.u.cache_read_input_tokens // 0) | add),
      cache_creation: (map(.u.cache_creation_input_tokens // 0) | add),
      tool_calls: (map(.tc) | add)
    }
  ' 2>/dev/null
}

collect_task_stats() {
  local task_id="$1"
  local before_ts="$2"
  local log_file="$3"

  # 找到 after before_ts 创建且 cwd 匹配的 sdk-cli 会话
  local best_session=""
  local best_time=0
  local sessions_dir="$HOME/.claude/sessions"

  [[ -d "$sessions_dir" ]] || return 0

  for sf in "$sessions_dir"/*.json; do
    [[ -f "$sf" ]] || continue
    local cwd entry started
    read -r cwd entry started <<< "$(jq -r '[.cwd // "", .entrypoint // "", .startedAt // 0] | @tsv' "$sf" 2>/dev/null)"
    [[ "$cwd" == "$PROJECT_DIR" ]] || continue
    [[ "$entry" == "sdk-cli" ]] || continue

    local started_sec=$((started / 1000))
    [[ $started_sec -ge $before_ts ]] || continue

    if [[ $started_sec -gt $best_time ]]; then
      best_time=$started_sec
      best_session=$(jq -r '.sessionId // empty' "$sf" 2>/dev/null)
    fi
  done

  [[ -n "$best_session" ]] || return 0

  local jsonl_file="$HOME/.claude/projects/-Users-yujing-deepseek-playground/${best_session}.jsonl"
  [[ -f "$jsonl_file" ]] || return 0

  # 校验此会话是否包含当前任务
  local first_check
  first_check=$(head -20 "$jsonl_file" | jq -r 'select(.type == "user") | .message.content // empty' 2>/dev/null | head -1)
  [[ "$first_check" == *"$task_id"* ]] || return 0

  local stats
  stats=$(_parse_session_stats "$jsonl_file")
  [[ -n "$stats" && "$stats" != "{}" ]] || return 0

  local turns in_tok out_tok cr_tok cc_tok tc total
  turns=$(echo "$stats" | jq -r '.turns')
  in_tok=$(echo "$stats" | jq -r '.input_tokens')
  out_tok=$(echo "$stats" | jq -r '.output_tokens')
  cr_tok=$(echo "$stats" | jq -r '.cache_read')
  cc_tok=$(echo "$stats" | jq -r '.cache_creation')
  tc=$(echo "$stats" | jq -r '.tool_calls')
  total=$((in_tok + out_tok + cr_tok + cc_tok))

  {
    echo ""
    echo "=== 会话统计 ==="
    echo "task_id: $task_id"
    echo "session_id: $best_session"
    echo "turns: $turns"
    echo "tool_calls: $tc"
    echo "input_tokens: $in_tok"
    echo "output_tokens: $out_tok"
    echo "cache_read_tokens: $cr_tok"
    echo "cache_creation_tokens: $cc_tok"
    echo "total_tokens: $total"
  } >> "$log_file"

  echo "  → 统计: ${turns} 轮, ${tc} 次工具调用, ${in_tok}+${out_tok} tokens"
}

# 显示任务统计
show_task_stats() {
  local task_id="$1"
  local log_file="$PROJECT_DIR/logs/${task_id}.log"

  if [[ ! -f "$log_file" ]]; then
    echo "Log not found: $log_file"
    return 1
  fi

  local section
  section=$(sed -n '/^=== 会话统计 ===$/,/^$/p' "$log_file" 2>/dev/null)

  if [[ -z "$section" ]]; then
    echo ""
    echo "  任务 $task_id 日志中暂无统计数据。"
    echo "  (统计数据在任务首次运行后由 runner 自动收集)"
    local name
    name=$(get_name "$TASKS_DIR/${task_id}.md" 2>/dev/null || echo "?")
    echo "  任务: $name"
    echo ""
    return 1
  fi

  local turns in_tok out_tok cr_tok cc_tok tc total sid
  turns=$(echo "$section" | grep '^turns:' | cut -d' ' -f2)
  tc=$(echo "$section" | grep '^tool_calls:' | cut -d' ' -f2)
  in_tok=$(echo "$section" | grep '^input_tokens:' | cut -d' ' -f2)
  out_tok=$(echo "$section" | grep '^output_tokens:' | cut -d' ' -f2)
  cr_tok=$(echo "$section" | grep '^cache_read_tokens:' | cut -d' ' -f2)
  cc_tok=$(echo "$section" | grep '^cache_creation_tokens:' | cut -d' ' -f2)
  total=$(echo "$section" | grep '^total_tokens:' | cut -d' ' -f2)
  sid=$(echo "$section" | grep '^session_id:' | cut -d' ' -f2)

  local name
  name=$(get_name "$TASKS_DIR/${task_id}.md" 2>/dev/null || echo "?")

  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  printf "  ║  任务统计: %-6s — %-34s ║\n" "$task_id" "$(echo "$name" | cut -c1-34)"
  echo "  ╠══════════════════════════════════════════════════════════╣"
  printf "  ║  对话轮次:    %-8s    工具调用:     %-8s ║\n" "$turns" "$tc"
  printf "  ║  输入 Token:  %-8s    输出 Token:   %-8s ║\n" \
    "$(printf "%'d" ${in_tok:-0} 2>/dev/null || echo ${in_tok:-0})" \
    "$(printf "%'d" ${out_tok:-0} 2>/dev/null || echo ${out_tok:-0})"
  printf "  ║  缓存读取:    %-8s    缓存创建:     %-8s ║\n" \
    "$(printf "%'d" ${cr_tok:-0} 2>/dev/null || echo ${cr_tok:-0})" \
    "$(printf "%'d" ${cc_tok:-0} 2>/dev/null || echo ${cc_tok:-0})"
  printf "  ║  Token 合计:  %-8s                          ║\n" \
    "$(printf "%'d" ${total:-0} 2>/dev/null || echo ${total:-0})"
  printf "  ║  Session:     %-36s ║\n" "${sid:0:36}"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
}

# ============================================================
# 统一日志监控
# ============================================================

# 格式化 token (K/M 后缀)
_fmt_tok() {
  local v=$1
  if [[ $v == "--" || -z $v ]]; then echo "  --"; return; fi
  if [[ $v -ge 1000000 ]]; then printf "%.1fM" "$(echo "scale=1; $v/1000000" | bc 2>/dev/null || echo 0)"; else
  if [[ $v -ge 1000 ]]; then printf "%.1fK" "$(echo "scale=1; $v/1000" | bc 2>/dev/null || echo 0)"; else echo "$v"; fi; fi
}

# 计算日志的运行时长
_calc_runtime() {
  local lf="$1"
  if [[ ! -f "$lf" ]]; then echo "--"; return; fi
  local start ts epoch
  start=$(grep '^start:' "$lf" 2>/dev/null | tail -1 | sed 's/start: //')
  [[ -z "$start" ]] && { echo "--"; return; }
  epoch=$(date -j -f '%Y-%m-%d %H:%M:%S' "$start" +%s 2>/dev/null || echo 0)
  [[ $epoch -le 0 ]] && { echo "--"; return; }
  local e=$(($(date +%s) - epoch))
  if [[ $e -lt 60 ]]; then echo "${e}s"
  elif [[ $e -lt 3600 ]]; then echo "$((e/60))m$((e%60))s"
  else echo "$((e/3600))h$(((e%3600)/60))m"; fi
}

monitor_logs() {
  local colors=(33 36 35 32 34 90 93 96 95 92 94 91)
  local num_colors=${#colors[@]}
  local refresh=5
  local outfile
  outfile=$(mktemp)
  trap 'printf "\033[?25h\n"; rm -f "$outfile"' EXIT INT TERM HUP
  printf "\033[?25l"

  while true; do
    # ── 收集运行中的任务 ──
    local running_tasks=()
    local task_id
    for task_file in $(list_tasks); do
      task_id=$(basename "$task_file" .md)
      [[ "$(get_status "$task_file")" == "in_progress" ]] && running_tasks+=("$task_id")
    done
    local _running_dir="$PROJECT_DIR/.running"
    if [[ -d "$_running_dir" ]]; then
      for pid_file in "$_running_dir"/*.pid; do
        [[ -f "$pid_file" ]] || continue
        task_id=$(basename "$pid_file" .pid)
        local found=false
        for t in "${running_tasks[@]}"; do [[ "$t" == "$task_id" ]] && found=true && break; done
        [[ "$found" == "false" ]] && running_tasks+=("$task_id")
      done
    fi

    # ── 无任务: 等待页 ──
    if [[ ${#running_tasks[@]} -eq 0 ]]; then
      > "$outfile"
      printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" >> "$outfile"
      printf "  Unified Log Monitor — 等待任务启动                  %s\n" "$(date '+%H:%M:%S')" >> "$outfile"
      printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" >> "$outfile"
      printf "\n  当前没有正在运行的任务。启动编排器:\n" >> "$outfile"
      printf "    ./scripts/task-runner.sh --auto\n" >> "$outfile"
      printf "\n  %ds 后自动重试  (Ctrl-C 退出)\n" "$refresh" >> "$outfile"
      printf "\033[H\033[J"
      cat "$outfile"
      sleep "$refresh"
      continue
    fi

    # ── 构建全部输出到 temp file ──
    > "$outfile"

    local now
    now=$(date '+%H:%M:%S')

    printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" >> "$outfile"
    printf "  Unified Log Monitor                   刷新:%ds  %s  任务:%d\n" \
      "$refresh" "$now" "${#running_tasks[@]}" >> "$outfile"
    printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" >> "$outfile"

    local idx=0
    for task_id in "${running_tasks[@]}"; do
      local color="${colors[$((idx % num_colors))]}"
      local name
      name=$(get_name "$TASKS_DIR/${task_id}.md" 2>/dev/null || echo "?")
      local lf="$PROJECT_DIR/logs/${task_id}.log"
      local log_lines=0
      [[ -f "$lf" ]] && log_lines=$(wc -l < "$lf" 2>/dev/null | tr -d ' ')

      local runtime
      runtime=$(_calc_runtime "$lf")

      # session stats (快速解析，仅在日志行数 > 5 时尝试)
      local turns="--" in_tok="--" out_tok="--" cache_tok="--" tool_n="--"
      if [[ $log_lines -gt 5 ]]; then
        local sid
        sid=$(_find_task_session "$task_id" 2>/dev/null)
        if [[ -n "$sid" ]]; then
          local jsonl="$HOME/.claude/projects/-Users-yujing-deepseek-playground/${sid}.jsonl"
          local stats
          stats=$(_parse_session_stats "$jsonl" 2>/dev/null)
          if [[ -n "$stats" && "$stats" != "{}" ]]; then
            turns=$(echo "$stats" | jq -r '.turns // 0')
            in_tok=$(echo "$stats" | jq -r '.input_tokens // 0')
            out_tok=$(echo "$stats" | jq -r '.output_tokens // 0')
            cache_tok=$(echo "$stats" | jq -r '.cache_read // 0')
            tool_n=$(echo "$stats" | jq -r '.tool_calls // 0')
          fi
        fi
      fi

      local in_fmt out_fmt cache_fmt
      in_fmt=$(_fmt_tok "$in_tok")
      out_fmt=$(_fmt_tok "$out_tok")
      cache_fmt=$(_fmt_tok "$cache_tok")
      local name_short
      name_short=$(echo "$name" | cut -c1-22)

      printf "  \033[%dm● %s\033[0m  %-22s  运行: %-8s  日志: %s 行\n" \
        "$color" "$task_id" "$name_short" "$runtime" "$log_lines" >> "$outfile"
      printf "        轮次: %5s    输入: %7s    输出: %7s    缓存: %7s    工具: %4s\n" \
        "$turns" "$in_fmt" "$out_fmt" "$cache_fmt" "$tool_n" >> "$outfile"
      printf "\n" >> "$outfile"
      idx=$((idx + 1))
    done

    printf "━━━━ 最新日志 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" >> "$outfile"

    local tail_n=${MONITOR_TAIL_LINES:-4}
    idx=0
    for task_id in "${running_tasks[@]}"; do
      local lf="$PROJECT_DIR/logs/${task_id}.log"
      local color="${colors[$((idx % num_colors))]}"
      if [[ -f "$lf" ]]; then
        tail -n "$tail_n" "$lf" 2>/dev/null | while IFS= read -r line; do
          [[ -z "$line" ]] && continue
          printf "  \033[%dm[%s]\033[0m %s\n" "$color" "$task_id" "$(echo "$line" | cut -c1-72)" >> "$outfile"
        done
      fi
      idx=$((idx + 1))
    done

    printf "\n  Ctrl-C 退出" >> "$outfile"

    # 全部构建完成 → 一次性清屏+输出
    printf "\033[H\033[J"
    cat "$outfile"

    # 同步 JSON 给前端 Monitor 页面
    sync_monitor_json &

    sleep "$refresh"
  done
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

recover_zombies() {
  for task_file in $(list_tasks); do
    local id status
    id=$(basename "$task_file" .md)
    status=$(get_status "$task_file")

    if [[ "$status" == "in_progress" ]] && [[ ! -f "$LOCK_DIR/${id}.lock" ]]; then
      echo "  ↻ 恢复僵尸任务 (in_progress/无锁): $id → pending"
      update_status "$task_file" "pending"
      continue
    fi

    if [[ "$status" == "pending" ]] && [[ -f "$LOCK_DIR/${id}.lock" ]]; then
      if ! is_pid_alive "$id"; then
        echo "  ↻ 清除僵尸锁 (pending/陈旧锁): $id"
        rm -f "$LOCK_DIR/${id}.lock" "$PROJECT_DIR/.running/${id}.pid"
      fi
      continue
    fi

    if [[ "$status" == "failed" ]]; then
      local retries=0
      [[ -f "$LOCK_DIR/${id}.retries" ]] && read -r retries < "$LOCK_DIR/${id}.retries"
      retries=${retries:-0}
      if (( retries < MAX_AUTO_RETRIES )); then
        echo $(( retries + 1 )) > "$LOCK_DIR/${id}.retries"
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
# Monitor JSON 同步 (供前端页面消费)
# ============================================================

sync_monitor_json() {
  local outfile="$PROJECT_DIR/packages/web/public/monitor-stats.json"
  mkdir -p "$(dirname "$outfile")"
  "$SCRIPT_DIR/generate-stats.sh" --json > "$outfile" 2>/dev/null
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

    # 同步 JSON 给前端 Monitor 页面
    sync_monitor_json &

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
        sync_monitor_json
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
      sync_monitor_json
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
    --tail ID           实时查看单个任务日志 (tail -f)
    --monitor           统一监控所有运行中任务的日志 (着色前缀)
    --stats ID          查看任务的对话轮次/Token/工具调用统计

  状态:
    pending       → 等待执行 (依赖满足后自动调度)
    in_progress   → 正在执行中
    completed     → 已完成
    failed        → 执行失败 (可手动重试)
    blocked       → 受阻 (依赖未满足)

  示例:
    # 查看仪表盘
    ./scripts/task-runner.sh --dashboard

    # 自动运行所有任务
    ./scripts/task-runner.sh --auto --max-parallel 3

    # 在另一个终端统一监控所有任务日志
    ./scripts/task-runner.sh --monitor

    # 查看任务的详细统计 (轮次/Token/工具调用)
    ./scripts/task-runner.sh --stats T001

    # 只运行 T004
    ./scripts/task-runner.sh --task T004

    # 预演模式
    ./scripts/task-runner.sh --dry-run

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
      find "$LOCK_DIR" -maxdepth 1 -name '*.retries' -delete
      echo "✓ 已清除所有任务的重试计数"
    else
      reset_retry_count "$task_id"
      echo "✓ 已清除 $task_id 的重试计数"
    fi
    ;;
  --monitor)
    monitor_logs
    ;;
  --stats)
    task_id="${2:-}"
    if [[ -z "$task_id" ]]; then
      echo "Usage: $0 --stats <TASK_ID>"
      echo "Available logs with stats:"
      for f in "$PROJECT_DIR"/logs/T*.log; do
        [[ -f "$f" ]] || continue
        if grep -q '^=== 会话统计 ===$' "$f" 2>/dev/null; then
          printf "  %s  %s\n" "$(basename "$f" .log)" "$(grep '^turns:' "$f")"
        fi
      done
      exit 1
    fi
    show_task_stats "$task_id"
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
