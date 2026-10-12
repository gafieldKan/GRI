# P3-S1 门户 SSO 工作台 — 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留工作树，未 commit）
> 依据：`.agents/codex/tasks/p3-s1-portal-sso-workbench.md`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `apps/portal/src/config/modules.js` | 本地模块目录常量（9 模块：`code/name/icon/entryUrl/allowedRoles/isCore`）+ `modulesForRole(role)` 角色过滤；过滤处标注「前端仅礼貌隐藏，安全由服务端」 |
| `apps/portal/src/pages/workbench/index.vue` | 登录后工作台：`useAuthStore()` 会话 + `GET /api/identity/me` 取业务角色 → 按角色渲染插件卡片；登出走 `auth.logout()`；`/food/`、`/tutor/` 整页跳转，内页 `uni.navigateTo` |
| `apps/portal/src/pages/register/index.vue` | 注册页：`auth.register({username,email,password,name?})` → 成功后 `auth.login(...)` → 进工作台 |
| `.agents/codex/outputs/p3-s1-verify.sh` | 三段验收脚本：静态契约 / 构建断言 / 活体 E2E（不可达 SKIP，自建账号自清理） |
| `.agents/codex/outputs/p3-s1-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `apps/portal/src/pages.json` | 默认首路由改为 `pages/workbench/index`；注册 `pages/register/index`；保留 console / ontology-stats |
| `apps/portal/src/pages/login/login.vue` | 登录成功跳工作台；新增「立即注册」入口 |
| `apps/portal/src/App.vue` | 路由守卫：登录/注册页公开；未登录业务页 → 登录页；已登录访问登录/注册 → 工作台 |
| `nginx/conf.d/default.conf` | `location = /` 由静态壳改为 `return 302 /portal/;`（dev） |
| `nginx/conf.d.prod/default.conf` | `location = /` 同样指向 `return 302 /portal/;`（prod） |

## 2. 模块目录与角色可见性（前端过滤，安全由服务端）

角色闭集：`consumer | student | merchant | operator`

| code | name | allowedRoles | isCore | entryUrl |
|---|---|---|---|---|
| `food` | 订餐平台 | consumer, student, merchant, operator | ✓ | `/food/` |
| `tutor` | 智学慧眼 | student, operator | ✓ | `/tutor/` |
| `org-admin` | 组织管理台 | operator | ✓ | `/pages/console/index` |
| `ontology-stats` | 开发全流程统计 | operator | ✓ | `/pages/ontology-stats/index` |
| `identity` | 身份中心 | operator | | （待接入） |
| `curriculum` | 课程与学情 | student, operator | | （待接入） |
| `dashboard` | 经营看板 | merchant, operator | | （待接入） |
| `agent` | AI 教师 | student, operator | | （待接入） |
| `twin` | 学习孪生 | student, operator | | （待接入） |

- `consumer` 只见 `food`，看不到「组织管理台」；`operator` 9 项全见；未知角色 0 项。
- 说明：N4 —— 前端仅礼貌隐藏，安全由服务端；本卡不做后端门禁（S2 做）。

## 3. 硬约束对照

| # | 约束 | 落实 |
|---|---|---|
| N1 | 复用 auth-center + `@gri/auth-client` | 工作台/注册/登录全部经 `useAuthStore()`；无自建鉴权/会话 |
| N2 | 只改 `apps/portal/` + nginx 入口 | `git status` 仅 portal、两套 nginx、输出目录 |
| N3 | 注册 `POST /api/auth/register`；登录 `POST /auth/login`；刷新用 store | 由 `auth.register` / `auth.login` / `auth.refresh` 承载 |
| N4 | 前端过滤 + 标注注释 | `modules.js` 注释「前端仅礼貌隐藏，安全由服务端」 |
| N5 | 不引微前端，沿用 uni-app | 纯 uni-app 页面 + 整页跳转 |
| N6 | 令牌存储沿用 auth-client（uni.*） | 未见 `gri-auth-token` 手写；由 storage 封装 |

## 4. 验证结果

### 验收脚本 `bash .agents/codex/outputs/p3-s1-verify.sh`

```
全绿：PASS=44 FAIL=0 SKIP=0
```

- 静态契约：文件/页面/模块/角色过滤/nginx/守卫 共 35 项 PASS
- 构建：`apps/portal npm run build:h5` 通过，产物 `apps/portal/dist/build/h5/index.html` 存在
- 活体 E2E：`GET /` 落到 portal 壳、注册 201、登录发共享 token 对、`/api/identity/me` 角色=consumer、
  `/auth/me` externalId 对齐、登出吊销 refresh —— 全 PASS（不可达时脚本会 SKIP）

### 浏览器级 E2E（Chrome + CDP，临时脚本已清理）

- 未登录：`/` 显示登录页 + 注册入口，**不出现**工作台内容
- 注册：新用户注册后进入工作台，consumer 只见 `food`，不见「组织管理台」
- 刷新：会话保持（auth-client storage 还原）
- SSO：登录后 `/portal/`、`/food/`、`/tutor/` 共享同一 `gri-auth-token`，免重复登录
- 登出：清 token 并回登录页

### 收尾

- `git diff --check` 干净
- 测试账号（`p3ui_*` / `p3s1_*`）在 `public.users` 均为 `deleted`，无活跃测试用户残留
- 未 commit、未 checkout；临时浏览器脚本 `/tmp/p3-s1-browser-check.mjs` 已删除

## 5. 明确不做（划界）

- 不做后端模块注册表（S2）/ 用户选用持久化（S3）/ 维度挂接（S4）/ 微前端。
