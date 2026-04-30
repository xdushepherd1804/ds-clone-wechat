# WeChat Clone — Docker 部署指南

## 架构概览

```
                    ┌──────────────┐
                    │   Nginx:80   │  ← 反向代理入口 (port 8080)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         /api/*, /ws   /health    /* (静态)
              │            │            │
    ┌─────────▼──────┐    │    ┌───────▼──────┐
    │   API Gateway  │◄───┘    │   Web (SPA)  │
    │   Port 3000    │         │   Nginx:80   │
    └──┬──┬──┬──┬──┬─┘         └──────────────┘
       │  │  │  │  │
       ▼  ▼  ▼  ▼  ▼
   ┌──────────────────────────────────────┐
   │  Auth  Message  Contact  Group       │
   │  3001   3002     3003    3004        │
   │  File  Moments                      │
   │  3005   3006                        │
   └──────────────┬───────────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│PostgreSQL│ │  Redis  │ │ MongoDB │
│  :5432   │ │ :6379   │ │ :27017  │
└─────────┘ └─────────┘ └─────────┘
```

## 服务列表

| 服务 | 容器名 | 端口 | 技术栈 |
|------|--------|------|--------|
| PostgreSQL | wc-postgres | 5432 | postgres:16-alpine |
| Redis | wc-redis | 6379 | redis:7-alpine |
| MongoDB | wc-mongo | 27017 | mongo:7 |
| Auth Service | wc-auth | 3001 | Node.js + TypeScript |
| Message Service | wc-message | 3002 | Node.js + TypeScript |
| Contact Service | wc-contact | 3003 | Node.js + TypeScript |
| Group Service | wc-group | 3004 | Node.js + TypeScript |
| File Service | wc-file | 3005 | Node.js + TypeScript |
| Moments Service | wc-moments | 3006 | Node.js + TypeScript |
| API Gateway | wc-api-gateway | 3000 | Node.js + TypeScript |
| Web Frontend | wc-web | 80 | Nginx + React SPA |
| Nginx Proxy | wc-nginx | 8080 | nginx:alpine |

## 快速开始

### 前置条件

- Docker >= 24
- Docker Compose >= 2.20
- Node.js >= 20 (仅本地开发需要)

### 启动全部服务

```bash
# 开发环境
./scripts/dev-up.sh

# 重建镜像后启动
./scripts/dev-up.sh --build

# 仅启动数据库
./scripts/dev-up.sh --no-deps
```

或直接使用 docker compose：

```bash
# 构建并启动
docker compose up -d --build

# 仅启动
docker compose up -d

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f [service]
```

### 停止服务

```bash
./scripts/dev-down.sh

# 清理所有数据卷 (⚠️ 数据不可恢复)
./scripts/dev-down.sh --clean
```

### 访问地址

- **前端:** http://localhost:8080
- **API 网关:** http://localhost:3000
- **健康检查:** http://localhost:8080/health

## 数据库迁移与填充

```bash
# Prisma 迁移 (开发)
./scripts/db-migrate.sh

# Prisma 迁移 (生产部署)
./scripts/db-migrate.sh --deploy

# 查看迁移状态
./scripts/db-migrate.sh --status

# 数据填充
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
```

## 数据持久化

数据通过 Docker named volumes 持久化：

| Volume | 用途 | 数据 |
|--------|------|------|
| `pgdata` | PostgreSQL | 用户、联系人、群组、朋友圈 |
| `redisdata` | Redis | 会话、缓存、在线状态 |
| `mongodata` | MongoDB | 消息、消息盒子 |

重启后数据不会丢失。要完全清除数据：

```bash
docker compose down --volumes
```

## 环境变量

环境变量在 `docker/.env` 中定义，主要变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `JWT_SECRET` | JWT 签名密钥 | `dev-secret-change-in-production` |
| `POSTGRES_USER` | PostgreSQL 用户名 | `wechat` |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 | `wechat_dev` |
| `MONGO_INITDB_ROOT_USERNAME` | MongoDB 用户名 | `wechat` |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB 密码 | `wechat_dev` |

## 健康检查

所有服务都配置了 Docker HEALTHCHECK：

```bash
# 检查所有服务状态
docker compose ps

# 检查特定服务
curl http://localhost:3000/health       # Gateway
curl http://localhost:3001/health       # Auth
curl http://localhost:8080/health       # Nginx → Gateway
```

## Dockerfile 构建目标

多阶段 Dockerfile 支持按目标构建：

```bash
# 构建基础镜像 (依赖安装 + TypeScript 编译)
docker build --target base -t wechat-clone-base .

# 构建特定服务
docker build --target auth -t wechat-clone-auth .
docker build --target gateway -t wechat-clone-gateway .
docker build --target web -t wechat-clone-web .
```

## 故障排除

```bash
# 重新构建
docker compose build --no-cache

# 重新构建特定服务
docker compose build --no-cache auth

# 查看服务日志
docker compose logs -f api-gateway

# 进入容器调试
docker compose exec auth sh
```
