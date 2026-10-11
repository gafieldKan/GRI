# P3-S1：门户 SSO 工作台（登录/注册 + 按角色插件目录）

> 执行者：Codex ｜ 波次：P3（方案1 务实门户）｜ 依赖：无 ｜ 依据：`docs/SSO_PORTAL_PLUGIN_PLAN.md §8`
> 状态：待下达

## 🎯 本卡定位

把「GRI 统一入口」从**静态壳**升级为 **SSO 工作台**：
- **未登录** → 登录 / 注册页；
- **已登录** → 工作台（插件卡片，**按登录人角色**过滤）。

本卡先落 **SSO + 工作台骨架**，模块目录暂用**本地常量**（S2 再搬到后端注册表 `/api/modules`）。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| N1 | **复用** `auth-center` + `@gri/auth-client`，**不新建鉴权**、不另造会话。 |
| N2 | 只改 `apps/portal/`（+ nginx 入口指向）；**不碰**其他前端（web / web-ai-tutor / mini-program）。 |
| N3 | 注册走 `POST /api/auth/register`（auth-client 已有 `register`）；登录走 `POST /auth/login`；会话/刷新用 auth-client store。 |
| N4 | 卡片可见性**前端过滤**即可，但代码注释须**明确标注**"前端仅礼貌隐藏，安全由服务端"——本卡**不做**后端门禁（S2 做）。 |
| N5 | **不引入微前端**；沿用 uni-app。 |
| N6 | 令牌存储沿用 `@gri/auth-client` 的 storage（uni.*），不另造。 |

## 📥 承重事实（实测，勿按旧现实臆测）

- 入口 `/` 现由 nginx serve **静态** `apps/portal/index.shell.html`（`nginx/conf.d/default.conf` 的 `location = /`）。
- portal 是 **uni-app 应用**，serve 在 `/portal/`；已有 `apps/portal/src/pages/login/login.vue`（已用 auth-client 登录）。
- auth-center 端点：`POST /auth/login {identifier,password}` · `POST /api/auth/register {username,email,password,name?}` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`。
- 角色闭集（`public.users.role`）：`consumer | student | merchant | operator`。
- 现有 9 模块入口：`/food/`（app web）· `/tutor/`（web-ai-tutor）· `/portal/`（本 app 组织台）· 其余为后端能力。

## 📦 产出物

| 文件 | 动作 |
|---|---|
| `apps/portal/src/pages/workbench/index.vue` | 新增：工作台（登录后；按角色渲染插件卡片） |
| `apps/portal/src/pages/register/index.vue` | 新增：注册页（若无） |
| `apps/portal/src/config/modules.js` | 新增：本地模块目录常量（9 模块：code/name/icon/entryUrl/allowedRoles/isCore） |
| `apps/portal/src/pages.json` | 注册新页；入口路由（默认→工作台，未登录→login） |
| nginx 入口 | `/` 指向工作台入口（serve portal dist 或 redirect `/portal/`） |
| `.agents/codex/outputs/p3-s1-file-list.md` + `p3-s1-verify.sh` | 产出清单 + 验收脚本 |

## ✅ 验收标准（硬性）

1. `apps/portal` `npm run build:h5` 通过。
2. 浏览器 `/`：**未登录** → 登录/注册页；**不出现**业务工作台内容。
3. 登录成功 → 工作台；卡片**按角色过滤**（`consumer` 看不到「组织管理台」；`operator` 全可见）。
4. **SSO**：登录后访问 `/portal/`、`/food/`、`/tutor/` **不需重复登录**（共享会话）；刷新保持；登出回登录页。
5. 注册流程可用（新用户注册后可登录进入工作台）。
6. 验收脚本 `p3-s1-verify.sh` 三段：静态断言 / 构建断言 / 活体 E2E（不可达则 SKIP）。

## 🚫 明确不做（划界，防蔓延）

- 不做后端注册表（S2）；不做"选用"持久化（S3）；不做维度挂接（S4）；不做微前端。
