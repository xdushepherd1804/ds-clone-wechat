#!/usr/bin/env bash
# =============================================================================
# cvm-init.sh — 腾讯云 CVM 环境初始化
#
# 在 CVM 上执行一次，安装 Docker + Docker Compose + git
# 幂等，可重复执行
#
# 用法（在 CVM 上）:
#   curl -fsSL https://gitee.com/xdushepherd91/ds-clone-wechat/raw/main/scripts/cvm-init.sh | bash
#   # 或者 git clone 后执行:
#   bash scripts/cvm-init.sh
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

# ── 检测系统 ────────────────────────────────────────────────────────────────
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS="$ID"
  elif [ -f /etc/redhat-release ]; then
    OS="centos"
  else
    OS="unknown"
  fi
  ARCH=$(uname -m)
  log "系统: $OS / $ARCH"
}

# ── 安装基础工具 ───────────────────────────────────────────────────────────
install_base() {
  step "安装基础依赖"

  case "$OS" in
    ubuntu|debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y -qq curl wget git openssl ca-certificates gnupg lsb-release
      ;;
    centos|rhel|tencentos|alinux)
      yum install -y -q curl wget git openssl ca-certificates
      ;;
    *)
      warn "未知系统，尝试 yum / apt 安装..."
      yum install -y -q curl wget git openssl ca-certificates 2>/dev/null || \
        apt-get install -y -qq curl wget git openssl ca-certificates 2>/dev/null
      ;;
  esac
  log "基础依赖安装完成"
}

# ── 安装 Docker ──────────────────────────────────────────────────────────────
install_docker() {
  step "安装 Docker Engine"

  if command -v docker &>/dev/null && docker info &>/dev/null; then
    log "Docker 已安装: $(docker --version)"
    return 0
  fi

  case "$OS" in
    ubuntu|debian)
      for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
        apt-get remove -y $pkg 2>/dev/null || true
      done
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://mirrors.cloud.tencent.com/docker-ce/linux/ubuntu/gpg | \
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || \
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.cloud.tencent.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;

    centos|rhel|tencentos|alinux)
      yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true
      yum install -y -q yum-utils
      yum-config-manager --add-repo https://mirrors.cloud.tencent.com/docker-ce/linux/centos/docker-ce.repo 2>/dev/null || \
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      yum install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;

    *)
      warn "使用 Docker 官方安装脚本..."
      curl -fsSL https://get.docker.com | sh
      ;;
  esac

  systemctl enable docker
  systemctl start docker

  mkdir -p /etc/docker
  if [ ! -f /etc/docker/daemon.json ]; then
    cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
    systemctl restart docker
  fi

  log "Docker 安装完成: $(docker --version)"
}

# ── 安装 Docker Compose（备用 standalone） ────────────────────────────────────
install_compose() {
  step "检查 Docker Compose"

  if docker compose version &>/dev/null; then
    log "Docker Compose 已安装: $(docker compose version)"
    return 0
  fi

  local url="https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}"
  local dest="/usr/local/bin/docker-compose"
  curl -SL "$url" -o "$dest"
  chmod +x "$dest"
  log "Docker Compose (standalone) 安装完成"
}

# ── 防火墙检查 ──────────────────────────────────────────────────────────────
check_firewall() {
  step "检查防火墙"

  warn "请确保腾讯云安全组已放行以下端口:"
  warn "    8080 (Web 前端)"
  warn "    3000 (API 网关)"
}

# ── 主流程 ──────────────────────────────────────────────────────────────────
main() {
  echo "=============================================="
  echo "  微信克隆 - CVM 环境初始化"
  echo "=============================================="
  echo ""

  detect_os
  install_base
  install_docker
  install_compose
  check_firewall

  echo ""
  log "=========================================="
  log "  初始化完成"
  log "  Docker:        $(docker --version 2>/dev/null || echo 'N/A')"
  log "  Compose:       $(docker compose version 2>/dev/null || echo 'N/A')"
  log "  Git:           $(git --version 2>/dev/null || echo 'N/A')"
  log "=========================================="
  echo ""
  echo "下一步:"
  echo "  bash scripts/cvm-deploy.sh"
}

main
