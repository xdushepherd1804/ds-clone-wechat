#!/bin/bash
# Usage: feature-context.sh --title "feat: description" --desc "Longer description" [--task T004] [--status in_progress]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTEXT_FILE="$SCRIPT_DIR/../feature-context.json"
STATE_FILE="$SCRIPT_DIR/../session-state.json"

TITLE=""
DESC=""
TASK="null"
STATUS="in_progress"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="$2"; shift 2 ;;
    --desc)  DESC="$2";  shift 2 ;;
    --task)  TASK="$2";  shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    *) echo "Usage: $0 --title <title> --desc <desc> [--task <id>] [--status <status>]" >&2; exit 1 ;;
  esac
done

if [ -z "$TITLE" ] || [ -z "$DESC" ]; then
  echo "Error: --title and --desc are required" >&2
  exit 1
fi

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$CONTEXT_FILE" <<CONTEXTEOF
{
  "title": "$TITLE",
  "description": "$DESC",
  "task_id": $TASK,
  "status": "$STATUS",
  "created_at": "$TIMESTAMP",
  "branch": "$BRANCH"
}
CONTEXTEOF

# Update session state to reflect feature mode
cat > "$STATE_FILE" <<STATEEOF
{
  "mode": "feature",
  "branch": "$BRANCH",
  "timestamp": "$TIMESTAMP",
  "is_worktree": true
}
STATEEOF

echo "Feature context written: $TITLE"
