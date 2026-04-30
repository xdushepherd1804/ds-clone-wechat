#!/bin/bash
set -euo pipefail

FLAG_FILE="/Users/yujing/deepseek-playground/.claude/committing"

# 防止递归：如果正在提交中，跳过
if [ -f "$FLAG_FILE" ]; then
  exit 0
fi

cd /Users/yujing/deepseek-playground

# 没有变更则跳过
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

touch "$FLAG_FILE"

# 加载 ccd 环境变量
source ~/.claude/ccd.sh 2>/dev/null || true

# 生成 diff 摘要
DIFF_STAT=$(git diff --stat 2>/dev/null || echo "")
UNTRACKED=$(git ls-files --others --exclude-standard | head -20)
STAGED=$(git diff --cached --stat 2>/dev/null || echo "")

# 用 ccd 生成 commit message
PROMPT="Write a concise git commit message (one line, under 72 chars, in English) summarizing these changes. Output ONLY the message, no explanation, no markdown:

Diff stat:
${DIFF_STAT:-"(no staged changes)"}

New/untracked files:
${UNTRACKED:-"(none)"}"

COMMIT_MSG=$(echo "$PROMPT" | claude -p --output-format text 2>/dev/null | head -1)

# 如果 ccd 生成失败，使用 fallback
if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="auto: $(git status --porcelain | head -5 | tr '\n' ' ' | cut -c1-60)"
fi

git add -A
git commit -m "$COMMIT_MSG" 2>/dev/null || true

rm -f "$FLAG_FILE"
