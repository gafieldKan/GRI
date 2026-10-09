# Task-1 交付索引（Claude / 架构师）

> 执行日期：2026-10-07 | 分支：`feat/stage-c-unified-auth-shell` | 角色：GRI 项目架构师

## ⚠️ 首要结论：任务前提已过时（stale premise）

任务卡 `task-1-auth-integration.md` 假设要往**两个旧 Express 后端**（`services/backend` 订餐 +
`services/ai-tutor-backend` AI 辅导）接入 JWT 公钥校验中间件。**这两个服务在仓库中已不存在**——
它们已在重写收敛中退役，能力全部并入单一后端 `services/api`（NestJS）。
统一鉴权中间件**早已存在并挂载**（`services/api/src/auth/`）。

因此本任务的**真实形态**是：**核验并收口**既有统一鉴权闭环，而非新建两套中间件。
盲目按原文在 `services/backend/` 下新建文件会**复活已退役服务**，违反重写收敛红线。

详见：`task-1-auth-integration-design.md` §1「前提核验」。

## 📦 交付物清单

| # | 文件 | 对应任务交付物 | 状态 |
|---|------|----------------|------|
| 0 | `README.md`（本文件） | 索引 + 决策摘要 | ✅ |
| 1 | `task-1-auth-integration-design.md` | 交付物 1「统一中间件设计文档」 | ✅ 含前提核验/架构/接口/白名单/req.auth/错误码/风险评估 |
| 2 | `task-1-jwt-verifier-jwks-cache.patch` | 交付物 2/3「接入代码」的**真实缺口修复** | ✅ 已定位真实缺陷并给出可应用补丁（`git apply` 已校验） |
| 2b | `task-1-jwt-verifier-jwks-cache.regression.test.js` | 上述修复的**回归测试**（放 `packages/jwt-verifier/tests/`） | ✅ 已实测 red→green |
| 3 | `task-1-e2e-verification.sh` | 交付物 4「端到端验证脚本」 | ✅ 可执行（`bash -n` 通过） |
| 4 | `task-1-risk-rollback.md` | 交付物 5「风险评估与回滚文档」 | ✅ |

## 🎯 验收标准（AC）映射

| # | 原 AC | 对现状判定 | 依据 |
|---|-------|-----------|------|
| 1 | backend 接入中间件 | **PASS（收敛后即满足）** | `services/backend` 已退役 → `services/api` 全局 `AuthRouterMiddleware` 一处挂接（`main.ts:29-30`） |
| 2 | ai-tutor-backend 接入中间件 | **PASS（收敛后即满足）** | 同上，`services/ai-tutor-backend` 已退役 |
| 3 | `studentId === JWT.sub`，无硬编码 `student_001` | **部分冲突（需裁决）** | 生产码已无硬编码（仅测试夹具残留）；但业务真源是 `req.auth.externalId`(=users.id) **而非 `sub`**。见 design §5 |
| 4 | 端到端闭环 | **脚本已交付**；预期全绿（含 JWKS 缓存修复） | `task-1-e2e-verification.sh` |
| 5 | 回滚策略文档化 | **PASS** | `task-1-risk-rollback.md` |

## 🔴 需你裁决的 3 个决策点（对应任务 §"需你确认"）

1. **JWKS 刷新机制**：现状为**事件驱动**（kid 不匹配触发重拉），**无定时器**。
   比任务建议的「5 分钟定时」更优（无陈旧窗口、无空转），**建议保留**；
   但实现存在**真实缺陷**——JWKS 路径下**每请求都拉一次**（缓存被写却从不命中），已给补丁。
   → **建议：采纳补丁，刷新机制维持事件驱动，不引入定时器。**

2. **白名单策略**：现状为 **`services/api/src/auth/public-routes.ts` 单文件集中定义**（各业务自持，
   不向 auth-center 下发）。**建议保留**——auth-center 是**签发者**不是**策略服务器**，
   下发白名单会把授权决策耦合进身份域，违背「身份唯一真源」边界。

3. **旧登录端点保留期**：**已无对象**——旧后端连同其 `/api/auth/login` 已退役；
   现网唯一登录入口即 auth-center `/auth/login`，三前端已走 `@gri/auth-client`。
   → **无需 2 周下线窗口**，任务此项作废。

## ✅ 下一步（待你批准）

- [ ] 批准「以收敛后现状为准」的重述结论（不再新建两旧后端中间件）。
- [ ] 批准对 `packages/jwt-verifier` 应用 JWKS 缓存补丁（`task-1-jwt-verifier-jwks-cache.patch`）+ 回归测试。
- [ ] 裁决 AC#3：**维持 `externalId` 为业务真源**（推荐，合红线）抑或新增 `studentId` 别名（**不推荐**，破坏唯一真源）。
- [ ] 在 docker compose 环境执行 `task-1-e2e-verification.sh` 取全绿回执。
