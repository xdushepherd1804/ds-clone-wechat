#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

cd "$PROJECT_DIR"

# Load config for BASE_BRANCH setting
load_config

CURRENT_BRANCH=$(get_current_branch)

# Prune stale worktree admin data from previous sessions
git worktree prune 2>/dev/null || true

if [ "$CURRENT_BRANCH" = "$BASE_BRANCH" ]; then
  echo "[session-start] On $BASE_BRANCH, pulling latest..."
  git pull --ff-only "$REMOTE" "$BASE_BRANCH" 2>/dev/null || \
    echo "[session-start] Warning: could not fast-forward pull $BASE_BRANCH"
  write_session_state "standby" "$CURRENT_BRANCH"
else
  echo "[session-start] On branch '$CURRENT_BRANCH' (not $BASE_BRANCH)"
  write_session_state "continue" "$CURRENT_BRANCH"
fi

# If feature-context.json exists from an interrupted session, flag it
if [ -f "$CONTEXT_FILE" ]; then
  echo "[session-start] Found existing feature context -- interrupted session may be resumable"
fi
