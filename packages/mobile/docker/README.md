# WeChat Clone — Docker 部署指南

## 架构概览

```
                    ┌──────────────┐
                    │   Nginx:80   │  ← Web 前端 (SPA) + 反向代理
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ API Gateway  │  ← 路由 / 鉴权 / 限流 / WebSocket
                    │   :3000      │
                    └──────┬───────┘
           ┌───────────────┼───────────────┬───────────────┐
           │               │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │    Auth     │ │  Message    │ │   Contact   │ │    Group    │
    │   :3001     │ │   :3002     │ │   :3003     │ │   :3004     │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘ └─────────────┘
           │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌─────────────┐ ┌─────────────┐
    │   File      │ │  Moments    │ │  PostgreSQL │ │   MongoDB   │
    │   :3005     │ │   :3006     │ │   :5432     │ │   :27017    │
    └─────────────┘ └─────────────┘ └─────────────┘ └──────┬──────┘
                                                       ┌───▼────┐
                                                       │  Redis │
                                                       │ :6379  │
                                                       └────────┘
```

## 服务列表

| 服务 | 容器名 | 端口 (容器) | 端口 (主机) | 技术栈 |
|------|--------|------------|------------|--------|
| Nginx (Web) | wc-web | 80 | 8080 | nginx:alpine + React SPA |
| API Gateway | wc-api-gateway | 3000 | 3000 | Node.js + TypeScript |
| Auth Service | wc-auth | 3001 | - | Node.js + TypeScript |
| Message Service | wc-message | 3002 | - | Node.js + TypeScript |
| Contact Service | wc-contact | 3003 | - | Node.js + TypeScript |
| Group Service | wc-group | 3004 | - | Node.js + TypeScript |
| File Service | wc-file | 3005 | - | Node.js + TypeScript |
| Moments Service | wc-moments | 3006 | - | Node.js + TypeScript |
| PostgreSQL | wc-postgres | 5432 | 5432 | postgres:16-alpine |
| Redis | wc-redis | 6379 | 6379 | redis:7-alpine |
| MongoDB | wc-mongo | 27017 | 27017 | mongo:7 |

## 快速开始

### 前置条件

- Docker >= 24
- Docker Compose >= 2.20
- 可用内存 >= 4 GB

### 1. 准备环境变量

```bash
# 开发环境使用 docker/.env 中的默认值
# 生产环境需修改密码和密钥
cp .env.example .env   # 可选，compose 默认使用 docker/.env
```

### 2. 启动全部服务

```bash
# 一键启动（首次会自动构建镜像）
./scripts/dev-up.sh

# 重建镜像后启动
./scripts/dev-up.sh --build

# 仅启动基础设施（数据库）
./scripts/dev-up.sh --no-deps
```

或直接使用 docker compose：

```bash
# 构建并启动
docker compose --env-file docker/.env up -d --build

# 仅启动
docker compose --env-file docker/.env up -d

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f [service]
```

### 3. 访问地址

| 服务 | 地址 |
|------|------|
| Web 前端 | http://localhost:8080 |
| API Gateway | http://localhost:3000 |
| Health (Nginx) | http://localhost:8080/health |
| Health (Gateway) | http://localhost:3000/health |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| MongoDB | localhost:27017 |

### 4. 停止服务

```bash
# 停止所有服务，保留数据
./scripts/dev-down.sh

# 停止并清除所有持久化数据（⚠️ 不可恢复）
./scripts/dev-down.sh --clean
```

## 数据库迁移与填充

```bash
# Prisma 迁移（开发模式）
./scripts/db-migrate.sh

# Prisma 迁移（生产部署）
./scripts/db-migrate.sh --deploy

# 查看原始 SQL 迁移状态
./scripts/db-migrate.sh --status

# 应用原始 SQL 迁移
./scripts/db-migrate.sh --up

# 回滚最后的原始 SQL 迁移
./scripts/db-migrate.sh --down

# 数据填充（Prisma seed）
./scripts/db-seed.sh

# MongoDB 索引初始化
./scripts/db-seed.sh --mongo
```

## 生产构建

```bash
# 构建所有镜像
./scripts/prod-build.sh

# 构建并推送到镜像仓库
DOCKER_REGISTRY=ghcr.io/myorg ./scripts/prod-build.sh --push --tag v1.0.0

# 构建单个服务
./scripts/prod-build.sh --service auth

# 指定镜像标签
IMAGE_TAG=v1.0.0 ./scripts/prod-build.sh
```

## 数据持久化

所有数据通过 Docker 命名卷持久化，容器重启不会丢失数据：

| Volume | 挂载路径 | 用途 |
|--------|---------|------|
| `pgdata` | `/var/lib/postgresql/data` | 用户、联系人、群组、朋友圈 |
| `redisdata` | `/data` | 会话缓存、在线状态 |
| `mongodata` | `/data/db` | 消息、消息盒子 |

要完全清除数据：

```bash
docker compose down --volumes
# 或
./scripts/dev-down.sh --clean
```

## 环境变量

环境变量在 `docker/.env` 中定义：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 (development/staging/production) | `development` |
| `JWT_SECRET` | JWT 签名密钥 | `dev-secret-change-in-production` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL 凭据 | `wechat` / `wechat_dev` / `wechat` |
| `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` | MongoDB 凭据 | `wechat` / `wechat_dev` |
| `DATABASE_URL` | Prisma 连接字符串 | 自动拼接 |
| `MONGODB_URL` | MongoDB 连接字符串 | 自动拼接 |
| `REDIS_URL` | Redis 连接字符串 | `redis://redis:6379` |
| `GATEWAY_HOST` | Gateway 监听地址 | `0.0.0.0` |

### 生产环境安全配置

部署到生产前务必修改：

1. **JWT 密钥** — 使用强随机密钥：
   ```bash
   openssl rand -hex 64
   ```

2. **数据库密码** — 使用强密码替换默认值

3. **环境切换** — 设置 `NODE_ENV=production`

## 健康检查

所有服务均配置了 Docker HEALTHCHECK：

```bash
# 检查所有服务健康状态
docker compose ps

# 单独检查
curl http://localhost:3000/health       # Gateway
curl http://localhost:3001/health       # Auth
curl http://localhost:3002/health       # Message
curl http://localhost:3003/health       # Contact
curl http://localhost:3004/health       # Group
curl http://localhost:3005/health       # File
curl http://localhost:3006/health       # Moments
curl http://localhost:8080/health       # Nginx (Web)
```

## Dockerfile 构建目标

多阶段 Dockerfile 支持按目标构建：

```bash
# 构建基础镜像（依赖安装 + Prisma 生成）
docker build --target base -t wechat-clone-base .

# 构建特定服务
docker build --target auth -t wechat-clone-auth .
docker build --target gateway -t wechat-clone-gateway .
docker build --target web -t wechat-clone-web .
```

构建目标：`base` → `auth` | `message` | `contact` | `group` | `file` | `moments` | `gateway` | `web-build` → `web`

## Nginx 反向代理路由

| 路径 | 目标 | 说明 |
|------|------|------|
| `/` | `/usr/share/nginx/html` | React SPA 静态资源 |
| `/api/*` | Gateway :3000 | API 代理 |
| `/ws` | Gateway :3000 | WebSocket 代理 |
| `/health` | Nginx 本地 | 健康检查（不经过 Gateway） |

## 故障排除

### 服务无法启动

```bash
# 检查容器状态
docker compose ps -a

# 查看服务日志
docker compose logs <service-name>

# 检查端口冲突
lsof -i :3000
lsof -i :5432
```

### 数据库连接失败

```bash
# 确认数据库处于 healthy 状态
docker compose ps postgres redis mongo

# 查看数据库日志
docker compose logs postgres
```

### 前端无法加载

确认 Web 容器构建成功（需要 Vite 构建完成）：

```bash
docker compose logs web
docker compose build --no-cache web
```

### 重新构建

```bash
# 清除缓存重新构建全部
docker compose build --no-cache

# 重新构建特定服务
docker compose build --no-cache api-gateway

# 进入容器调试
docker compose exec auth sh
```
