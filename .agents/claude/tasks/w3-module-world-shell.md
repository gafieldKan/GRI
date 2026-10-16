# W3：模块内容世界外壳（统一世界语言）+ 智学慧眼「学习世界」接入

> 执行者：Claude ｜ 波次：Persona World ｜ 依赖：**W1/W2 已完成并复验**（`64521f8`/`3b67661`）｜ 状态：待下达
> 依据：`docs/PERSONA_WORLD_LANDING_PLAN.md`（v2.3）
> 定位：把「进入模块」做成「**走进该模块的世界**」——用**与门户人本世界同一套世界观感**承载模块内容世界；首个接入 = **智学慧眼「学习世界」**（学科版图/登峰）。

## 📥 承重事实（实测，勿凭印象）

- 门户（W2）：`apps/portal` 人本世界；**世界令牌真源** `styles/tokens/themes/persona-world.css`（121 个 `--world-*`）；**SVG 画法引擎** `apps/portal/src/utils/world-art.js`（436 行，纯几何零色值）；几何类 `apps/portal/src/styles/world.css`。
- 门户如何进模块：`ontology.app_module.entry_url`（`tutor=/tutor/`、`food=/food/`、`org-admin=/pages/console/index`）。门户按 `category` 分：`business`=世界内，`admin|tool`=世界之外（运营后台）。
- 智学慧眼：`apps/web-ai-tutor`；vite 有别名 **`@styles → ../../styles`**（`main.js` 已 `import '@styles/tokens/themes/ai-tutor.css'`）→ **可直接引 `@styles/tokens/themes/persona-world.css`**。
- **智学慧眼已有"内容世界"雏形**：`apps/web-ai-tutor/src/pages/twin/world.vue`（**1174 行**，"虚拟世界 · 登峰"：学科版图 + 营地 + **学科登顶**）——这是本卡要接入的"学习世界"。
- 跨 app SSO 已通（`gri-auth-token` 同源，P3-S1b）；门户→模块为**过关式**（同风格过场 + 跳转）。
- `apps/explorer`（区域/行业/资源）与此无关，**不得改动**。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **统一世界语言**：模块内容世界必须与门户人本世界**同一观感**（同 `--world-*` 令牌 + 同 SVG 画法风格 + 同几何类命名），不是另起一套皮肤。 |
| N2 | **消灭重复**：把 `world-art.js` 的画法原语抽为**共享**（`packages/world-art` 或等价共享位），portal 与 web-ai-tutor **复用同一份**（禁止两处各写一套）。共享件**零色值**（颜色只来自令牌）。 |
| N3 | **模块内容世界外壳**：提供可复用的"进入模块=进入其世界"外壳（世界顶栏：模块名 + **返回人本世界** + 过场承接），首个接入=智学慧眼。 |
| N4 | **智学慧眼「学习世界」**：将现有 `pages/twin/world.vue`（登峰/版图）**套入统一外壳 + 统一世界令牌**；**保留学科登顶的全部功能与交互**（本卡不重做登顶 UX，那是 W4）。 |
| N5 | **进入体验**：门户「学习」意向 →（过关式）→ 智学慧眼**学习世界**；提供**回到智学慧眼功能导航**的路径（不得把用户困在单页）。 |
| N6 | **无回归**：智学慧眼其余页（index/chat/practice/report/twin/profile|memory|replay|data…）行为不变；`build:h5` 通过；**不 commit/不 checkout**（改动留工作树）。 |
| N7 | 零裸色（GRI/世界令牌）；不改 explorer、不改后端契约（只读 W1 API + 既有 tutor API）；不引入 iframe。 |

## 📦 产出物

- `packages/world-art`（或等价共享位）：世界画法原语（等距体块/地形/结构/人物标记），portal 改为引用它（**行为等价**）。
- `apps/web-ai-tutor`：
  - 引 `@styles/tokens/themes/persona-world.css`（世界令牌）；
  - **学习世界**页/外壳：`pages/twin/world.vue` 套入统一外壳（世界顶栏 + 返回人本世界）；
  - 从门户进入落「学习世界」的路径 + 回功能导航。
- 过场承接（与门户一致的过关式观感）。
- `.agents/claude/outputs/w3-file-list.md` + `w3-verify.sh`。

## ✅ 验收标准

1. **共享**：portal 与 web-ai-tutor 复用**同一份** world-art；`grep` 证明无第二套画法；共享件零色值。
2. 门户「学习」→（过关式）→ 智学慧眼**学习世界**；页面与门户人本世界**观感一致**（同令牌/同风格）。
3. **学科登顶功能保留**：登峰地图渲染、营地选中、进度/登顶态、学科切换均可用（功能不回归）。
4. 有**返回人本世界**与**回智学慧眼功能导航**的路径（不困单页）。
5. 智学慧眼其余页无回归；`build:h5` 通过；真实浏览器（playwright）：门户→学习世界→返回，**pageerror=0**。
6. 零裸色（新增/改动文件三重 grep 空）；`verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。
