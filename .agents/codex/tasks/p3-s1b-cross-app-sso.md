# P3-S1b：跨模块统一 SSO（消除二次登录）★补卡

> 执行者：Codex ｜ 波次：P3 ｜ 依赖：**S1** ｜ 状态：待下达
> 起因：用户实测 S1 → **portal 登录后点「订餐」「AI 辅导」仍要二次登录**。审计（CDP 注入 `gri-auth-token` 后逐端导航）确认**两端都二次登录**，且原因不同。S1 的 SSO 验收**过度声称**（只验 token 同源共享，未验各端真的消费）。

## 🎯 本卡定位

S1 的 SSO 只在 **portal 内**成立。各模块前端仍是**各自登录**，故点进模块要再登一次。
本卡：**全部模块前端共享同一会话**；**未登录一律回 portal 登录**（唯一登录入口）。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **单一登录入口 = portal（`/`）**。模块前端未登录时**跳 portal 登录**，不再把各自登录页当首选入口。 |
| N2 | 会话真源 = `@gri/auth-client` 的 **`gri-auth-token`**（同源 `localStorage`；值含 `accessToken/refreshToken/user`）。 |
| N3 | 身份仍走 `auth-center`；**不新建鉴权**。 |
| N4 | 逐端最小改动：**优先 `apps/web`（订餐，硬缺口）**；`web-ai-tutor` / `mini-program-ai-tutor` **复核**（已接 auth-client，确认 on-launch `restore()` + token 在则不跳自己登录）。 |
| N5 | 保留各端 UI 特有态（如 web 的 `darkMode/loginMethod`）——**不必整包替换** store，只需只把**会话读写对齐**到 `gri-auth-token`。 |

## 📥 承重事实（实测：CDP 注入 `gri-auth-token` 后逐端导航）

| 端 | 机制 | 实测 |
|---|---|---|
| `apps/portal` | auth-client | ✅ 落 `#/`，工作台 → **SSO 正常** |
| **`apps/web`（订餐）** | **无 auth-client**；自建 `store/auth.js`（键 **≠** `gri-auth-token`）；登录走 `/auth/login`（身份已统一，会话不共享）；守卫跳自己的 `/pages/login/login` | ❌ 注入 token 后**仍显示自己登录页** |
| **`apps/web-ai-tutor`（AI辅导）** | 已接 auth-client + `onLaunch restore()`；**但 `pages.json` 首路由 = `pages/login/login`**，守卫**无「已登录→回首页」分支** | ❌ 注入 token 后**仍停在登录页**（token 已还原，页面不跳） |

- 三端同源（`https://localhost/{,food,tutor,portal}`）→ `localStorage` 可跨端共享。
- `apps/mini-program-ai-tutor` 属**微信平台**，非 web SSO 范围（单列复核）。

## 📦 产出物

- `apps/web`（订餐）：会话对齐 `gri-auth-token`（读/写或经 auth-client storage 适配）+ 未登录**跳 portal**（`/`）
- `apps/web-ai-tutor`（AI辅导）：**首路由改首页**（`pages/index/index`）或加「已登录→跳首页」守卫分支 + 未登录跳 portal
- `apps/mini-program-ai-tutor`：复核（微信端，独立）
- `.agents/codex/outputs/p3-s1b-file-list.md` + `p3-s1b-verify.sh`

## ✅ 验收标准（跨端，硬性）

1. portal 登录 → 直访 `/food/`、`/tutor/`、`/portal/` **不出现登录页**。
2. **未登录**直访 `/food/`（或 `/tutor/`）→ 回 **portal 登录（`/`）**。
3. portal **登出** → 各端会话**同步失效**。
4. 各端 `npm run build:h5` 通过；既有功能不回归。
5. `verify.sh` 覆盖上述 1–3（不可达则 SKIP）。
