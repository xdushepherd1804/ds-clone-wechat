# Architecture Review Round 1 — P0 阻塞性问题修复审核

**审核日期:** 2026-05-03
**审核人:** 架构 Agent
**审核基准:** `.claude/agent-reports/architecture-baseline.md`

---

## 审核标准
每个变更检查:
- [x] 是否正确解决了根因而非症状
- [x] 是否引入新的架构违规（参考R1-R11规则）
- [x] 是否引入模块级副作用影响测试
- [x] 依赖声明是否正确（版本号、位置）
- [x] 最小改动原则是否遵守
- [x] 是否有安全隐患

---

## P0-1: `packages/shared/src/config/loader.ts` — resolveEnv() 添加 'test'

**判定: PASS**

| 项目 | 结果 |
|------|------|
| 根因修复 | 通过。测试运行时 `NODE_ENV=test`，validate() 中 `valid` 数组未包含 'test' 导致 ConfigError。添加 'test' 是正确根因修复 |
| 架构违规 | 无。`process.env` 未使用 guard，但该文件是 Node-only 模块（已 import `readFileSync` 来自 `node:fs`），R3 不适用 |
| 模块级副作用 | 无 |
| 最小改动 | 是。仅修改一行：在数组字面量中添加一个字符串 `'test'` |
| 安全隐患 | 无 |

---

## P0-2: `packages/web/src/test-setup.ts` — localStorage mock

**判定: PASS-WITH-NOTE**

| 项目 | 结果 |
|------|------|
| 根因修复 | 通过。jsdom 在测试环境中不提供 localStorage，或早期版本实现不完整。手动 mock 是标准做法 |
| 接口完整性 | 通过。`LocalStorageMock` 正确实现了完整的 `Storage` 接口（length/clear/getItem/key/setItem/removeItem），包括 `getItem` 返回 `null` 的正确语义 |
| 架构违规 | 无。本次变更未引入新违反 R1-R11 |
| 模块级副作用 | 是——定义 `globalThis.localStorage` 的 polyfill 是副作用，但此文件是 vitest 的 setup 文件，副作用是设计意图 |
| 最小改动 | 是。只增加了 mock 实现 + 安装 |
| 安全隐患 | 无 |

**需要关注的改进点:**
1. 与文件中已有 polyfill 风格不一致。第12行的 `matchMedia` polyfill 有 `typeof window !== 'undefined'` 守卫，而第39行的 `localStorage` mock 无任何守卫。建议添加:
   ```ts
   if (typeof localStorage === 'undefined') {
     Object.defineProperty(globalThis, 'localStorage', { ... });
   }
   ```
   或复用已有的 `typeof window !== 'undefined'` 守卫。
2. 如果 vitest 配置了 `jsdom` 环境（jsdom v20+ 自带 localStorage），这个 mock 会覆盖原生实现。虽然目前无害，但建议只在 `localStorage` 不存在时再注入 mock。

**严重性:** 低。仅影响测试环境，测试功能不受影响。

---

## P0-3: `packages/server-contact/package.json` — 添加 @prisma/client + ioredis

**判定: PASS-WITH-NOTE**

| 项目 | 结果 |
|------|------|
| 根因修复 | 通过。`server-contact` 源码中大量使用 `@prisma/client`（Prisma）和 `ioredis`（在线状态检查），这些依赖此前未声明，是 transitive dependency，必须显式声明 |
| 架构违规 | 无。但架构基准文档（baseline.md）的微服务依赖表中 contact 仅列了 PostgreSQL，未列 Redis。源码显示 contact 确实使用 Redis（`contact.service.ts` 第62-68行 `checkOnlineBatch`），故基线文档需更新 |
| 版本一致 | **问题。** `@prisma/client: "^6.0.0"` 与 `packages/shared` 的 `"^6.1.0"` 不完全对齐。虽然 `^6.0.0` 兼容 6.x 全系，在 pnpm lockfile 中会被解析为同一版本，但版本号不同可能导致阅读者困惑。建议统一为 `"^6.1.0"` |
| 依赖必要性 | ioredis 已确认必要。`server.ts` 第17-18行创建 `Redis` 实例，`contact.service.ts` 第4行引用 `RedisKeys`，第62-68行调用 `redis.mget` |
| 最小改动 | 是。仅添加必须的依赖声明 |
| 安全隐患 | 无 |

**需要关注的改进点:**
- `@prisma/client` 版本建议对齐 shared：从 `"^6.0.0"` 改为 `"^6.1.0"`
- `architecture-baseline.md` 微服务依赖表 contact 行应添加 Redis

**严重性:** 低。不影响运行，但版本对齐和文档一致性建议处理。

---

## P0-3: `packages/server-moments/package.json` — 添加 @prisma/client + ioredis

**判定: PASS-WITH-NOTE**

| 项目 | 结果 |
|------|------|
| 根因修复 | 通过。moments 服务使用 PostgreSQL + Redis，基线文档也确认（moments 行: PostgreSQL, Redis）。依赖此前未声明，需显式添加 |
| 架构违规 | 无 |
| 版本一致 | **问题。** 同 contact，`@prisma/client: "^6.0.0"` 与 shared 的 `"^6.1.0"` 不完全对齐。建议统一为 `"^6.1.0"` |
| 最小改动 | 是 |
| 安全隐患 | 无 |

**需要关注的改进点:**
- `@prisma/client` 版本建议对齐 shared：从 `"^6.0.0"` 改为 `"^6.1.0"`

**严重性:** 低。

---

## P0-4: `packages/server-push/package.json` — 添加 firebase-admin

**判定: PASS**

| 项目 | 结果 |
|------|------|
| 根因修复 | 通过。push 服务作为推送通知服务需要 Firebase Admin SDK，添加 `firebase-admin` 依赖是正确的 |
| 架构违规 | 无 |
| 版本检查 | `firebase-admin: "^13.0.0"` — 合理的最新 major 版本。仅 `server-push` 使用此依赖（项目内唯一），无版本冲突 |
| 最小改动 | 是。仅添加一行依赖声明 |
| 副作用 | 无。`@prisma/client "^5.22.0"` 与 shared 的 `"^6.1.0"` 版本不一致是 **本次变更前已存在的遗留问题**，并非 P0-4 修复引入。整个项目的 @prisma/client 版本列表：auth ^6.1.0, message ^6.0.0, group ^6.0.0, contact ^6.0.0, moments ^6.0.0, push ^5.22.0, redpacket ^6.0.0, search ^6.0.0, shared ^6.1.0。建议单独 issue 处理 push 的版本升级 |
| 安全隐患 | 无 |

---

## P0-5: `packages/shared/package.json` — 添加 exports 入口 `./db/redis-keys`

**判定: PASS**

| 项目 | 结果 |
|------|------|
| 根因修复 | 通过。服务端代码按 R2 规则应使用 `@wechat-clone/shared/db/redis-keys` 导入路径，但未在 `exports` 中显式声明。虽然 `./*` catch-all 已使其工作，但显式声明更安全（防止 catch-all 变更后断路，同时提供 IDE 类型导航） |
| 架构违规 | 无。完全符合 R1/R2：DB 模块不通过 barrel re-export，但通过子路径 export 暴露给服务端。这是架构约定的正确定义 |
| 路径正确性 | `redis-keys.ts` 确实存在于 `packages/shared/src/db/` 目录，路径映射有效 |
| 最小改动 | 是。仅添加一行 exports entry |
| 安全隐患 | 无 |

**观察（非问题）:**
- `./db/mongo-indexes` 在 CLAUDE.md 中与 `redis-keys` 一同被列为 DB 模块，但本次变更未添加其对应 export。如需从 search 等服务导入 mongo-indexes，后续需补充添加。当前 scoping 正确。

---

## 总体评估

**判定: APPROVED-WITH-CHANGES**

### 汇总表

| 编号 | 文件 | 判定 | 说明 |
|------|------|------|------|
| P0-1 | `shared/src/config/loader.ts` | **PASS** | 正确根因修复，一行改动 |
| P0-2 | `web/src/test-setup.ts` | **PASS-WITH-NOTE** | 缺少 `typeof` 守卫，与现有风格不一致 |
| P0-3 | `server-contact/package.json` | **PASS-WITH-NOTE** | @prisma/client 版本应与 shared 对齐 |
| P0-3 | `server-moments/package.json` | **PASS-WITH-NOTE** | @prisma/client 版本应与 shared 对齐 |
| P0-4 | `server-push/package.json` | **PASS** | 正确，scope 控制得当 |
| P0-5 | `shared/package.json` | **PASS** | 正确，符合 R1/R2 约定 |

### 建议修改项（非阻塞）

1. **P0-2 改进:** 为 `localStorage` mock 添加 `typeof localStorage === 'undefined'` 守卫，与 matchMedia polyfill 的守卫风格统一
2. **P0-3 改进:** 将 `server-contact` 和 `server-moments` 的 `@prisma/client` 版本从 `"^6.0.0"` 改为 `"^6.1.0"`，与 `packages/shared` 对齐
3. **基线更新:** `architecture-baseline.md` 的微服务依赖表 contact 行应加入 Redis（代码已使用，仅文档需同步）

### 已知遗留问题（超出本次范围）

- `server-push` 的 `@prisma/client "^5.22.0"` 与大多数服务/共享包的 `^6.x` 版本不一致。虽各服务有独立 schema 不会直接冲突，但建议在 Prisma migrate 统一时评估是否升级。

### 审核依据

所有代码变更在通过架构规则检查的同时，**没有引入新的架构违规**。P0 修复范围控制得当，未出现 scope creep。各变更均正确针对根因而非症状。建议的三项改进均非阻塞性问题，但有助于代码健康度和一致性。
