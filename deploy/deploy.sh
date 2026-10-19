#!/usr/bin/env bash
set -euo pipefail

DOMAIN=""
EMAIL=""
DATA_DIR="/home/admin/goods-api/data"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL="none"
DOCKER_MIRROR=""

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
  cat <<EOF
用法: $0 --domain <域名> [选项]

选项:
  --domain <域名>            必填，如 dongxiu.fun
  --email <邮箱>             certbot 邮箱，默认 admin@<域名>
  --data-dir <路径>          数据目录，默认 /home/admin/goods-api/data
  --install <模式>           none | all | docker | nginx，默认 none
  --docker-mirror <url>      配置 Docker 镜像加速器（可选）

--install 取值:
  none      Docker 和 Nginx 都已安装，只部署应用
  all       Docker 和 Nginx 都未安装，全部安装后部署
  docker    只安装了 Nginx，需要补装 Docker
  nginx     只安装了 Docker，需要补装 Nginx + certbot
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --data-dir) DATA_DIR="$2"; shift 2 ;;
    --install) INSTALL="$2"; shift 2 ;;
    --docker-mirror) DOCKER_MIRROR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) err "未知参数: $1"; usage; exit 1 ;;
  esac
done

[[ -z "$DOMAIN" ]] && { err "必须指定 --domain"; usage; exit 1; }
[[ -z "$EMAIL" ]] && EMAIL="admin@$DOMAIN"
[[ "$INSTALL" =~ ^(none|all|docker|nginx)$ ]] || { err "--install 只能是 none/all/docker/nginx"; exit 1; }

SUDO=""
[[ $EUID -ne 0 ]] && SUDO="sudo"

install_docker() {
  info "安装 Docker..."
  $SUDO apt update
  $SUDO apt install -y docker.io docker-compose-plugin
  $SUDO systemctl enable --now docker
}

install_nginx() {
  info "安装 Nginx + certbot..."
  $SUDO apt update
  $SUDO apt install -y nginx certbot python3-certbot-nginx
  $SUDO systemctl enable --now nginx
}

case "$INSTALL" in
  all)    install_docker; install_nginx ;;
  docker) install_docker ;;
  nginx)  install_nginx ;;
  none)   : ;;
esac

command -v docker >/dev/null 2>&1 || { err "docker 未安装，用 --install all 或 --install docker"; exit 1; }
$SUDO docker compose version >/dev/null 2>&1 || { err "docker compose 插件不可用，请安装 docker-compose-plugin"; exit 1; }
command -v nginx >/dev/null 2>&1 || { err "nginx 未安装，用 --install all 或 --install nginx"; exit 1; }
command -v certbot >/dev/null 2>&1 || { err "certbot 未安装，用 --install all 或 --install nginx"; exit 1; }

if [[ -n "$DOCKER_MIRROR" ]]; then
  info "配置 Docker 镜像加速器: $DOCKER_MIRROR"
  $SUDO mkdir -p /etc/docker
  $SUDO tee /etc/docker/daemon.json >/dev/null <<EOF
{
  "registry-mirrors": ["$DOCKER_MIRROR"]
}
EOF
  $SUDO systemctl daemon-reload
  $SUDO systemctl restart docker
fi

$SUDO mkdir -p "$DATA_DIR"
info "数据目录: $DATA_DIR"

cd "$REPO_DIR"
echo "GOODS_DATA_DIR=$DATA_DIR" > .env

info "拉取镜像..."
$SUDO docker compose pull
info "启动容器..."
$SUDO docker compose up -d

NGINX_CONF="/etc/nginx/sites-available/goods-api"
if [[ ! -f "$NGINX_CONF" ]]; then
  info "配置 Nginx..."
  $SUDO cp nginx/goods-api-http.conf "$NGINX_CONF"
  $SUDO sed -i "s/server_name dongxiu.fun;/server_name $DOMAIN;/" "$NGINX_CONF"
  $SUDO ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/goods-api
  $SUDO nginx -t
  $SUDO systemctl reload nginx
else
  info "Nginx 配置已存在，跳过（Certbot 可能已改写）"
fi

if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  info "签发 HTTPS 证书..."
  $SUDO certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" \
    || warn "certbot 失败，确认 DNS 解析后手动执行: sudo certbot --nginx -d $DOMAIN"
else
  info "证书已存在，跳过 certbot"
fi

echo ""
info "=== 部署完成 ==="
$SUDO docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}' | grep -E 'NAMES|goods-api' || true
echo ""
echo "验证:"
echo "  curl -I https://$DOMAIN/api/images/133/"
echo "  docker logs -f goods-api"
