#!/usr/bin/env bash
# =============================================================================
# deploy-tencent.sh — 腾讯云一键部署脚本
#
# 用法:
#   ./scripts/deploy-tencent.sh                    # 本地 docker compose 启动
#   ./scripts/deploy-tencent.sh --build            # 构建并启动
#   ./scripts/deploy-tencent.sh --build --push     # 构建 → 推送 TCR → 部署
#   ./scripts/deploy-tencent.sh --server <IP>      # 远程部署到指定 CVM
#
# 环境变量 (或写入 .env):
#   TCR_REGISTRY       腾讯云容器镜像仓库地址 (e.g. ccr.ccs.tencentyun.com/ns)
#   TCR_USERNAME       腾讯云 TCR 用户名
#   TCR_PASSWORD       腾讯云 TCR 密码
#   CVM_HOST           目标 CVM 公网 IP
#   CVM_USER           SSH 用户 (默认 root)
#   CVM_SSH_KEY        SSH 私钥路径 (默认 ~/.ssh/id_rsa)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# ── 默认值 ──────────────────────────────────────────────────────────────────
BUILD=false
PUSH=false
CVM_HOST="${CVM_HOST:-}"
CVM_USER="${CVM_USER:-root}"
CVM_SSH_KEY="${CVM_SSH_KEY:-$HOME/.ssh/id_rsa}"
TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
REGISTRY="${TCR_REGISTRY:-}"
REGISTRY_USER="${TCR_USERNAME:-}"
REGISTRY_PASS="${TCR_PASSWORD:-}"
SERVICES=("auth" "message" "contact" "group" "file" "moments" "search" "qrcode" "redpacket" "gateway" "web")

# ── 颜色 ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $* ━━━${NC}"; }

# ── 参数解析 ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)          BUILD=true; shift ;;
    --push)           PUSH=true; BUILD=true; shift ;;
    --server)         CVM_HOST="$2"; shift 2 ;;
    --user)           CVM_USER="$2"; shift 2 ;;
    --ssh-key)        CVM_SSH_KEY="$2"; shift 2 ;;
    --tag)            TAG="$2"; shift 2 ;;
    --registry)       REGISTRY="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--build] [--push] [--server <IP>] [--tag TAG]"
      echo ""
      echo "Options:"
      echo "  --build          构建 Docker 镜像"
      echo "  --push           构建并推送至腾讯云 TCR"
      echo "  --server <IP>    目标 CVM 公网 IP（启用远程部署）"
      echo "  --user <USER>    SSH 用户（默认 root）"
      echo "  --ssh-key <KEY>  SSH 私钥路径"
      echo "  --tag <TAG>      镜像标签（默认 git short hash）"
      echo "  --registry <URL> TCR 仓库地址"
      exit 0
      ;;
    *) err "未知参数: $1" ;;
  esac
done

# ── 远程执行 helper ─────────────────────────────────────────────────────────
remote() {
  if [[ -n "$CVM_HOST" ]]; then
    ssh -i "$CVM_SSH_KEY" -o StrictHostKeyChecking=no "${CVM_USER}@${CVM_HOST}" "$@"
  else
    eval "$@"
  fi
}

# ── 1. 构建镜像 ─────────────────────────────────────────────────────────────
build_images() {
  step "1/5 构建 Docker 镜像"

  if [[ "$PUSH" == "true" ]] && [[ -z "$REGISTRY" ]]; then
    err "推送镜像需要设置 TCR_REGISTRY 环境变量"
  fi

  local image_prefix
  if [[ -n "$REGISTRY" ]]; then
    image_prefix="${REGISTRY}/wechat-clone"
    log "登录 TCR..."
    echo "$REGISTRY_PASS" | docker login "${REGISTRY%%/*}" --username "$REGISTRY_USER" --password-stdin
  else
    image_prefix="wechat-clone"
  fi

  for svc in "${SERVICES[@]}"; do
    local target="$svc"
    [[ "$svc" == "gateway" ]] && target="gateway"
    [[ "$svc" == "web" ]] && target="web"

    local image="${image_prefix}-${svc}:${TAG}"
    log "构建 ${image}..."
    docker build --target "$target" -t "$image" .

    if [[ "$PUSH" == "true" ]]; then
      log "推送 ${image}..."
      docker push "$image"
    fi
  done

  log "全部镜像构建完成"
}

# ── 2. 初始化服务器 ─────────────────────────────────────────────────────────
init_server() {
  step "2/5 初始化服务器环境"

  remote 'bash -s' <<'INIT'
set -euo pipefail

if ! command -v docker &>/dev/null; then
  echo "[INFO] 安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version &>/dev/null; then
  echo "[INFO] 安装 Docker Compose 插件..."
  DOCKER_CONFIG=${DOCKER_CONFIG:-/usr/local/lib/docker/cli-plugins}
  mkdir -p "$DOCKER_CONFIG"
  ARCH=$(uname -m)
  curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" \
    -o "$DOCKER_CONFIG/docker-compose"
  chmod +x "$DOCKER_CONFIG/docker-compose"
fi

command -v git &>/dev/null || (apt-get update -qq && apt-get install -y -qq git)

echo "[INFO] Docker $(docker --version)"
echo "[INFO] Docker Compose $(docker compose version)"
INIT

  log "服务器初始化完成"
}

# ── 3. 部署应用 ─────────────────────────────────────────────────────────────
deploy_app() {
  step "3/5 部署应用"

  remote 'bash -s' -- "$TAG" "$REGISTRY" <<'DEPLOY'
TAG="$1"
REGISTRY="$2"
APP_DIR="/opt/wechat-clone"
mkdir -p "$APP_DIR"

if [ ! -f "$APP_DIR/docker-compose.yml" ]; then
  echo "[INFO] 拉取项目配置..."
  git clone --depth 1 https://gitee.com/xdushepherd91/ds-clone-wechat.git /tmp/wechat-clone-tmp
  cp /tmp/wechat-clone-tmp/docker-compose.yml "$APP_DIR/"
  cp /tmp/wechat-clone-tmp/docker/nginx/nginx.conf "$APP_DIR/"
  cp -r /tmp/wechat-clone-tmp/config/ "$APP_DIR/" 2>/dev/null || true
  rm -rf /tmp/wechat-clone-tmp
fi

cd "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  echo "[INFO] 生成 .env..."
  cat > "$APP_DIR/.env" <<ENVFILE
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 64)
POSTGRES_USER=wechat
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=wechat
MONGO_INITDB_ROOT_USERNAME=wechat
MONGO_INITDB_ROOT_PASSWORD=$(openssl rand -hex 16)
ENVFILE
  echo "[WARN] 请检查并修改 $APP_DIR/.env 中的敏感信息"
fi

if [ -n "$REGISTRY" ]; then
  echo "[INFO] 使用预构建镜像: ${REGISTRY}/wechat-clone-*:${TAG}"
  cat > "$APP_DIR/docker-compose.override.yml" <<OVERRIDE
services:
  auth:
    image: ${REGISTRY}/wechat-clone-auth:${TAG}
    build: !reset null
  message:
    image: ${REGISTRY}/wechat-clone-message:${TAG}
    build: !reset null
  contact:
    image: ${REGISTRY}/wechat-clone-contact:${TAG}
    build: !reset null
  group:
    image: ${REGISTRY}/wechat-clone-group:${TAG}
    build: !reset null
  file:
    image: ${REGISTRY}/wechat-clone-file:${TAG}
    build: !reset null
  moments:
    image: ${REGISTRY}/wechat-clone-moments:${TAG}
    build: !reset null
  search:
    image: ${REGISTRY}/wechat-clone-search:${TAG}
    build: !reset null
  qrcode:
    image: ${REGISTRY}/wechat-clone-qrcode:${TAG}
    build: !reset null
  redpacket:
    image: ${REGISTRY}/wechat-clone-redpacket:${TAG}
    build: !reset null
  api-gateway:
    image: ${REGISTRY}/wechat-clone-gateway:${TAG}
    build: !reset null
  web:
    image: ${REGISTRY}/wechat-clone-web:${TAG}
    build: !reset null
OVERRIDE
fi

echo "[INFO] 拉取镜像并启动服务..."
docker compose -f docker-compose.yml ${REGISTRY:+-f docker-compose.override.yml} up -d
DEPLOY

  log "应用部署完成"
}

# ── 4. 数据库初始化与等待 ───────────────────────────────────────────────────
wait_infra() {
  step "4/5 等待基础设施就绪"

  remote 'bash -s' <<'WAIT'
APP_DIR="/opt/wechat-clone"
cd "$APP_DIR"

wait_for() {
  local name="$1" cmd="$2" attempts="${3:-30}"
  echo "[INFO] 等待 ${name} 就绪..."
  for i in $(seq 1 $attempts); do
    if eval "$cmd" &>/dev/null; then
      echo "[INFO] ${name} 已就绪"
      return 0
    fi
    sleep 2
  done
  echo "[WARN] ${name} 可能未就绪"
}

wait_for "PostgreSQL" "docker exec wc-postgres pg_isready -U wechat -d wechat" 30
wait_for "MongoDB"    "docker exec wc-mongo mongosh --eval 'db.adminCommand(\"ping\")'" 30
wait_for "Redis"      "docker exec wc-redis redis-cli ping" 15
WAIT

  log "基础设施就绪"
}

# ── 5. 健康检查 ─────────────────────────────────────────────────────────────
health_check() {
  step "5/5 健康检查"

  remote 'bash -s' <<'HEALTH'
APP_DIR="/opt/wechat-clone"
cd "$APP_DIR"

CONTAINERS=("wc-auth" "wc-message" "wc-contact" "wc-group" "wc-file" "wc-moments" "wc-search" "wc-qrcode" "wc-redpacket" "wc-api-gateway" "wc-web")
ALL_OK=true

for c in "${CONTAINERS[@]}"; do
  STATUS=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo "missing")
  HEALTH=$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null || echo "none")

  if [[ "$STATUS" == "running" ]]; then
    if [[ "$HEALTH" == "healthy" ]] || [[ "$HEALTH" == "none" ]]; then
      echo "[OK]    $c  → $STATUS ($HEALTH)"
    else
      echo "[WARN]  $c  → $STATUS ($HEALTH)"
      ALL_OK=false
    fi
  else
    echo "[FAIL]  $c  → $STATUS"
    ALL_OK=false
  fi
done

echo ""
if $ALL_OK; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  echo "============================================"
  echo "  部署成功！"
  echo "  前端:     http://${IP}:8080"
  echo "  API 网关: http://${IP}:3000"
  echo "============================================"
else
  echo "部分服务异常，排查: docker compose -f /opt/wechat-clone/docker-compose.yml logs"
fi
HEALTH

  log "健康检查完成"
}

# ── 主流程 ──────────────────────────────────────────────────────────────────
main() {
  echo "=============================================="
  echo "  微信克隆 - 腾讯云部署脚本"
  echo "=============================================="
  echo "  模式:     $([ -n "$CVM_HOST" ] && echo "远程部署 → ${CVM_HOST}" || echo "本地部署")"
  echo "  构建:     $($BUILD && echo '是' || echo '否（使用已有镜像）')"
  echo "  推送 TCR: $($PUSH && echo '是' || echo '否')"
  echo "  标签:     $TAG"
  echo ""

  if $BUILD; then
    build_images
  fi

  if [[ -n "$CVM_HOST" ]]; then
    init_server
    log "同步配置文件到服务器..."
    ssh -i "$CVM_SSH_KEY" -o StrictHostKeyChecking=no "${CVM_USER}@${CVM_HOST}" "mkdir -p /opt/wechat-clone"
    scp -i "$CVM_SSH_KEY" -o StrictHostKeyChecking=no \
      "$PROJECT_DIR/docker-compose.yml" \
      "$PROJECT_DIR/docker/nginx/nginx.conf" \
      "${CVM_USER}@${CVM_HOST}:/opt/wechat-clone/"
    scp -i "$CVM_SSH_KEY" -o StrictHostKeyChecking=no -r \
      "$PROJECT_DIR/config" \
      "${CVM_USER}@${CVM_HOST}:/opt/wechat-clone/" 2>/dev/null || true
  fi

  deploy_app
  wait_infra
  health_check
}

main
