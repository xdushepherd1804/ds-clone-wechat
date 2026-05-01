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
RUN corepack enable && corepack prepare pnpm@9 --activate
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
COPY packages/server-search/package.json packages/server-search/tsconfig.json packages/server-search/
COPY packages/server-redpacket/package.json packages/server-redpacket/tsconfig.json packages/server-redpacket/
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
COPY packages/server-search/src packages/server-search/src/
COPY packages/server-redpacket/src packages/server-redpacket/src/
COPY packages/web/src packages/web/src/
COPY packages/web/index.html packages/web/vite.config.ts packages/web/
COPY config/ config/

# Generate Prisma client
RUN cd packages/shared && pnpm exec prisma generate

# ─── Auth Service ──────────────────────────────────────────────────────────
FROM base AS auth
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
EXPOSE 3001
CMD ["node_modules/.bin/tsx", "packages/server-auth/src/server.ts"]

# ─── Message Service ───────────────────────────────────────────────────────
FROM base AS message
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health || exit 1
EXPOSE 3002
CMD ["node_modules/.bin/tsx", "packages/server-message/src/server.ts"]

# ─── Contact Service ───────────────────────────────────────────────────────
FROM base AS contact
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/health || exit 1
EXPOSE 3003
CMD ["node_modules/.bin/tsx", "packages/server-contact/src/server.ts"]

# ─── Group Service ─────────────────────────────────────────────────────────
FROM base AS group
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3004/health || exit 1
EXPOSE 3004
CMD ["node_modules/.bin/tsx", "packages/server-group/src/server.ts"]

# ─── File Service ──────────────────────────────────────────────────────────
FROM base AS file
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3005/health || exit 1
EXPOSE 3005
CMD ["node_modules/.bin/tsx", "packages/server-file/src/server.ts"]

# ─── Search Service ─────────────────────────────────────────────────────────
FROM base AS search
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3008/health || exit 1
EXPOSE 3008
CMD ["node_modules/.bin/tsx", "packages/server-search/src/server.ts"]

# ─── Moments Service ───────────────────────────────────────────────────────
FROM base AS moments
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3006/health || exit 1
EXPOSE 3006
CMD ["node_modules/.bin/tsx", "packages/server-moments/src/server.ts"]

# ─── Red Packet Service ──────────────────────────────────────────────────────
FROM base AS redpacket
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3009/health || exit 1
EXPOSE 3009
CMD ["node_modules/.bin/tsx", "packages/server-redpacket/src/server.ts"]

# ─── Gateway Service ───────────────────────────────────────────────────────
FROM base AS gateway
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "packages/server-gateway/src/server.ts"]

# ─── Web Frontend Build ────────────────────────────────────────────────────
FROM base AS web-build
WORKDIR /app
RUN cd packages/web && pnpm exec vite build --outDir dist

# ─── Web Frontend (Nginx) ──────────────────────────────────────────────────
FROM nginx:alpine AS web
COPY --from=web-build /app/packages/web/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/health || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
