# P3-S1b 跨模块统一 SSO — 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留工作树，未 commit / 未 checkout）
> 依据：`.agents/codex/tasks/p3-s1b-cross-app-sso.md`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `apps/web/src/store/session.js` | 订餐端共享会话桥：复用 `@gri/auth-client` 的 `createStorage`，统一读写 `gri-auth-token`；把 auth-client 的 `externalId` 映射为订餐端既有 `user.id`；H5 未登录统一整页跳转 portal `/` |
| `.agents/codex/outputs/p3-s1b-verify.sh` | 三段验收脚本：静态契约 / 两端 H5 构建 / 活体浏览器 E2E（不可达或缺少 Chrome 时 SKIP，自建账号自清理） |
| `.agents/codex/outputs/p3-s1b-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `apps/web/package.json` | 增加 `@gri/auth-client` 依赖；订餐端不再自造共享存储格式 |
| `package-lock.json` | 同步订餐端 `@gri/auth-client` 工作区依赖 |
| `apps/web/src/store/auth.js` | `gri-auth-token` 成为会话真源：启动/跨标签同步以共享键为准；登录、刷新轮转、登出回写或清除共享键；未登录/登出走 portal，而不是订餐端自建登录页；保留 `darkMode / loginMethod / activeProduct` 等 UI 特有态 |
| `apps/web/src/App.vue` | 启动时从共享键还原并监听 `storage`；portal 登录同步会话，portal 登出同步失效并回 portal |
| `apps/web/src/pages/login/login.vue` | 保留既有登录页兜底，但登录成功后回 portal 统一入口；模块端不再把自身登录页作为首选入口 |
| `apps/web-ai-tutor/src/pages.json` | 首路由由 `pages/login/login` 改为 `pages/index/index`，有共享 token 时直接进入业务首页 |
| `apps/web-ai-tutor/src/App.vue` | 未登录统一整页跳 portal `/`；监听共享键的登录/登出事件；跨标签登录时先重置内存态再 `restore()`，避免先 `_clear()` 删除刚写入的共享会话 |

## 2. Mini-program 复核

`apps/mini-program-ai-tutor` 属微信平台，不在本次浏览器同源 SSO 范围，未做改动：

- `App.vue` 仍使用 `@gri/auth-client` 派生的小程序 store。
- `pages.json` 仍以 `pages/login/login` 为首路由，保留微信端独立登录流程。
- 本次仅复核并记录边界，未引入 web/portal 重定向。

## 3. 关键行为

| 场景 | 结果 |
|---|---|
| 未登录直访 `/food/` 或 `/tutor/` | 离开模块并到 portal `/` 登录页 |
| portal 登录后直访 `/food/` | 停在订餐首页，不出现模块登录页 |
| portal 登录后直访 `/tutor/` | 停在 AI 辅导业务首页，不出现模块登录页 |
| 刷新/重新导航 | `gri-auth-token` 继续提供会话；订餐端刷新轮转时回写新的 token 对 |
| 跨标签 portal 登录 | food / tutor 监听共享键并同步，不删除新会话 |
| portal 退出登录 | `gri-auth-token` 移除；已打开的 food / tutor 标签同步失效并回 portal |
| 登出后再次直访 food / tutor | 回 portal 登录页 |

本卡不新增鉴权或会话实现，身份仍由 auth-center 签发；浏览器端只消费 `@gri/auth-client` 的 `gri-auth-token`。

## 4. 验证结果

执行：

```bash
bash .agents/codex/outputs/p3-s1b-verify.sh
```

结果：

```text
全绿：PASS=44 FAIL=0 SKIP=0
LIVE_PASS=10
LIVE_FAIL=0
```

覆盖：

- 静态契约：共享键桥、两端守卫、portal 重定向、mini-program 复核边界。
- 构建：`apps/web npm run build:h5`、`apps/web-ai-tutor npm run build:h5` 均通过且产物存在。
- 活体 E2E：真实 portal 登录 UI → `/food/`、`/tutor/` 免二次登录；订餐端 refresh 轮转回写；跨标签登录同步；真实 portal 登出 UI → 已打开的 food / tutor 会话同步失效；测试账号已清理。

开发过程中额外用红绿回归捕获并修复了 tutor 跨标签登录会先删除 `gri-auth-token` 的问题：修复前 `PASS=8 FAIL=1`，修复后临时浏览器回归 `PASS=9 FAIL=0`；最终交付脚本进一步以三标签真实 storage 事件验证为 `LIVE_PASS=10 LIVE_FAIL=0`。

## 5. 明确不做

- 不做后端注册表（S2）/ 用户选用持久化（S3）/ 维度挂接（S4）。
- 不做微前端。
- 不重做各端登录页视觉。
- 不改 portal S1 页面、nginx 或其他前端。
