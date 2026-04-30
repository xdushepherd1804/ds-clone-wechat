# =============================================================================
# WeChat Clone — Multi-stage Dockerfile
#
# Build:
#   docker build --target <stage> -t wechat-clone/<service> .
#
# Stages: base | auth | message | contact | group | file | moments | gateway
#         | web-build | web
# =============================================================================

# ─── Base: install dependencies & build TypeScript ─────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache wget && corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy root workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json tsconfig.base.json ./

# Copy all package.json and tsconfig files for workspace resolution
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY packages/server-auth/package.json packages/server-auth/tsconfig.json packages/server-auth/
COPY packages/server-message/package.json packages/server-message/tsconfig.json packages/server-message/
COPY packages/server-contact/package.json packages/server-contact/tsconfig.json packages/server-contact/
COPY packages/server-group/package.json packages/server-group/tsconfig.json packages/server-group/
COPY packages/server-file/package.json packages/server-file/tsconfig.json packages/server-file/
COPY packages/server-moments/package.json packages/server-moments/tsconfig.json packages/server-moments/
COPY packages/server-gateway/package.json packages/server-gateway/tsconfig.json packages/server-gateway/
COPY packages/web/package.json packages/web/tsconfig.json packages/web/

# Install all dependencies (including devDeps for tsx and typescript)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/src packages/shared/src/
COPY packages/shared/prisma packages/shared/prisma/
COPY packages/server-auth/src packages/server-auth/src/
COPY packages/server-message/src packages/server-message/src/
COPY packages/server-contact/src packages/server-contact/src/
COPY packages/server-group/src packages/server-group/src/
COPY packages/server-file/src packages/server-file/src/
COPY packages/server-moments/src packages/server-moments/src/
COPY packages/server-gateway/src packages/server-gateway/src/
COPY config/ config/

# Generate Prisma client
RUN npx prisma generate --schema=packages/shared/prisma/schema.prisma

# ─── Auth Service ──────────────────────────────────────────────────────────
FROM base AS auth
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
EXPOSE 3001
CMD ["pnpm", "exec", "tsx", "packages/server-auth/src/server.ts"]

# ─── Message Service ───────────────────────────────────────────────────────
FROM base AS message
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/health || exit 1
EXPOSE 3002
CMD ["pnpm", "exec", "tsx", "packages/server-message/src/server.ts"]

# ─── Contact Service ───────────────────────────────────────────────────────
FROM base AS contact
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3003/health || exit 1
EXPOSE 3003
CMD ["pnpm", "exec", "tsx", "packages/server-contact/src/server.ts"]

# ─── Group Service ─────────────────────────────────────────────────────────
FROM base AS group
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3004/health || exit 1
EXPOSE 3004
CMD ["pnpm", "exec", "tsx", "packages/server-group/src/server.ts"]

# ─── File Service ──────────────────────────────────────────────────────────
FROM base AS file
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3005/health || exit 1
EXPOSE 3005
CMD ["pnpm", "exec", "tsx", "packages/server-file/src/server.ts"]

# ─── Moments Service ───────────────────────────────────────────────────────
FROM base AS moments
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3006/health || exit 1
EXPOSE 3006
CMD ["pnpm", "exec", "tsx", "packages/server-moments/src/server.ts"]

# ─── Gateway Service ───────────────────────────────────────────────────────
FROM base AS gateway
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "packages/server-gateway/src/server.ts"]

# ─── Web Frontend Build ────────────────────────────────────────────────────
FROM base AS web-build
WORKDIR /app
RUN cd packages/web && npx vite build --outDir dist

# ─── Web Frontend (Nginx) ──────────────────────────────────────────────────
FROM nginx:alpine AS web
RUN apk add --no-cache wget
COPY --from=web-build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/health || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
