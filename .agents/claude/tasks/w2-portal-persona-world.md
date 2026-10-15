# W2：门户「人本世界」—— 登录即人物 · 2D/SVG 拟真生活全景 · 工作台并入

> 执行者：Claude ｜ 波次：Persona World（人本世界）｜ 依赖：**W1（Codex）先完成并复验** ｜ 状态：待下达（串行，W1 后）
> 依据：`docs/PERSONA_WORLD_LANDING_PLAN.md`（v2.3）+ 原型 `人物数字孪生系统_C1.html`
> 定位：把门户「工作台」升级为「**人本世界**」——登录成功 = 人物激活，进入以人为本的生活全景；场景/意向 → 打开模块（过关式）。

## 📥 承重事实（实测，勿凭印象）

- 门户：`apps/portal`（uni-app H5），登录成功现落 `pages/workbench`（模块卡列表），已有 `AuthShell/BrandMark/FormField` 与令牌体系（P4-C）。
- 参考原型：`人物数字孪生系统_C1.html`（852 行，**纯 SVG**，7 视图 + 虚拟城市 6 场景 + 人物当前位置）——**视觉蓝本**。
- **现有 SVG 地图先例**：`apps/web-ai-tutor/src/pages/twin/world.vue`（uni-app 内联 SVG 地图，1174 行）——uni-app **可做内联 SVG**，照此实现。
- W1 提供的读 API：`GET /api/context/me`（激活上下文）、`GET /api/world`（7 场景+意向+模块映射）、`GET /api/organizations/mine`、`GET /api/twin/me`。
- 模块可见性：`ontology.app_module.allowed_roles`（授权）+ `ontology.user_module`（选用）；世界**只呈现"你能用的"**。
- 过渡：门户→模块走 SSO（`gri-auth-token` 同源，免二登）；**过关式**（同风格过场 + 跳转），非无缝同一地图。
- **运营后台（组织管理台/统计/身份中心/看板）保留独立入口，不进人本世界**（用户定）。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **登录成功 → 人物首页 = 人本世界**（不再是模块卡列表）；身份/退出保留；**运营后台独立入口**保留在壳层（世界之外）。 |
| N2 | **2D/SVG 拟真**（等距/写实描摹插画风，非卡通扁平）：生活全景图 + 场景 + 人物头像与位置；**不做 3D**。 |
| N3 | **场景/意向驱动**：点场景 → 场景内意向（"我饿了/我想学"）→ 打开/申请对应模块；**不出现"应用图标墙"**。 |
| N4 | **数据只取 W1 API**（`/api/context/me`、`/api/world`、`/api/organizations/mine`、`/api/twin/me`），不造第二真源；W1 不可用须有降级态。 |
| N5 | **组织 = 入口卡**（主要静态信息）→ 点开跳**组织孪生页占位**（组织孪生本体后续期；本卡只做占位入口与静态摘要）。 |
| N6 | **工作台并入**：原模块卡表现为"我的模块 / 常去的地方"（符合人本论），**不再是与世界割裂的卡片页**。 |
| N7 | 零裸色（GRI 令牌）；沿用 `AuthShell/BrandMark`；不改 region/industry/explorer；不 commit/不 checkout（改动留工作树）。 |

## 📦 产出物

- `apps/portal/src/pages/world/*`（或 workbench 改造）：人本世界主视图 = 人物卡 + SVG 生活全景 + 场景/意向交互 + 我的模块。
- 组件：`LifeWorld.vue`（SVG 全景 + 场景热区 + 人物位置）、`PersonaCard.vue`、`OrgCard.vue`、`IntentSheet.vue`（场景内意向）。
- 壳层：登录落点改 `world`；运营后台独立入口。
- 过关式过渡（同风格过场动画 + SSO 跳转）。
- `.agents/claude/outputs/w2-file-list.md` + `w2-verify.sh`。

## ✅ 验收标准

1. 登录成功 → **人本世界**（非模块卡列表）；未见未授权模块。
2. **7 个生活场景**渲染（拟真 SVG、可辨识主题）；人物卡显示 `context/me` 的 profile/state（姓名/角色/精力/经历/等级）。
3. 点「餐饮」→ 意向（我饿了/订午饭）→ 打开 `food`（SSO 免二登）；「学习」→ `tutor`；「工作」→ `org-admin`/`dashboard`；未开放场景显示"建设中"。
4. **组织卡**列出 `organizations/mine` 的组织（name/type/角色）→ 点开组织**孪生占位页**。
5. **运营后台**独立入口可达；世界内不出现运营模块。
6. 零裸色（hex/rgb/具名色 三重 grep 空）；真实浏览器（playwright）跑：登录→世界→场景→意向→模块，**pageerror=0**；移动端单列可用。
7. `verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。
