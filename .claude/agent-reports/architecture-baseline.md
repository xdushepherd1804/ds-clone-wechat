# Architecture Baseline & Review Standards
**Generated:** 2026-05-03
**Purpose:** 开发Agent修复方案的审核基准

---

## 1. 项目分层架构

```
┌──────────────────────────────────────────┐
│  Web (React 19 + antd + Zustand)         │
│  packages/web                             │
│  - pages/  - components/  - hooks/       │
│  - store/ (Zustand)  - api/  - ws/       │
└──────────────┬───────────────────────────┘
               │ HTTP/WS
┌──────────────▼───────────────────────────┐
│  Gateway (Express + http-proxy)           │
│  packages/server-gateway                  │
│  - 路由前缀剥离: POST /api/messages → /   │
└──────┬───────┬───────┬───────────────────┘
       │       │       │
┌──────▼──┐ ┌──▼──┐ ┌──▼──────────────────┐
│  Auth   │ │ Msg │ │ Contact/Group/...    │
│  svc    │ │ svc │ │ (10 microservices)   │
└────┬────┘ └──┬──┘ └──┬───────────────────┘
     │         │        │
┌────▼─────────▼────────▼──────────────────┐
│  Shared (types, config, db utils)         │
│  packages/shared                          │
│  - DB模块不入 barrel (浏览器安全)          │
│  - process.env 需 guard                   │
└──────────────────────────────────────────┘
```

## 2. 关键约定

### Shared Package
- **R1:** DB模块(redis-keys, mongo-indexes)不re-export到barrel
- **R2:** 服务端import: `import { X } from '@wechat-clone/shared/db/redis-keys'`
- **R3:** 使用`typeof process !== 'undefined'` guard process.env

### Gateway
- **R4:** Gateway剥离匹配的路由前缀: `POST /api/messages` → service收到 `POST /`
- **R5:** Service `matchRoute` 必须处理裸 `/` 路径

### Zustand Store
- **R6:** 禁止在selector中使用 `|| []` — 每次render创建新引用导致无限循环
- **R7:** 使用模块级常量: `?? EMPTY_CONST`

### API Response
- **R8:** `res.data.data!` 可能返回undefined (skeleton servers, gateway errors)
- **R9:** 存储前guard: `if (item && item.id)`
- **R10:** 独立并行API调用使用 `Promise.allSettled`

### Rendering
- **R11:** 数组渲染使用 `.filter(Boolean).map(...)` 防止corrupt entries

## 3. 常见架构违规

| 违规 | 错误示例 | 正确做法 |
|------|----------|----------|
| DB模块从barrel import | `import { RedisKeys } from '@wechat-clone/shared'` | 直接路径 import |
| 无guard的process.env | `const db = process.env.DB_URL` | `typeof process !== 'undefined' && process.env.DB_URL` |
| Zustand \|\| [] | `useStore(s => s.items \|\| [])` | `const EMPTY: never[] = []; ... s.items ?? EMPTY` |
| 无guard的API数据 | `setMessages(res.data.data)` | `const data = res.data.data; if (data) setMessages(data)` |
| 无filter的数组map | `items.map(i => <Item/>)` | `items.filter(Boolean).map(i => <Item/>)` |

## 4. 微服务依赖表

| Service | DB Dependencies | Inter-service |
|---------|----------------|---------------|
| gateway | None | All (proxy) |
| auth | PostgreSQL | None |
| message | PostgreSQL, Redis | None |
| contact | PostgreSQL | None |
| group | PostgreSQL | None |
| search | MongoDB | message |
| push | PostgreSQL | None |
| file | MinIO/S3 | None |
| moments | PostgreSQL, Redis | None |
| qrcode | None | auth |
| redpacket | PostgreSQL, Redis | None |

## 5. Review Checklist

变更审核时检查:
- [ ] 新增import是否来自正确路径(非barrel的DB模块)
- [ ] 是否引入模块级副作用影响测试
- [ ] Zustand selector是否使用 `??` 而非 `||`
- [ ] API数据是否guard后再存储
- [ ] 数组渲染是否filter
- [ ] 新增依赖是否在package.json中声明
- [ ] 类型断言是否使用正确的union type而非`as string`
