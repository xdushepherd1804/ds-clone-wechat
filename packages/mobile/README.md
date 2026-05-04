# WeChat Clone (wechat-clone)

A full-stack WeChat clone built as a pnpm monorepo.

## Architecture

This project is organized as a monorepo with microservices:

```
wechat-clone/
├── packages/
│   ├── shared/           # shared types, constants, utilities
│   ├── server-auth/      # authentication service
│   ├── server-message/   # messaging service
│   ├── server-gateway/   # API/WebSocket gateway
│   ├── server-contact/   # contacts service
│   ├── server-group/     # group chat service
│   ├── server-file/      # file upload/storage service
│   ├── server-moments/   # moments/timeline service
│   └── web/              # React frontend
├── docker/               # container configs
├── scripts/              # build & deploy scripts
└── docs/                 # documentation
```

## Tech Stack

| Layer        | Technology                           |
| ------------ | ------------------------------------ |
| Package mgmt | pnpm workspaces                      |
| Frontend     | React 18 + TypeScript + Vite         |
| Backend      | Node.js (NestJS)                     |
| Databases    | PostgreSQL, MongoDB, Redis           |
| Containers   | Docker + Docker Compose              |
| Code quality | ESLint + Prettier + EditorConfig     |

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### Setup

```bash
# install dependencies
pnpm install

# start infrastructure (PostgreSQL, Redis, MongoDB)
docker compose -f docker/docker-compose.yml up -d

# type-check all packages
pnpm typecheck

# lint
pnpm lint
```

## Development

```bash
# start a specific service (examples)
pnpm --filter @wechat-clone/web dev
pnpm --filter @wechat-clone/server-gateway dev
```
