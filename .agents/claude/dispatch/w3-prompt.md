# W3 可下达提示词（粘贴给 Claude）

> 任务卡：`.agents/claude/tasks/w3-module-world-shell.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。

---

【任务】W3：模块内容世界外壳（统一世界语言）+ 智学慧眼「学习世界」接入——把「进入模块」做成「走进该模块的世界」，与门户人本世界同一观感。

■ 必读
1. 任务卡 `.agents/claude/tasks/w3-module-world-shell.md` + `docs/PERSONA_WORLD_LANDING_PLAN.md`（v2.3）。
2. 门户 W2 产出：`styles/tokens/themes/persona-world.css`（世界令牌真源）、`apps/portal/src/utils/world-art.js`（SVG 画法引擎，零色值）、`apps/portal/src/styles/world.css`、`apps/portal/src/components/world/*`。
3. 智学慧眼：`apps/web-ai-tutor/src/pages/twin/world.vue`（1174 行，"虚拟世界·登峰"= 学科版图/营地/学科登顶）、`vite.config.js` 的 `@styles → ../../styles` 别名、`main.js` 现有令牌引入。

■ 现状（实测，勿凭印象）
- `ontology.app_module.entry_url`：tutor=`/tutor/`、food=`/food/`、org-admin=`/pages/console/index`；门户按 category 分 business(世界内)/admin|tool(世界之外)。
- 跨 app SSO 已通；门户→模块是过关式（同风格过场+跳转）。
- explorer 与本卡无关，**不得改动**。

■ 硬约束（违反即失败）
N1 统一世界语言：模块内容世界与门户**同一观感**（同 `--world-*` 令牌 + 同 SVG 画法 + 同几何类命名），不是另起皮肤。
N2 消灭重复：把 world-art 画法原语抽为**共享**（packages/world-art 或等价），portal 与 web-ai-tutor **复用同一份**；共享件**零色值**。
N3 模块内容世界**外壳**：可复用的"进入模块=进入其世界"外壳（世界顶栏：模块名 + 返回人本世界 + 过场承接）；首个接入=智学慧眼。
N4 智学慧眼「学习世界」：把现有 `pages/twin/world.vue`（登峰/版图）套入统一外壳 + 统一世界令牌；**保留学科登顶全部功能**（不重做登顶 UX——那是 W4）。
N5 进入体验：门户「学习」→（过关式）→ 学习世界；提供**回智学慧眼功能导航**路径（不困单页）。
N6 无回归：智学慧眼其余页行为不变；`build:h5` 通过；**不 commit/不 checkout**（改动留工作树）。
N7 零裸色；不改 explorer、不改后端契约；不引入 iframe。

■ 产出
1. 共享世界画法（world-art 原语）→ portal 改为引用（行为等价）。
2. web-ai-tutor：引 `@styles/tokens/themes/persona-world.css`；学习世界页/外壳（world.vue 套壳 + 世界顶栏 + 返回人本世界）；门户进入落学习世界的路径 + 回功能导航。
3. 过场承接（与门户一致）。
4. `.agents/claude/outputs/w3-file-list.md` + `w3-verify.sh`。

■ 自检
- 共享：portal 与 web-ai-tutor 复用同一份 world-art；grep 证明无第二套；共享件零色值。
- 门户「学习」→ 学习世界；观感与门户人本世界一致（同令牌/同风格）。
- 学科登顶功能保留：登峰地图渲染/营地选中/进度登顶态/学科切换可用。
- 有返回人本世界 + 回智学慧眼功能导航路径。
- 无回归；build:h5 通过；playwright：门户→学习世界→返回，pageerror=0。
- 零裸色；verify.sh 末行 FAIL=0；凭据零泄漏。
