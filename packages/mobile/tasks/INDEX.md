# 仿微信系统 - 任务拆分索引

> 所有任务按 Phase 组织，标注状态和依赖关系。供多 agent 并行调度使用。

## 任务状态图 (依赖关系)

```
Phase 1: Foundation
─────────────────────
T001 (脚手架)
  ├── T002 (数据库设计)
  ├── T003 (公共模块/类型)
  │     └── T002
  ├── T004 (用户认证) ─── 依赖 T002, T003
  ├── T005 (API网关) ─── 依赖 T003, T004
  └── T006 (配置中心) ─── 依赖 T001

Phase 2: Core IM Backend
─────────────────────
T007 (WebSocket网关) ─── 依赖 T005, T004
T008 (消息服务) ─── 依赖 T007, T002
T009 (通讯录服务) ─── 依赖 T005, T002
T010 (群聊服务) ─── 依赖 T009, T008
T011 (文件服务) ─── 依赖 T005
T012 (推送服务) ─── 依赖 T008, T007

Phase 3: Frontend Core
─────────────────────
T013 (前端初始化) ─── 依赖 T003
T014 (登录注册页) ─── 依赖 T013, T004
T015 (通讯录UI) ─── 依赖 T013, T009
T016 (单聊UI) ─── 依赖 T013, T008, T007
T017 (群聊UI) ─── 依赖 T016, T010
T018 (WebSocket客户端) ─── 依赖 T013, T007

Phase 4: Social Features
─────────────────────
T019 (朋友圈服务) ─── 依赖 T005, T002
T020 (朋友圈UI) ─── 依赖 T013, T019
T021 (音视频通话) ─── 依赖 T007, T013
T022 (消息搜索) ─── 依赖 T008

Phase 5: Extended Features
─────────────────────
T023 (表情贴图) ─── 依赖 T011, T016
T024 (二维码) ─── 依赖 T013
T025 (推送通知) ─── 依赖 T012
T026 (红包系统) ─── 依赖 T008

Phase 6: Testing & DevOps
─────────────────────
T027 (单元测试) ─── 依赖 Phase 1-5 各模块 (可随开发并行)
T028 (集成测试) ─── 依赖 全部核心服务
T029 (E2E测试) ─── 依赖 T028
T030 (容器化部署) ─── 依赖 T001
T031 (性能压测) ─── 依赖 T028, T030
```

---

## 任务总览

| ID | 任务 | 阶段 | 优先级 | 状态 | 依赖 | 预估工时 |
|----|------|------|--------|------|------|----------|
| T001 | 项目脚手架搭建 | P1 | 🔴 high | ⬜ pending | - | 4h |
| T002 | 数据库 Schema 设计 | P1 | 🔴 high | ⬜ pending | T001 | 8h |
| T003 | 公共模块与共享类型 | P1 | 🔴 high | ⬜ pending | T001 | 4h |
| T004 | 用户认证服务 | P1 | 🔴 high | ⬜ pending | T002,T003 | 8h |
| T005 | API 网关 | P1 | 🔴 high | ⬜ pending | T003,T004 | 8h |
| T006 | 配置中心 | P1 | 🟡 medium | ⬜ pending | T001 | 4h |
| T007 | WebSocket 网关 | P2 | 🔴 high | ⬜ pending | T004,T005 | 12h |
| T008 | 消息服务 | P2 | 🔴 high | ⬜ pending | T007,T002 | 16h |
| T009 | 通讯录服务 | P2 | 🔴 high | ⬜ pending | T005,T002 | 8h |
| T010 | 群聊服务 | P2 | 🔴 high | ⬜ pending | T009,T008 | 12h |
| T011 | 文件/媒体服务 | P2 | 🟡 medium | ⬜ pending | T005 | 8h |
| T012 | 消息推送服务 | P2 | 🟡 medium | ⬜ pending | T008,T007 | 8h |
| T013 | 前端项目初始化 | P3 | 🔴 high | ⬜ pending | T003 | 4h |
| T014 | 登录注册页面 | P3 | 🔴 high | ⬜ pending | T013,T004 | 6h |
| T015 | 通讯录前端 | P3 | 🔴 high | ⬜ pending | T013,T009 | 8h |
| T016 | 单聊界面 | P3 | 🔴 high | ⬜ pending | T013,T008,T007 | 16h |
| T017 | 群聊界面 | P3 | 🔴 high | ⬜ pending | T016,T010 | 12h |
| T018 | WebSocket 客户端 | P3 | 🔴 high | ⬜ pending | T013,T007 | 8h |
| T019 | 朋友圈后端服务 | P4 | 🟡 medium | ⬜ pending | T005,T002 | 12h |
| T020 | 朋友圈前端 | P4 | 🟡 medium | ⬜ pending | T013,T019 | 12h |
| T021 | 音视频通话 | P4 | 🟡 medium | ⬜ pending | T007,T013 | 16h |
| T022 | 消息搜索 | P4 | 🟢 low | ⬜ pending | T008 | 8h |
| T023 | 表情贴图系统 | P5 | 🟢 low | ⬜ pending | T011,T016 | 6h |
| T024 | 二维码系统 | P5 | 🟡 medium | ⬜ pending | T013 | 6h |
| T025 | 推送通知 | P5 | 🟢 low | ⬜ pending | T012 | 8h |
| T026 | 红包系统 | P5 | 🟢 low | ⬜ pending | T008 | 12h |
| T027 | 单元测试 | P6 | 🟡 medium | ⬜ pending | (随开发并行) | 持续 |
| T028 | 集成测试 | P6 | 🟡 medium | ⬜ pending | T027 | 16h |
| T029 | E2E 测试 | P6 | 🟡 medium | ⬜ pending | T028 | 12h |
| T030 | Docker 容器化部署 | P6 | 🟡 medium | ⬜ pending | T001 | 8h |
| T031 | 性能基准测试 | P6 | 🟢 low | ⬜ pending | T028,T030 | 8h |

---

## Phase 说明

| Phase | 名称 | 说明 |
|-------|------|------|
| P1 | 基础设施与用户系统 | 项目底座，所有后续任务的前置 |
| P2 | 核心 IM 后端 | 消息、通讯录、群聊等核心能力 |
| P3 | 前端核心体验 | 聊天界面、通讯录等用户可见功能 |
| P4 | 社交功能 | 朋友圈、音视频通话、搜索 |
| P5 | 扩展功能 | 表情、红包、二维码、推送 |
| P6 | 测试与 DevOps | 质量保障与部署 |

## Agent 分配建议

```
Agent-Backend-1  → T002, T004, T008, T012
Agent-Backend-2  → T003, T005, T007, T009, T010
Agent-Backend-3  → T006, T011, T019, T022
Agent-Frontend-1 → T013, T014, T015, T020
Agent-Frontend-2 → T016, T017, T018, T021
Agent-Fullstack  → T023, T024, T025, T026
Agent-DevOps     → T001, T027, T028, T029, T030, T031
```
