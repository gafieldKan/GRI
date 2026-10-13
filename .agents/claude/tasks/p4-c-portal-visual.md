# P4-C：门户登录 / 工作台 视觉设计（P3-UI）

> 执行者：Claude ｜ 波次：P4 ｜ 依赖：无 ｜ 状态：待下达
> 起因：用户 2026-10-12 反馈「登录页面有点单调，UI 后期需要设计和实现」。本卡做**视觉设计与实现**。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **走设计令牌**（`styles/tokens/global.css` + `themes/*`）——**禁裸色**（新代码）。 |
| N2 | 只改 `apps/portal/src/pages/{login,register,workbench}/` + 必要共享样式；**不改**业务逻辑/接口契约。 |
| N3 | 保持既有功能：登录/注册/SSO 会话/按角色渲染插件/SSO 跳转全部**行为不变**。 |
| N4 | 响应式（H5 移动优先，桌面可用）；保留 A11y（focus-visible、对比度 AA）。 |
| N5 | 不改其他前端（web/web-ai-tutor/mini-program）。 |

## 📥 承重事实

- 现有页：`apps/portal/src/pages/login/login.vue`、`register/index.vue`、`workbench/index.vue`（uni-app + Vue3）。
- 令牌真源 `styles/tokens/`（`--color-primary` 等）；portal main.js 已引 `@styles/tokens`。
- 工作台卡片由 `GET /api/modules` 驱动（角色过滤）；SSO 读 `gri-auth-token`。

## 📦 产出物

- 登录/注册/工作台页的**视觉升级**（品牌主视觉、层次、留白、状态与动效）；可加 `apps/portal/src/components/ui/*` 复用件。
- `.agents/claude/outputs/p4-c-file-list.md` + `p4-c-verify.sh`（含 `npm run build:h5` + 关键行为断言）

## ✅ 验收标准

1. `apps/portal npm run build:h5` 通过；无裸色（grep 断言）；异常 0。
2. 行为不变：未登录→登录/注册；登录→工作台（按角色卡片）；跨模块 SSO 不二次登录。
3. 视觉：明显比现状更"完整/专业"（品牌感、可读性、移动端适配）。
4. `verify.sh` FAIL=0。

## 🚫 明确不做

- 不改 API/权限；不做 Explorer（P4-B/A）。
