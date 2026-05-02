#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

cd "$PROJECT_DIR"

# Prevent recursive invocation
if [ -f "$FLAG_FILE" ]; then
  exit 0
fi

HAS_CHANGES=false
[ -n "$(git status --porcelain 2>/dev/null)" ] && HAS_CHANGES=true

IN_WORKTREE=false
is_in_worktree && IN_WORKTREE=true

CURRENT_BRANCH=$(get_current_branch)
HAS_UNPUSHED=false
if [ -n "$CURRENT_BRANCH" ]; then
  if ! git merge-base --is-ancestor HEAD "origin/$CURRENT_BRANCH" 2>/dev/null; then
    HAS_UNPUSHED=true
  fi
fi

# ============================================================
# PATH A: Feature session wrap-up
# In worktree + feature-context.json exists
# ============================================================
if $IN_WORKTREE && [ -f "$CONTEXT_FILE" ]; then
  touch "$FLAG_FILE"

  # Load feature context
  CTX=$(load_feature_context)
  FEATURE_TITLE=$(echo "$CTX" | sed -n '1p')
  FEATURE_DESC=$(echo "$CTX" | sed -n '2p')
  FEATURE_TASK=$(echo "$CTX" | sed -n '3p')
  FEATURE_STATUS=$(echo "$CTX" | sed -n '4p')
  WORKTREE_PATH=$(get_worktree_root)

  echo "[session-stop] Feature session detected: $FEATURE_TITLE"

  # Get commits on this branch not on main (for PR body)
  COMMITS_LOG=""
  if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "main" ]; then
    COMMITS_LOG=$(git log --oneline main..HEAD 2>/dev/null || true)
  fi

  # Stage and commit if there are changes
  if $HAS_CHANGES; then
    echo "[session-stop] Staging and committing changes..."
    git add -A

    DIFF_STAT=$(git diff --cached --stat 2>/dev/null || echo "")
    DIFF_FILES=$(git diff --cached --name-only 2>/dev/null | head -30 || echo "")

    COMMIT_MSG=$(cat <<PROMPT | claude -p --output-format text 2>/dev/null | head -3
Generate a conventional git commit message for this feature change.

Feature: ${FEATURE_TITLE}
Task: ${FEATURE_TASK}
Description: ${FEATURE_DESC}

Files changed:
${DIFF_FILES}

Diff stat:
${DIFF_STAT}

Output ONLY the commit message, one line under 72 chars, using conventional commit format (feat:/fix:/refactor:/test:/docs:/chore:).
PROMPT
)

    if [ -z "$COMMIT_MSG" ]; then
      COMMIT_MSG="${FEATURE_TITLE}: implementation"
    fi

    git commit -m "$COMMIT_MSG" 2>/dev/null || echo "[session-stop] Note: nothing to commit"
  fi

  # Push branch
  if $HAS_CHANGES || $HAS_UNPUSHED; then
    echo "[session-stop] Pushing branch $CURRENT_BRANCH..."
    git push -u origin "$CURRENT_BRANCH" 2>/dev/null || \
      echo "[session-stop] Warning: push failed or branch already up to date"
  fi

  # Create PR if not abandoned
  if [ "$FEATURE_STATUS" != "abandoned" ]; then
    EXISTING_PR=""
    if command -v gh &>/dev/null; then
      EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --json url -q '.[0].url' 2>/dev/null || echo "")
    fi

    if [ -z "$EXISTING_PR" ]; then
      PR_TITLE="${FEATURE_TITLE}"
      [ -n "$FEATURE_TASK" ] && [ "$FEATURE_TASK" != "null" ] && PR_TITLE="[${FEATURE_TASK}] ${FEATURE_TITLE}"

      echo "[session-stop] Generating PR body..."
      PR_BODY=$(cat <<PROMPT | claude -p --output-format text 2>/dev/null
Generate a GitHub PR description in markdown.

Branch: ${CURRENT_BRANCH}
Title: ${PR_TITLE}
Task: ${FEATURE_TASK}
Description: ${FEATURE_DESC}

Commits on this branch:
${COMMITS_LOG:-"(no additional commits)"}

Format:
## Summary
<2-3 sentence overview of the feature and why it was added>

## Changes
- <file path>: <what changed and why>

## Test Plan
- [ ] <test item>

Output only the markdown body, no surrounding explanation.
PROMPT
)

      if [ -z "$PR_BODY" ]; then
        PR_BODY="## Summary

${FEATURE_DESC}

## Changes

See commits on branch \`${CURRENT_BRANCH}\`."
      fi

      echo "[session-stop] Creating PR: ${PR_TITLE}"
      gh pr create \
        --base main \
        --head "$CURRENT_BRANCH" \
        --title "$PR_TITLE" \
        --body "$PR_BODY" \
        2>/dev/null || echo "[session-stop] Warning: PR creation failed (may already exist or gh not configured)"
    else
      echo "[session-stop] PR already exists: $EXISTING_PR"
    fi
  fi

  # Clean up worktree
  cd "$PROJECT_DIR"
  if [ -n "$WORKTREE_PATH" ] && [ -d "$WORKTREE_PATH" ]; then
    echo "[session-stop] Removing worktree: $WORKTREE_PATH"
    git worktree remove "$WORKTREE_PATH" 2>/dev/null || \
      echo "[session-stop] Warning: could not remove worktree"
    git worktree prune 2>/dev/null || true
  fi

  # Clean up state files
  rm -f "$CONTEXT_FILE" "$STATE_FILE" "$FLAG_FILE"
  echo "[session-stop] Feature session complete: committed, pushed, PR created"
  exit 0
fi

# ============================================================
# PATH B: Non-feature auto-commit (quick fix on main, etc.)
# ============================================================
if ! $HAS_CHANGES; then
  exit 0
fi

touch "$FLAG_FILE"

DIFF_STAT=$(git diff --stat 2>/dev/null || echo "")
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | head -20 || echo "")

COMMIT_MSG=$(cat <<PROMPT | claude -p --output-format text 2>/dev/null | head -1
Write a concise git commit message (one line, under 72 chars, in English) summarizing these changes. Output ONLY the message, no explanation, no markdown:

Diff stat:
${DIFF_STAT:-"(no staged changes)"}

New/untracked files:
${UNTRACKED:-"(none)"}
PROMPT
)

if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="auto: $(git status --porcelain 2>/dev/null | head -5 | tr '\n' ' ' | cut -c1-60)"
fi

git add -A
git commit -m "$COMMIT_MSG" 2>/dev/null || true

rm -f "$FLAG_FILE"
