# goods-api

商品备份上传服务。Express + multer，Docker 部署，Nginx 反代。

## 架构

- 容器监听 `0.0.0.0:8080`，宿主机只映射 `127.0.0.1:8080`
- Nginx 将 `https://dongxiu.fun/api/` 反代到 `127.0.0.1:8080`
- 数据持久化在宿主机 `data/` 目录，挂载到容器 `/app/data`

## 从零部署

### 1. 安装基础软件

sudo apt update
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git
sudo systemctl enable --now docker nginx

### 2. 拉取代码

sudo mkdir -p /home/admin/repos
cd /home/admin/repos
git clone https://github.com/dongxiujiang/good_api.git
cd good_api

### 3. 准备数据目录

sudo mkdir -p /home/admin/goods-api/data

### 4. 拉取镜像

docker compose pull

### 5. 配置 Nginx（首次部署，HTTP 版）

sudo cp nginx/goods-api-http.conf /etc/nginx/sites-available/goods-api
sudo ln -sf /etc/nginx/sites-available/goods-api /etc/nginx/sites-enabled/goods-api
sudo nginx -t && sudo systemctl reload nginx

### 6. 启动容器

docker compose up -d
docker logs -f goods-api

### 7. 签发 HTTPS 证书

sudo certbot --nginx -d dongxiu.fun

### 8. 验证

curl -I https://dongxiu.fun/api/images/133/
docker ps --format 'table {{.Names}}\t{{.Ports}}'

## 更新部署

git pull
docker compose pull
docker compose up -d

## 目录说明

| 路径 | 说明 |
| :--- | :--- |
| server.js | 服务入口，端口 8080 |
| data/backups/<name>/images/ | 上传图片，持久化 |
| nginx/goods-api-http.conf | 首次部署 HTTP 配置 |
| nginx/goods-api-https.conf | Certbot 后参考配置 |
