#!/usr/bin/env bash
# =============================================================================
# cvm-deploy.sh — 克隆仓库 + 构建镜像 + 启动全部服务
#
# 前置条件: 已执行 cvm-init.sh（Docker 环境就绪）
#
# 用法（在 CVM 上）:
#   bash scripts/cvm-deploy.sh                  # 首次部署（git clone）
#   bash scripts/cvm-deploy.sh --update         # 更新部署（git pull + 重建）
#   bash scripts/cvm-deploy.sh --branch dev     # 指定分支
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC}  $*"; }
warn() { echo -e "${YELLOW}[!!]${NC}  $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*"; exit 1; }
step() { echo -e "\n${BLUE}==>${NC} $*"; }

# ── 参数 ────────────────────────────────────────────────────────────────────
GIT_REPO="${GIT_REPO:-https://gitee.com/xdushepherd91/ds-clone-wechat.git}"
APP_DIR="/opt/wechat-clone"
BRANCH="${BRANCH:-main}"
UPDATE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --update) UPDATE=true; shift ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --repo)   GIT_REPO="$2"; shift 2 ;;
    --dir)    APP_DIR="$2"; shift 2 ;;
    *) echo "Usage: $0 [--update] [--branch NAME] [--repo URL] [--dir PATH]"; exit 1 ;;
  esac
done

# ── 1. 同步代码 ─────────────────────────────────────────────────────────────
sync_code() {
  step "1/5 同步代码"

  if [ -d "$APP_DIR/.git" ]; then
    log "仓库已存在，拉取最新代码..."
    cd "$APP_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git reset --hard "origin/$BRANCH"
    log "代码已更新: $(git log -1 --oneline)"
  else
    log "克隆仓库..."
    git clone --branch "$BRANCH" --depth 1 "$GIT_REPO" "$APP_DIR"
    cd "$APP_DIR"
    log "克隆完成: $(git log -1 --oneline)"
  fi
}

# ── 2. 生成配置 ─────────────────────────────────────────────────────────────
gen_config() {
  step "2/5 生成配置文件"

  cd "$APP_DIR"

  if [ ! -f "$APP_DIR/.env" ]; then
    log "生成 .env ..."
    cat > "$APP_DIR/.env" <<ENVFILE
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 64)
POSTGRES_USER=wechat
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=wechat
MONGO_INITDB_ROOT_USERNAME=wechat
MONGO_INITDB_ROOT_PASSWORD=$(openssl rand -hex 16)
ENVFILE
    warn ".env 已自动生成，请按需修改: $APP_DIR/.env"
  else
    log ".env 已存在，跳过"
  fi
}

# ── 3. 构建镜像 ─────────────────────────────────────────────────────────────
build_images() {
  step "3/5 构建镜像"

  cd "$APP_DIR"

  local targets=("auth" "message" "contact" "group" "file" "moments" "search" "qrcode" "redpacket" "gateway" "web-build")

  for target in "${targets[@]}"; do
    log "构建目标: $target"
    docker build --target "$target" -t "wechat-clone-${target}:latest" .
  done

  # web 阶段从前一步 web-build 产物 COPY，也需单独构建
  log "构建目标: web"
  docker build --target web -t "wechat-clone-web:latest" .

  log "全部镜像构建完成"
}

# ── 4. 启动服务 ─────────────────────────────────────────────────────────────
start_services() {
  step "4/5 启动服务"

  cd "$APP_DIR"

  docker compose down --remove-orphans 2>/dev/null || true

  log "拉取基础设施镜像..."
  docker pull postgres:16-alpine &
  docker pull redis:7-alpine &
  docker pull mongo:7 &
  wait

  log "启动全部服务..."
  docker compose up -d --build

  log "服务已启动"
}

# ── 5. 等待就绪 + 健康检查 ─────────────────────────────────────────────────
wait_ready() {
  step "5/5 等待服务就绪"

  cd "$APP_DIR"

  wait_for() {
    local name="$1" cmd="$2" attempts="${3:-30}"
    echo -n "  等待 ${name} "
    for i in $(seq 1 $attempts); do
      if eval "$cmd" &>/dev/null; then
        echo " ✓"
        return 0
      fi
      echo -n "."
      sleep 2
    done
    echo " ⚠ 超时"
  }

  wait_for "PostgreSQL" "docker exec wc-postgres pg_isready -U wechat -d wechat" 30
  wait_for "MongoDB"    "docker exec wc-mongo mongosh --eval 'db.adminCommand(\"ping\")'" 30
  wait_for "Redis"      "docker exec wc-redis redis-cli ping" 15

  echo ""
  echo "容器状态:"
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps

  echo ""
  local failing=$(docker compose ps --format json 2>/dev/null | grep -v '"Health":"healthy"' | grep -v '"State":"running"' || true)
  if [ -z "$failing" ]; then
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    log "=========================================="
    log "  部署成功！"
    log "  Web 前端:  http://${IP}:8080"
    log "  API 网关:  http://${IP}:3000"
    log "=========================================="
  else
    warn "部分服务异常，查看日志: docker compose logs"
  fi
}

# ── 主流程 ──────────────────────────────────────────────────────────────────
main() {
  echo "=============================================="
  echo "  微信克隆 - CVM 服务部署"
  echo "=============================================="
  echo "  仓库:    $GIT_REPO"
  echo "  分支:    $BRANCH"
  echo "  目录:    $APP_DIR"
  echo "  模式:    $($UPDATE && echo '更新' || echo '首次部署')"
  echo ""

  sync_code
  gen_config
  build_images
  start_services
  wait_ready
}

main
