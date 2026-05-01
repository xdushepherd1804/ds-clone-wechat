#!/usr/bin/env bash
#
# generate-stats.sh — 生成任务统计 JSON 供 Monitor 页面消费
#
# 输出: packages/web/public/monitor-stats.json
#
# 用法:
#   ./scripts/generate-stats.sh          # 生成并写入 public 目录
#   ./scripts/generate-stats.sh --json   # 仅输出 JSON 到 stdout
#   ./scripts/generate-stats.sh --watch  # 每 10s 刷新一次

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TASKS_DIR="$PROJECT_DIR/tasks"
LOGS_DIR="$PROJECT_DIR/logs"
OUTPUT_FILE="$PROJECT_DIR/packages/web/public/monitor-stats.json"
WATCH_INTERVAL="${WATCH_INTERVAL:-10}"

# ─── 解析 frontmatter ────────────────────────────────────────────────────────
parse_frontmatter() {
  local file="$1" field="$2"
  awk -v f="$field" '
    /^---$/ { fm++; next }
    fm==1 && $1 == f":" { $1=""; sub(/^[[:space:]]+/, ""); print }
    fm==2 { exit }
  ' "$file"
}

get_status()  { parse_frontmatter "$1" "status" | tr -d ' '; }
get_name()    { parse_frontmatter "$1" "name" | tr -d '"'; }
get_phase()   { parse_frontmatter "$1" "phase" | tr -d ' '; }
get_priority(){ parse_frontmatter "$1" "priority" | tr -d ' '; }
get_agent()   { parse_frontmatter "$1" "agent" | tr -d ' '; }
get_deps()    { parse_frontmatter "$1" "dependencies" | tr -d '[]" ' | tr ',' '\n' | grep -v '^$' || true; }

# ─── 格式化 token ─────────────────────────────────────────────────────────────
fmt_tok() {
  local v=$1
  [[ -z "$v" || "$v" == "--" ]] && { printf 'null'; return; }
  printf '%d' "$v"
}

# ─── 查找任务的 session ────────────────────────────────────────────────────────
find_task_session() {
  local task_id="$1"
  local sessions_dir="$HOME/.claude/sessions"
  [[ -d "$sessions_dir" ]] || { echo ""; return; }

  local best_session="" best_time=0
  for sf in "$sessions_dir"/*.json; do
    [[ -f "$sf" ]] || continue
    local cwd entry started
    read -r cwd entry started <<< "$(jq -r '[.cwd//"",.entrypoint//"",.startedAt//0]|@tsv' "$sf" 2>/dev/null)"
    [[ "$cwd" == "$PROJECT_DIR" ]] || continue
    [[ "$entry" == "sdk-cli" ]] || continue
    [[ $started -gt $best_time ]] || continue
    best_time=$started
    best_session=$(jq -r '.sessionId//empty' "$sf" 2>/dev/null)
  done

  [[ -n "$best_session" ]] || { echo ""; return; }

  local jsonl="$HOME/.claude/projects/-Users-yujing-deepseek-playground/${best_session}.jsonl"
  [[ -f "$jsonl" ]] || { echo ""; return; }

  local check
  check=$(head -20 "$jsonl" | jq -r 'select(.type=="user")|.message.content//empty' 2>/dev/null | head -1)
  [[ "$check" == *"$task_id"* ]] || { echo ""; return; }

  echo "$best_session"
}

# ─── 从 JSONL 解析统计数据 ────────────────────────────────────────────────────
parse_session_stats() {
  local jsonl="$1"
  [[ -f "$jsonl" ]] || { echo "{}"; return; }

  jq -r '
    select(.type == "assistant") |
    { u: (.message.usage // {}), tc: ([.message.content[]? | select(.type == "tool_use")] | length) }
  ' "$jsonl" 2>/dev/null | jq -s '
    {
      turns: length,
      input_tokens: (map(.u.input_tokens // 0) | add),
      output_tokens: (map(.u.output_tokens // 0) | add),
      cache_read: (map(.u.cache_read_input_tokens // 0) | add),
      cache_creation: (map(.u.cache_creation_input_tokens // 0) | add),
      tool_calls: (map(.tc) | add)
    } | .total_tokens = (.input_tokens + .output_tokens + .cache_read + .cache_creation)
  ' 2>/dev/null
}

# ─── 从日志提取统计 ──────────────────────────────────────────────────────────
extract_log_stats() {
  local task_id="$1"
  local log_file="$LOGS_DIR/${task_id}.log"
  local result='{"turns":null,"input_tokens":null,"output_tokens":null,"cache_read":null,"cache_creation":null,"total_tokens":null,"tool_calls":null}'

  [[ -f "$log_file" ]] || { echo "$result"; return; }

  # 优先从日志中的 === 会话统计 === 段落提取
  local section
  section=$(sed -n '/^=== 会话统计 ===$/,/^$/p' "$log_file" 2>/dev/null)
  if [[ -n "$section" ]]; then
    local turns in_tok out_tok cr_tok cc_tok tc total
    turns=$(echo "$section" | grep '^turns:' | cut -d' ' -f2)
    tc=$(echo "$section" | grep '^tool_calls:' | cut -d' ' -f2)
    in_tok=$(echo "$section" | grep '^input_tokens:' | cut -d' ' -f2)
    out_tok=$(echo "$section" | grep '^output_tokens:' | cut -d' ' -f2)
    cr_tok=$(echo "$section" | grep '^cache_read_tokens:' | cut -d' ' -f2)
    cc_tok=$(echo "$section" | grep '^cache_creation_tokens:' | cut -d' ' -f2)
    total=$(echo "$section" | grep '^total_tokens:' | cut -d' ' -f2)
    jq -n \
      --argjson turns "${turns:-null}" \
      --argjson in_tok "$(fmt_tok "$in_tok")" \
      --argjson out_tok "$(fmt_tok "$out_tok")" \
      --argjson cr_tok "$(fmt_tok "$cr_tok")" \
      --argjson cc_tok "$(fmt_tok "$cc_tok")" \
      --argjson total "$(fmt_tok "$total")" \
      --argjson tc "${tc:-null}" \
      '{turns:$turns,input_tokens:$in_tok,output_tokens:$out_tok,cache_read:$cr_tok,cache_creation:$cc_tok,total_tokens:$total,tool_calls:$tc}'
    return
  fi

  # 回退: 从 session JSONL 实时解析
  local sid
  sid=$(find_task_session "$task_id" 2>/dev/null)
  if [[ -n "$sid" ]]; then
    local jsonl="$HOME/.claude/projects/-Users-yujing-deepseek-playground/${sid}.jsonl"
    parse_session_stats "$jsonl"
    return
  fi

  echo "$result"
}

# ─── 计算运行时长 ────────────────────────────────────────────────────────────
calc_runtime() {
  local task_id="$1"
  local log_file="$LOGS_DIR/${task_id}.log"

  [[ -f "$log_file" ]] || { echo "null"; return; }

  local start
  start=$(grep '^start:' "$log_file" 2>/dev/null | tail -1 | sed 's/start: //')
  [[ -z "$start" ]] && { echo "null"; return; }

  local epoch
  epoch=$(date -j -f '%Y-%m-%d %H:%M:%S' "$start" +%s 2>/dev/null || echo 0)
  [[ $epoch -le 0 ]] && { echo "null"; return; }

  echo $(( $(date +%s) - epoch ))
}

# ─── 主逻辑: 生成完整 JSON ───────────────────────────────────────────────────
generate_json() {
  local first=true

  printf '{\n'
  printf '  "generated_at": "%s",\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '  "generated_ts": %d,\n' "$(date +%s)"
  printf '  "tasks": [\n'

  local task_files
  task_files=$(find "$TASKS_DIR" -maxdepth 1 -name 'T*.md' -not -name 'INDEX.md' | sort)

  local total_tasks=0
  for tf in $task_files; do
    local id=$(basename "$tf" .md)
    local status=$(get_status "$tf")
    local name=$(get_name "$tf")
    local phase=$(get_phase "$tf")
    local priority=$(get_priority "$tf")
    local agent=$(get_agent "$tf")

    # 收集依赖及其状态
    local deps_json="["
    local dep_first=true
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      local dep_status="unknown"
      local dep_file="$TASKS_DIR/${dep}.md"
      [[ -f "$dep_file" ]] && dep_status=$(get_status "$dep_file")
      $dep_first || deps_json+=","
      deps_json+="{\"id\":\"$dep\",\"status\":\"$dep_status\"}"
      dep_first=false
    done < <(get_deps "$tf")
    deps_json+="]"

    # 提取 token 统计
    local stats
    stats=$(extract_log_stats "$id")

    # 运行时长
    local runtime
    runtime=$(calc_runtime "$id")

    $first || printf ',\n'
    first=false

    printf '    {\n'
    printf '      "id": "%s",\n' "$id"
    printf '      "name": "%s",\n' "${name//\"/\\\"}"
    printf '      "status": "%s",\n' "$status"
    printf '      "phase": "%s",\n' "$phase"
    printf '      "priority": "%s",\n' "$priority"
    printf '      "agent": "%s",\n' "$agent"
    printf '      "dependencies": %s,\n' "$deps_json"
    printf '      "runtime_seconds": %s,\n' "$runtime"
    printf '      "stats": %s\n' "$stats"
    printf '    }'
    total_tasks=$((total_tasks + 1))
  done

  printf '\n  ],\n'

  # 汇总统计
  printf '  "summary": {\n'
  printf '    "total_tasks": %d,\n' "$total_tasks"

  local cnt_pending=0 cnt_in_progress=0 cnt_completed=0 cnt_failed=0 cnt_blocked=0
  for tf in $task_files; do
    local s=$(get_status "$tf")
    case "$s" in
      pending)
        local blocked=true
        while IFS= read -r dep; do
          [[ -z "$dep" ]] && continue
          local ds=$(get_status "$TASKS_DIR/${dep}.md" 2>/dev/null || echo "unknown")
          [[ "$ds" != "completed" ]] && blocked=true && break
          blocked=false
        done < <(get_deps "$tf")
        if [[ "$blocked" == "true" ]]; then
          cnt_blocked=$((cnt_blocked + 1))
        else
          cnt_pending=$((cnt_pending + 1))
        fi
        ;;
      in_progress) cnt_in_progress=$((cnt_in_progress + 1)) ;;
      completed) cnt_completed=$((cnt_completed + 1)) ;;
      failed) cnt_failed=$((cnt_failed + 1)) ;;
    esac
  done

  printf '    "pending": %d,\n' "$cnt_pending"
  printf '    "in_progress": %d,\n' "$cnt_in_progress"
  printf '    "completed": %d,\n' "$cnt_completed"
  printf '    "failed": %d,\n' "$cnt_failed"
  printf '    "blocked": %d,\n' "$cnt_blocked"

  local pct=0
  [[ $total_tasks -gt 0 ]] && pct=$(( cnt_completed * 100 / total_tasks ))
  printf '    "progress_pct": %d\n' "$pct"
  printf '  }\n'
  printf '}\n'
}

# ─── 命令分发 ──────────────────────────────────────────────────────────────────

case "${1:-}" in
  --json)
    cd "$PROJECT_DIR"
    generate_json
    ;;
  --watch)
    shift 2>/dev/null || true
    while true; do
      clear 2>/dev/null || true
      echo "════════════════════════════════════════════════════════════"
      echo "  Monitor Stats — 刷新间隔: ${WATCH_INTERVAL}s"
      echo "  输出: $OUTPUT_FILE"
      echo "════════════════════════════════════════════════════════════"
      cd "$PROJECT_DIR"
      mkdir -p "$(dirname "$OUTPUT_FILE")"
      generate_json > "$OUTPUT_FILE"
      echo "  ✓ 已生成 $(wc -c < "$OUTPUT_FILE") bytes"
      echo "  → $(date '+%Y-%m-%d %H:%M:%S')"
      sleep "$WATCH_INTERVAL"
    done
    ;;
  *)
    cd "$PROJECT_DIR"
    mkdir -p "$(dirname "$OUTPUT_FILE")"
    generate_json > "$OUTPUT_FILE"
    echo "✓ 统计已生成: $OUTPUT_FILE ($(wc -c < "$OUTPUT_FILE") bytes)"
    ;;
esac
