# P5-A3 可下达提示词（粘贴给 Claude）

> 任务卡：`.agents/claude/tasks/p5-a3-resource-tab-parity.md`（先读）。分支 `feat/stage-c-unified-auth-shell`，工作树 `/home/ubantu/GRI`。

---

【任务】P5-A3：把「资源」页签升级为与「区域 / 行业」同款的「域览」全功能视图，并让左侧树顶层显示「联合国」。

■ 必读（先读再动手）
1. `apps/explorer/industry.html` —— 参考「域览」实现（同款顶栏/侧栏树/视图切换[地图·层级图·列表]/明细/面包屑/收藏/导出）。**这是设计与实现的蓝本。**
2. `apps/explorer/index.html` —— 加载器：`fetch('./'+dim+'.html')` 后整体内嵌合并 + 注入 GRI 顶栏/SSO；`?dim=resource` 当前走 `loadResource()`（待替换）。
3. `services/api/src/modules/taxonomy/taxonomy.service.ts` + 现网 API 契约：`GET /api/taxonomy/resource/{children?parent=, node/:id, search?q=, path/:id, tree}`（匿名只读；tree 返回 `{nodes:[{id,code,name,level,parent,children:[]}]}`，name 已中文）。
4. 本卡 `.agents/claude/tasks/p5-a3-resource-tab-parity.md` 的硬约束 N1–N7。

■ 现状（实测，勿凭印象）
- `ontology.resource`：4586 节点，5 层 `section(10)/division(71)/group(327)/class(1301)/subclass(2877)`，`code`=1–5 位数字（保前导零），**无联合国顶层**。
- 「行业」树顶层是真实节点：`UN`(联合国) → `ISIC Rev.5` → 门类…；资源当前顶层直接是 10 个 section。
- `RESOURCE_ID_PATTERN=/^\d{1,5}$/`：**非数字 id（UN）后端不接受**。

■ 硬约束（违反即失败）
- N1 复刻 `industry.html` 外壳与交互（含顶栏搜索框、中部「层级图 / 列表」视图切换、右侧明细、面包屑）；**不引入 iframe**（仍同文档内嵌合并）。
- N2 数据**只取 C1 API**（`/api/taxonomy/resource/tree`、`search`），不另造内嵌数据块。
- N3 树顶层呈现「**联合国 → CPC Ver.3.0（主要产品分类） → 门类 …**」——**视图层合成这两个根**（不改后端 id/level 模型；如你认为必须落库，停下来先说明，另开 Codex 卡）。
- N4 5 层中文层级：**门类/大类/中类/小类/子类**（勿用旧的「大类/中类/小类/细类」）。
- N5 `index.html` 的 `load('resource')` 改为与 industry 同路径（fetch `resource.html` 内嵌合并 + 注入 GRI 顶栏/SSO）；**不得破坏** region/industry 现有行为。
- N6 零裸色（沿用域览/GRI 令牌）；不改后端、不改 region/industry 参考文件；**不 commit、不 checkout**（改动留工作树）。
- N7 `resource.html` 体积大（>1 MB）须 gitignore。

■ 产出
1. 新增 `apps/explorer/resource.html`（域览风格 CPC 视图：搜索 / 层级图 / 列表 / 树含联合国根 / 明细 / 面包屑；收藏·导出可选）。
2. 改 `apps/explorer/index.html`（`?dim=resource` 走 `resource.html`；`loadResource()` 可留作回退）。
3. `.agents/claude/outputs/p5-a3-file-list.md` + `p5-a3-verify.sh`。

■ 自检
- `?dim=resource`：树顶层=联合国 → CPC Ver.3.0 → 10 门类逐层展开；明细随选。
- 搜索框：输「谷物」或 `011` 命中并跳转；层级图 / 列表两视图渲染当前层子级。
- 面包屑 / 返回上级 / 全景可用；`?dim=region|industry` 无回归。
- 真实浏览器（playwright/CDP）：搜索→点选→视图切换→深层展开，**pageerror=0**。
- `verify.sh` 末行 `FAIL=0`；凭据零泄漏。
