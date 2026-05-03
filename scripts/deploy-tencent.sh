#!/usr/bin/env bash
# =============================================================================
# deploy-tencent.sh — 本地一键远程部署入口
#
# 用法:
#   ./scripts/deploy-tencent.sh <CVM_IP>              # 首次部署
#   ./scripts/deploy-tencent.sh <CVM_IP> --update     # 更新部署
#   ./scripts/deploy-tencent.sh <CVM_IP> --init-only  # 仅初始化环境
#
# 环境变量:
#   CVM_USER       SSH 用户 (默认 root)
#   CVM_SSH_KEY    SSH 私钥路径 (默认 ~/.ssh/id_rsa)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*"; exit 1; }
step() { echo -e "\n${BLUE}==>${NC} $*"; }

CVM_USER="${CVM_USER:-root}"
CVM_SSH_KEY="${CVM_SSH_KEY:-$HOME/.ssh/id_rsa}"
INIT_ONLY=false
DEPLOY_ARGS=""

# ── 参数解析 ────────────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <CVM_IP> [--update] [--branch NAME] [--init-only]"
  echo ""
  echo "  CVM_IP        腾讯云 CVM 公网 IP（必填）"
  echo "  --update      更新部署（git pull + rebuild）"
  echo "  --branch NAME  指定分支 (默认 main)"
  echo "  --init-only   仅初始化环境，不部署服务"
  exit 1
fi

CVM_HOST="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update)     DEPLOY_ARGS="--update"; shift ;;
    --branch)     DEPLOY_ARGS="$DEPLOY_ARGS --branch $2"; shift 2 ;;
    --init-only)  INIT_ONLY=true; shift ;;
    *) shift ;;
  esac
done

SSH="ssh -i ${CVM_SSH_KEY} -o StrictHostKeyChecking=no ${CVM_USER}@${CVM_HOST}"
SCP="scp -i ${CVM_SSH_KEY} -o StrictHostKeyChecking=no"

# ── 1. 上传脚本到 CVM ──────────────────────────────────────────────────────
step "上传部署脚本到 CVM"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

$SSH "mkdir -p /opt/scripts"
$SCP "$PROJECT_DIR/scripts/cvm-init.sh"   "${CVM_USER}@${CVM_HOST}:/opt/scripts/"
$SCP "$PROJECT_DIR/scripts/cvm-deploy.sh" "${CVM_USER}@${CVM_HOST}:/opt/scripts/"
$SSH "chmod +x /opt/scripts/*.sh"
log "脚本已上传"

# ── 2. 初始化环境 ──────────────────────────────────────────────────────────
step "初始化 CVM 环境"
$SSH "bash /opt/scripts/cvm-init.sh"
log "环境初始化完成"

# ── 3. 部署服务 ────────────────────────────────────────────────────────────
if $INIT_ONLY; then
  echo ""
  log "仅初始化模式，跳过部署。"
  log "需要部署时执行: ssh ${CVM_USER}@${CVM_HOST} bash /opt/scripts/cvm-deploy.sh"
else
  step "部署服务"
  $SSH "bash /opt/scripts/cvm-deploy.sh ${DEPLOY_ARGS}"
fi
