# goods-api

商品备份上传服务。Express + multer，Docker 部署，Nginx 反代。

## 架构

- 容器监听 `0.0.0.0:8080`，宿主机只映射 `127.0.0.1:8080`
- Nginx 将 `https://dongxiu.fun/api/` 反代到 `127.0.0.1:8080`
- 数据持久化在宿主机 `data/` 目录，挂载到容器 `/app/data`
- 镜像托管在 GHCR，Public 包，拉取无需登录
- 容器内存硬限制 `256m`，V8 堆限制 `192m`

## 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `GOODS_DATA_DIR` | `/home/admin/goods-api/data` | 宿主机数据目录，挂载到容器 `/app/data` |
| `NODE_OPTIONS` | `--max-old-space-size=192` | Dockerfile 内置，限制 V8 堆大小 |

## 一键部署

根据服务器当前环境选择对应命令。脚本只安装缺失的部分，已装好的不会重复安装。

### 场景 1：Docker 和 Nginx 都未安装（全新服务器）

```bash
sudo ./deploy/deploy.sh --domain dongxiu.fun --install all
```

脚本会：安装 Docker + docker-compose-plugin → 安装 Nginx + certbot → 拉镜像 → 启动容器 → 配 Nginx → 签证书。

### 场景 2：只安装了 Docker，Nginx 未装

```bash
sudo ./deploy/deploy.sh --domain dongxiu.fun --install nginx
```

脚本会：安装 Nginx + certbot → 拉镜像 → 启动容器 → 配 Nginx → 签证书。

### 场景 3：只安装了 Nginx，Docker 未装

```bash
sudo ./deploy/deploy.sh --domain dongxiu.fun --install docker
```

脚本会：安装 Docker + compose 插件 → 拉镜像 → 启动容器 → 配 Nginx（已存在则跳过）→ 签证书（已存在则跳过）。

### 场景 4：Docker 和 Nginx 都已安装

```bash
sudo ./deploy/deploy.sh --domain dongxiu.fun
```

`--install` 默认是 `none`，只部署应用，不装任何系统依赖。

### 可选参数

| 参数 | 说明 |
| :--- | :--- |
| `--email <邮箱>` | certbot 邮箱，默认 `admin@<域名>` |
| `--data-dir <路径>` | 自定义数据目录，默认 `/home/admin/goods-api/data` |
| `--docker-mirror <url>` | 配置 Docker 镜像加速器，解决拉取 `node:18-slim` 超时 |

示例：全新服务器 + Docker 加速器 + 自定义邮箱

```bash
sudo ./deploy/deploy.sh --domain dongxiu.fun --install all \
  --email 1289227619@qq.com \
  --docker-mirror https://docker.m.daocloud.io
```

### 前置条件

- 域名 DNS A 记录已指向服务器公网 IP（certbot 依赖）
- 如需迁移旧数据，先拷贝到数据目录：
  ```bash
  scp -r old-server:/home/admin/goods-api/data /home/admin/goods-api/
  ```

### 脚本幂等性

| 操作 | 重复执行时 |
| :--- | :--- |
| 安装 Docker/Nginx | 已安装则 apt 跳过 |
| 拉镜像、启动容器 | `compose up -d` 会重建容器，数据卷不变 |
| 写 Nginx 配置 | 文件已存在则跳过，不会覆盖 Certbot 改写版本 |
| 签发证书 | 证书目录已存在则跳过 |

---

## 从零部署

### 0. 前置条件

- 域名 `dongxiu.fun` 的 DNS A 记录已指向服务器公网 IP
- 服务器可访问外网

### 1. 安装基础软件

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git
sudo systemctl enable --now docker nginx
```

### 2. 拉取代码

```bash
sudo mkdir -p /home/admin/repos
cd /home/admin/repos
git clone https://github.com/dongxiujiang/good_api.git
cd good_api
```

### 3. 准备数据目录

```bash
sudo mkdir -p /home/admin/goods-api/data
```

迁移时把旧服务器的 `data/` 拷贝到同路径：

```bash
scp -r old-server:/home/admin/goods-api/data /home/admin/goods-api/
```

### 4. 拉取镜像

镜像为 Public，无需 `docker login`：

```bash
docker compose pull
```

### 5. 配置 Nginx（首次部署，HTTP 版）

```bash
sudo cp nginx/goods-api-http.conf /etc/nginx/sites-available/goods-api
sudo ln -sf /etc/nginx/sites-available/goods-api /etc/nginx/sites-enabled/goods-api
sudo nginx -t && sudo systemctl reload nginx
```

如果已有 `/etc/nginx/sites-enabled/goods-api`（比如从 PM2 迁移过来，Certbot 已签发过证书），不要覆盖，跳过此步。

### 6. 启动容器

```bash
docker compose up -d
docker logs -f goods-api
```

日志应显示：

```
端口: 8080
备份目录: /app/data/backups
```

按 `Ctrl + C` 退出日志跟踪。

### 7. 签发 HTTPS 证书

```bash
sudo certbot --nginx -d dongxiu.fun
```

Certbot 会自动改写 Nginx 配置，加上 443 和证书路径。

### 8. 验证

```bash
# 容器状态
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'

# 本机端口
curl -I http://127.0.0.1:8080/

# 经 Nginx 访问静态图片
curl -I https://dongxiu.fun/api/images/133/images/<实际文件名>

# 公网直连 8080 应被拒绝
curl -m 3 http://<公网IP>:8080/ || echo "已拒绝，安全"
```

## 更新部署

```bash
cd /home/admin/repos/good_api
git pull
docker compose pull
docker compose up -d
```

容器会使用新镜像重建，数据卷不受影响。

## 回滚

```bash
# 回滚到指定日期 tag
docker compose pull ghcr.io/dongxiujiang/good-api:20261019
docker compose up -d
```

或从旧镜像重建：

```bash
docker compose down
docker compose up -d --force-recreate
```

## 数据备份与恢复

### 备份

```bash
sudo tar czf /home/admin/goods-api-backup-$(date +%F).tar.gz \
  -C /home/admin/goods-api data
```

### 恢复

```bash
docker compose down
sudo tar xzf /home/admin/goods-api-backup-YYYY-MM-DD.tar.gz -C /home/admin/goods-api/
docker compose up -d
```

## 常见问题排查

### 上传失败，但日志显示请求已到达

先确认文件是否真的写入了宿主机：

```bash
ls -lat /home/admin/goods-api/data/backups/<backupName>/images/ | head
```

如果文件存在但客户端报失败，问题在客户端超时或判定逻辑，不在服务端。用 curl 直接验证：

```bash
echo "test" > /tmp/test.jpg
curl -v -F "file=@/tmp/test.jpg" -F "backupName=135" http://127.0.0.1:8080/api/upload/image
```

正常应返回：

```json
{"code":0,"message":"图片上传成功","data":{"filename":"test.jpg"}}
```

### Nginx 返回 413 Payload Too Large

单文件超过 Nginx 的 `client_max_body_size`（当前配置为 `50M`）。检查：

```bash
sudo nginx -T 2>/dev/null | grep -B2 -A2 'client_max_body_size'
```

如果客户端上传的图片超过 50MB，调大该值并 reload：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Nginx 返回 502 Bad Gateway

容器没运行或端口没对上：

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
ss -tlnp | grep 8080
```

确认 goods-api 容器状态为 `Up`，且 `127.0.0.1:8080` 有监听。

注意：Nginx 的 `proxy_pass` 写的是 `127.0.0.1:8080`（IP 而非容器名），容器重建后 Docker 分配的新 IP 会变化，但这里走的是宿主机端口映射，不需要 `resolver` 动态解析。如果将来改成 `proxy_pass http://goods-api:8080` 走 Docker 内部网络，则需要加 `resolver 127.0.0.11 valid=10s;` 并把 upstream 放进变量，否则容器重建后会 502。

### 容器反复重启，退出码 137

137 = 128 + 9（SIGKILL），通常是容器内存超过 `mem_limit` 被 OOM Killer 终止。检查：

```bash
docker inspect goods-api --format '{{.State.OOMKilled}}'
docker stats --no-stream goods-api
```

如果返回 `true`，说明 256MB 不够，调大 `docker-compose.yml` 的 `mem_limit` 和 `memswap_limit`，并同步调整 `NODE_OPTIONS` 的堆上限：

```yaml
mem_limit: 384m
memswap_limit: 384m
```

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=320"
```

### docker compose pull 拉取镜像超时

国内网络访问 GHCR 不稳定时，可以配置 Docker 镜像加速器，或改用 SSH 隧道/代理拉取。GHCR Public 包支持匿名拉取，不需要 `docker login`，如果提示 `unauthorized`，检查包的可见性是否确实为 Public。

### 查看实时日志

```bash
docker logs -f goods-api
```

日志驱动已配置 `json-file`，单文件最大 10MB，保留 3 个，不会无限增长。

## 目录说明

| 路径 | 说明 |
| :--- | :--- |
| `server.js` | 服务入口，端口 8080 写死 |
| `Dockerfile` | `node:18-slim`，`npm ci --omit=dev`，非 root 可选 |
| `docker-compose.yml` | 单机 Compose V2，顶层 `mem_limit` 生效 |
| `data/backups/<name>/images/` | 上传图片，持久化 |
| `data/backups/<name>/backup.json` | 备份元数据 |
| `nginx/goods-api-http.conf` | 首次部署 HTTP 模板 |
| `nginx/goods-api-https.conf` | Certbot 签发后的参考形态 |
| `.github/workflows/build.yml` | 推送 main 自动构建并推送 GHCR |

## 安全说明

- 端口只绑 `127.0.0.1`，公网无法直连 8080
- 容器内存硬限制 `256m`，防止单个服务拖垮宿主机
- 数据目录不进 Git，`.gitignore` 已排除 `data/`、`.env`、`*.pem`、`*.key`
- GHCR 镜像为 Public，只含代码，不含数据
