# P5-A3：「资源」页签对齐「区域 / 行业」页签（域览全功能视图）

> 执行者：Claude ｜ 波次：P5（资源主数据维度）｜ 依赖：P5-A / P5-A2（已完成，`71f666d`）｜ 状态：待下达
> 依据：用户实测反馈——「资源」页签相比「区域 / 行业」缺少 **搜索框 / 中间钻取·层级图 / 列表展示**，且**左侧树顶层应是「联合国」**。
> 定位：把 P5-A 的「裸树」升级为与参考「域览」一致的完整浏览器（`industry.html` 同款外壳）。

## 📥 承重事实（实测，勿凭印象）

- 参考实现：`apps/explorer/industry.html`（~1 MB，内嵌数据 + 应用 + JSZip）与 `region.html`（~7.6 MB）。**这是「域览」参考浏览器**。
- 加载方式：`apps/explorer/index.html` 是加载器——`fetch('./'+dim+'.html')` 后把其 `<style>`/`<body>`/`<script>` **整体并入本文档**（方案 B 内嵌，非 iframe），再注入 GRI 顶栏（维度切换 + SSO）。`?dim=region|industry` 走此路径；**`?dim=resource` 目前走 `loadResource()`（P5-A 自渲染裸树，即待替换者）**。
- 现「行业」页签具备（用户要的都在这里）：顶栏**搜索框**（Ctrl K，按名称/编码/英文）；中部 **视图切换 = 地图 / 层级图 / 列表**（行业为 treemap 层级图 + 列表表格）；左侧**树形菜单**（顶层：`联合国 → ISIC Rev.5 → 门类…`）+ 我的收藏；右侧**明细**（名称/英文/路径/编码/子级 + 分类说明/子级列表/我的笔记）；面包屑 / 返回上级 / 全景；导出（Excel/PNG/JSON）；快速探索 / 完整目录条。
- 行业树顶层是**真实数据节点**：`ontology.industry` 里 `UN`(root, 联合国) → `ISIC Rev.5`(system) → section…（见迁移 022）。
- 资源数据（实测）：`ontology.resource` **4586** 节点，5 层 `section(10)/division(71)/group(327)/class(1301)/subclass(2877)`，`code` 为 1–5 位数字锚点（保前导零），**无「联合国」顶层**。
- C1 API（已上线）：`GET /api/taxonomy/resource/{children?parent=, node/:id, search?q=, path/:id, tree}`（匿名只读）。`tree` 返回 `{nodes:[{id,code,name,level,parent,children:[…]}]}`，`name` 已中文（P5-A2）。`search` 支持编码/名称。
- `RESOURCE_ID_PATTERN = /^\d{1,5}$/`（`taxonomy.service.ts`）：**非数字 id（如 `UN`）当前不被接受**。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **对齐参考设计**：新视图复刻 `industry.html` 的外壳与交互（同款顶栏/侧栏/主区/明细/视图切换），视觉并入现有「域览」风格；**不引入 iframe**（仍同文档内嵌）。 |
| N2 | **数据取真源**：读 C1 API（`/api/taxonomy/resource/tree` + `search`），**不要**另造内嵌数据块；失败回退可接受但须标明。 |
| N3 | **树顶层「联合国」**：呈现 `联合国 → CPC Ver.3.0（主要产品分类） → 门类(section) …`。推荐**视图层合成**这两个根（不改后端 id/level 模型）；如你判断必须落库，先在本卡注明并**另开 Codex 卡**（禁在本卡改后端迁移）。 |
| N4 | **5 层中文层级**：门类(section)/大类(division)/中类(group)/小类(class)/子类(subclass)（与 P5-A2 一致，勿用旧的「大类/中类/小类/细类」）。 |
| N5 | **接入方式**：`index.html` 的 `load('resource')` 改为与 industry 同路径（`fetch('./resource.html')` + 内嵌合并 + 注入 GRI 顶栏/SSO），**不破坏** region/industry 现有行为。 |
| N6 | **零裸色**：沿用「域览」/GRI 令牌；不改后端、不改 region/industry 参考文件；不 commit、不 checkout（改动留工作树）。 |
| N7 | `apps/explorer/resource.html` 若体积大（>1 MB）须 gitignore；小可入库。 |

## 📦 产出物

- 新增 `apps/explorer/resource.html` —— 「域览」风格 CPC 视图（搜索 / 视图切换[层级图·列表] / 树含联合国根 / 明细 / 面包屑 / 收藏；导出可选）。
- 改 `apps/explorer/index.html` —— `?dim=resource` 走 `resource.html` 内嵌合并（移除或保留 `loadResource()` 作回退）。
- `.agents/claude/outputs/p5-a3-file-list.md` + `p5-a3-verify.sh`（浏览器实跑：搜索命中、视图切换、树展开、点选联动；异常 0）。

## ✅ 验收标准

1. `?dim=resource`：左侧树顶层=`联合国` → `CPC Ver.3.0` → 10 门类可逐层展开；右侧明细随选。
2. 顶栏**搜索框**可用（输「谷物」/`011` 命中并跳转）；中部**层级图**与**列表**两个视图都能渲染 4586 节点树在当前层的子级。
3. 面包屑 / 返回上级 / 全景可用；切到 `?dim=region|industry` 行为与现状一致（无回归）。
4. 真实浏览器（playwright/CDP）跑：搜索→点选→视图切换→深层展开，**pageerror=0**。
5. `verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。
