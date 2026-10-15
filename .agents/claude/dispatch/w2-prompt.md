# W2 可下达提示词（粘贴给 Claude，**W1 复验通过后再下达**）

> 任务卡：`.agents/claude/tasks/w2-portal-persona-world.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。**串行：W1 未复验前不要开工。**

---

【任务】W2：把门户「工作台」升级为「人本世界」——登录即人物激活，进入 2D/SVG 拟真生活全景；场景/意向 → 打开模块（过关式）。

■ 必读
1. 任务卡 `.agents/claude/tasks/w2-portal-persona-world.md` + `docs/PERSONA_WORLD_LANDING_PLAN.md`。
2. 视觉蓝本：原型 `人物数字孪生系统_C1.html`（纯 SVG 虚拟城市）——**拟真插画风，非卡通扁平**。
3. 现成先例：`apps/web-ai-tutor/src/pages/twin/world.vue`（uni-app 内联 SVG 地图）。
4. 门户现状：`apps/portal/src/pages/workbench/index.vue`（模块卡）+ `components/ui/{AuthShell,BrandMark,FormField}.vue` + 令牌体系（P4-C）。
5. W1 API：`GET /api/context/me` / `GET /api/world` / `GET /api/organizations/mine` / `GET /api/twin/me`。

■ 硬约束（违反即失败）
N1 **登录成功 → 人本世界**（不再是模块卡列表）；身份/退出保留；**运营后台独立入口**留在世界之外。
N2 **2D/SVG 拟真**（等距/写实描摹）；生活全景 + 场景 + 人物头像与位置；**不做 3D**。
N3 **场景/意向驱动**（点场景→意向→打开/申请模块）；**不出现"应用图标墙"**。
N4 **只取 W1 API**，不造第二真源；W1 不可用要有降级态。
N5 **组织=入口卡**（静态摘要）→ 跳**组织孪生占位页**（组织孪生本体后续）。
N6 **工作台并入**：原模块卡表现为"我的模块/常去的地方"，不再是与世界割裂的卡片页。
N7 零裸色（GRI 令牌）；不改 region/industry/explorer；**不 commit/不 checkout**（改动留工作树）。

■ 产出
1. `apps/portal/src/pages/world/*`：人本世界主视图（人物卡 + SVG 生活全景 + 场景/意向 + 我的模块）。
2. 组件：`LifeWorld.vue`（SVG 全景+热区+人物位置）、`PersonaCard.vue`、`OrgCard.vue`、`IntentSheet.vue`。
3. 登录落点改 `world`；运营后台独立入口；过关式过场（同风格 + SSO 跳转）。
4. `.agents/claude/outputs/w2-file-list.md` + `w2-verify.sh`。

■ 自检
- 登录→人本世界（非卡片列表）；未授权模块不出现。
- 7 场景拟真渲染；人物卡显示 profile/state（名/角色/精力/经历/等级）。
- 餐饮→food、学习→tutor、工作→org-admin/dashboard（SSO 免二登）；未开放场景"建设中"。
- 组织卡列出 organizations/mine → 组织孪生占位页。
- 运营后台独立入口可达；世界内无运营模块。
- 零裸色（hex/rgb/具名色 三重 grep 空）；playwright：登录→世界→场景→意向→模块，pageerror=0；移动端单列可用。
- `verify.sh` 末行 `FAIL=0`；凭据零泄漏。
