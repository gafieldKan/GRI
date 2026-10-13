# P4-C 门户登录 / 注册 / 工作台 视觉设计（P3-UI）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，**未** commit / **未** checkout）
> 依据：`.agents/claude/tasks/p4-c-portal-visual.md`
> 起因：用户 2026-10-12 反馈「登录页面有点单调，UI 后期需要设计和实现」
> 复验：`bash .agents/claude/outputs/p4-c-verify.sh` → **PASS=47 FAIL=0 VERIFY_EXIT=0**

## 1. 变更文件

### 新增（`apps/portal/src/components/ui/`）

| 文件 | 说明 |
|---|---|
| `BrandMark.vue` | 品牌徽标（渐变/反白两态，sm/md/lg + 可选字标），登录品牌面板与工作台顶栏共用 |
| `AuthShell.vue` | 认证外壳：品牌主视觉 + 表单卡槽；移动端单列（品牌收敛为抬头）、≥900px 双列（品牌居左整幅）；背景氛围光斑 / 入场动效 / `prefers-reduced-motion` 降级 |
| `FormField.vue` | 带标签 / 提示 / 错误态的输入项；`v-model` + `@confirm` 透传；聚焦态描边、必填提示、`aria-label/aria-invalid/aria-describedby` 落到**原生 input** |

### 修改

| 文件 | 说明 |
|---|---|
| `apps/portal/src/pages/login/login.vue` | 改用 AuthShell + FormField；品牌要点卡（组织树与成员 / 邀请与审计 / 统一入口）、渐变主按钮 + hover/active/focus-visible、错误提示条（`role="alert"`）、逐字段错误态；**登录逻辑逐字未动** |
| `apps/portal/src/pages/register/index.vue` | 同款外壳；密码/确认密码桌面双列（<560px 回落单列）；`validate()` 校验规则与文案**逐字未动** |
| `apps/portal/src/pages/workbench/index.vue` | 顶栏品牌化（徽标 + 身份 + 角色徽标 + 退出）；作用域工具栏（说明 + 重置 + 带箭头的选择块）；模块卡（图标块 / 核心徽标 / 描述 / 进入模块箭头 / hover 抬升 / 入场错峰）；加载骨架；错误态；空模块态改用既有 `EmptyState`；插件行重排。**业务逻辑（loadIdentity / loadModules / toggleModule / openModule / 路由守卫）逐字未动** |

**未改动**：`main.js`、`pages.json`、`App.vue`、`api/index.js`、`console/`、`ontology-stats/`、其他三个前端、`services/**`、`packages/**`（§3 逐项断言）。

## 2. 设计语言（全部走令牌真源，N1）

- **品牌**：主色取自 `--color-primary` / `--color-primary-gradient`（portal 引用的 `themes/ai-tutor.css`），点缀 `--color-accent(-light)`；文字/背景/边框/阴影/圆角/间距/字号全用语义令牌（`--color-text-*`、`--color-bg-*`、`--shadow-*`、`--radius-*`、`--spacing-*`、`--font-size-*`）。
- **零裸色**：6 个文件经 `#hex` / `rgb()` / 具名色三重 grep 断言；品牌面板上的玻璃拟态卡用 `color-mix(in srgb, var(--color-text-inverse) 16%, transparent)`（令牌 + 透明度，不支持该函数的环境回退到 `--color-bg-overlay`，文字对比度不受影响）。
- **动效**：入场 rise（错峰 60–90ms）、悬停抬升、按钮按压、骨架 pulse、背景光斑浮动；全部声明 `prefers-reduced-motion: reduce` 降级。
- **响应式（N4）**：认证页 900px 断点双列/单列；注册密码行 560px 断点；工作台 760px / 480px 断点。390×844 下**登录按钮在首屏折叠线内**（底边 640 ≤ 844，实测）。
- **A11y（N4）**：可见标签 + `aria-label`/`aria-invalid`/`aria-describedby`（补写到 uni-app 内部原生 `input`）、错误 `role="alert"`、交互卡 `role="button"` + `aria-label`、`focus-visible` 轮廓、键盘可聚焦的链接按钮（原为不可聚焦的 `<text>`）。
- **插件开关色**：原为模板硬编码 `#1b7a3d`（裸色），改为 `onMounted` 读运行时令牌 `--color-primary` 注入 `:color`，与主题保持一致。

## 3. 行为不变（N3）证据

| 行为 | 断言 | 结果 |
|---|---|---|
| 未登录 → 登录页 | 桌面/移动端访问 `/portal/` 落到 `#/pages/login/login` | ✅ |
| 登录 → 工作台 | `testuser` 登录 → 「GRI 统一工作台」+ 角色徽标 1 枚 + 模块卡 2 张（核心徽标 + 进入模块） | ✅ |
| 跨模块 SSO 不二次登录 | 注入 `localStorage['gri-auth-token']` 后直达工作台，未出现登录页 | ✅ |
| 注册页可达 + 校验文案不变 | 空提交 → 「用户名至少 3 个字符」 | ✅ |
| 退出登录 → 回登录页 | 点「退出登录」→ 回登录页 | ✅ |
| 空模块态 | 只读拦截 `/api/modules` 返回 `[]` → `EmptyState` 渲染 | ✅ |
| 前端异常 | 全流程 `pageerror` / `console error` = **0** | ✅ |

> §4 全部为只读操作（登录/登出走既有接口，空模块态用请求拦截），未写任何业务数据。

## 4. 验证结果（本机实测）

| 段 | 结果 |
|---|---|
| §1 构建 | `apps/portal npm run build:h5` exit 0；产物 `index.html` + 12 个 js chunk；产物 CSS 已引用 `var(--color-primary)` |
| §2 令牌合规 | 6 文件 × （无裸色 + 引用令牌 ≥5 处）全绿，令牌引用合计 355 处 |
| §3 静态契约 | 其他前端零改动；`services/packages/scripts/tools/nginx` 零改动；入口/路由/其他页/接口层零改动；无新增迁移；**改动面仅限本卡 6 个文件** |
| §4 真实浏览器（playwright + 缓存 chromium，`https://localhost/portal/`） | 17 条断言全绿：路由守卫 / 双列 / 单列 / 首屏按钮 / 角色卡 / 退出 / SSO / 空态 / A11y / 异常 0 |
| §5 响应式与 A11y（静态） | `prefers-reduced-motion`、`focus-visible`、6 处媒体查询、前景/背景均走令牌 |
| 合计 | **PASS=47 FAIL=0 VERIFY_EXIT=0（SKIP=0）** |

## 5. 数据卫生与凭据

- 验收**不落任何业务数据**（§4 只读；空模块态用 `page.route` 拦截）。
- 凭据零泄漏：脚本只用 dev 测试账号（`TEST_IDENTIFIER`/`TEST_PASSWORD` 可覆盖，默认 `testuser`），不落任何密钥。

## 6. 明确未做

- 未改 API / 权限 / 接口契约；未做 Explorer（P4-A/B）；未动其他三个前端与 `pages.json` 导航栏配置。
- 未新增主题文件或修改令牌真源 `styles/tokens/**`（仅在既有令牌范围内取用）。

## 7. 自检口径

```
bash .agents/claude/outputs/p4-c-verify.sh
# → PASS=47 FAIL=0 VERIFY_EXIT=0（SKIP=0）
```
