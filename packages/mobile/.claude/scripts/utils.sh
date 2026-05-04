#!/bin/bash
# Shared utilities for feature-workflow scripts.
# Source with: source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"
set -euo pipefail

PROJECT_DIR="/Users/yujing/deepseek-playground"
STATE_FILE="$PROJECT_DIR/.claude/session-state.json"
CONTEXT_FILE="$PROJECT_DIR/.claude/feature-context.json"
CONFIG_FILE="$PROJECT_DIR/.claude/feature-workflow.json"
FLAG_FILE="$PROJECT_DIR/.claude/committing"

is_in_worktree() {
  git rev-parse --git-common-dir 2>/dev/null | grep -qc '.claude/worktrees'
}

get_worktree_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

get_current_branch() {
  git branch --show-current 2>/dev/null
}

write_session_state() {
  local mode="$1"
  local branch="${2:-$(get_current_branch)}"
  local in_wt="false"
  is_in_worktree && in_wt="true"
  cat > "$STATE_FILE" <<STATEEOF
{
  "mode": "$mode",
  "branch": "$branch",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "is_worktree": $in_wt
}
STATEEOF
}

read_state_value() {
  local key="$1"
  python3 -c "
import json,sys
try:
    d=json.load(open('$STATE_FILE'))
    print(d.get('$key',''))
except: sys.exit(1)
" 2>/dev/null || echo ""
}

load_feature_context() {
  if [ ! -f "$CONTEXT_FILE" ]; then
    echo ""
    return
  fi
  python3 -c "
import json
d=json.load(open('$CONTEXT_FILE'))
print(d.get('title',''))
print(d.get('description',''))
print(d.get('task_id','') or '')
print(d.get('status','in_progress'))
print(d.get('branch',''))
" 2>/dev/null
}

build_diff_summary() {
  local stat staged untracked
  stat=$(git diff --stat 2>/dev/null || echo "")
  staged=$(git diff --cached --stat 2>/dev/null || echo "")
  untracked=$(git ls-files --others --exclude-standard 2>/dev/null | head -20 || echo "")
  cat <<PROMPT
Diff stat:
${stat:-"(none)"}

Staged:
${staged:-"(none)"}

New files:
${untracked:-"(none)"}
PROMPT
}

load_config() {
  REMOTE="origin"
  BASE_BRANCH="main"
  AUTO_PR="true"
  if [ -f "$CONFIG_FILE" ]; then
    eval "$(python3 -c "
import json
c=json.load(open('$CONFIG_FILE'))
print(f'REMOTE={c.get(\"push_remote\",\"origin\")}')
print(f'BASE_BRANCH={c.get(\"base_branch\",\"main\")}')
print(f'AUTO_PR={\"true\" if c.get(\"auto_create_pr\",True) else \"false\"}')" 2>/dev/null)"
  fi
}
