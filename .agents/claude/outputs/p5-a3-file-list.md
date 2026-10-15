# P5-A3「资源」页签对齐「区域 / 行业」（域览全功能视图 + 树顶层「联合国」）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，**未** commit / **未** checkout）
> 依据：`.agents/claude/tasks/p5-a3-resource-tab-parity.md`
> 起因：用户实测反馈——「资源」页签相比「区域 / 行业」缺 **搜索框 / 中间钻取·层级图 / 列表展示**，且**左侧树顶层应是「联合国」**
> 复验：`bash .agents/claude/outputs/p5-a3-verify.sh` → **PASS=159 FAIL=0 VERIFY_EXIT=0（SKIP=0）**（连跑两次同结果）

## 1. 变更文件

共 **2** 个产品文件（`apps/explorer/` 内），另有 2 份 `.agents/` 产出。改动面经 §7 逐项断言，无预期外改动；`region.html` / `industry.html` 参考文件**逐字节未动**。

### 新增

| 文件 | 体积 | 说明 |
|---|---|---|
| `apps/explorer/resource.html` | 77,172 B / 886 行 | 「域览」风格 CPC 全功能视图。顶栏（品牌 + 搜索框/Ctrl K + CPC 徽标 + 分类说明 + 导出菜单）、三栏工作区（左侧分类树 + 我的收藏 / 中部层级图·列表 + 快速探索·完整目录 / 右侧明细 + 三页签）、面包屑 + 返回上级 + 全景、帮助弹窗、toast。**不内嵌任何数据**，全部经 C1 本体 API 取数 |

### 修改

| 文件 | 变更 | 说明 |
|---|---|---|
| `apps/explorer/index.html` | `+12 / −2`（仅 `load()` 一个函数） | 移除 `if (d === 'resource') return loadResource();` 短路 → `?dim=resource` 与 industry 走**同一条** `fetch('./'+d+'.html')` 内嵌合并路径；`loadResource()` 保留为 **resource 专属回退**；顺带补 `r.ok` 校验（否则 404 页会被 DOMParser 当正文铺进 body，回退永不触发） |

**未改动**：`apps/explorer/region.html`、`apps/explorer/industry.html`、`services/**`（含 taxonomy 后端与迁移）、`packages/**`、`styles/**`、`nginx/**`、`.gitignore`（§1/§2 逐项断言）。

> **N7 判定**：75 KB < 1 MB，且本文件是**在本仓库手写**（非从外部复制的参考浏览器），故**不**加 gitignore、应随仓库入库；`region.html`（7.6 MB）/ `industry.html`（1.0 MB）因体积大且来源在仓库外，gitignore 保持不变。

## 2. N3：两级合成根（不改后端 id/level 模型）

后端 `ontology.resource` 的根就是 10 个门类（`parent IS NULL` → `0..9`），且 `RESOURCE_ID_PATTERN = /^\d{1,5}$/` **拒收非数字 id**（如 `UN`）。因此「联合国」「CPC Ver.3.0」在**视图层合成**：

| 合成节点 | id | level | 父 | 来源 |
|---|---|---|---|---|
| 联合国 | `UN` | `root` | — | 视图层常量（与 industry 参考的 `root` 语义一致） |
| CPC Ver.3.0（主要产品分类） | `CPC` | `system` | `UN` | 视图层常量（与 industry 参考 `ISIC Rev.5` 的 `system` 语义一致） |
| 10 门类 | `0`…`9` | `section` | 建树时把 `null` 父改写为 `CPC` | C1 API `/tree` 真源 |

- 合成 id 取 `UN`/`CPC`，与数字 id 空间天然不相交，**不会与真源 id 撞车**。
- 全程**不把合成 id 发给后端**（§4.13 运行时断言：无 `/api/taxonomy/resource/{node|children|path}/(UN|CPC)` 请求）。治理层「＋ 新建 / 编辑 / 移动 / 归档」在合成根上会得到后端明确报错或 `未定位到当前节点`，**无副作用**（只读失败，不写数据）。
- 树行渲染与行业参考一致：`root` 行只显示图标 + 「联合国」（无 `.node-code`），`system` 行显示 `CPC` + 「主要产品分类」。这也让 `index.html` 既有的 `currentId()` 回退路径（读 `.tree-row.current .node-code`）对 `UN` 行自然返回 `null`。

## 3. N2：数据全部来自 C1 API

| 数据 | 来源 | 说明 |
|---|---|---|
| 全树（4586 节点） | `GET /api/taxonomy/resource/tree` | 内嵌时：`<script id="resource-data" type="application/json">{"nodes":[],"meta":{}}</script>` 是**空占位**，由 `index.html` 加载器按既有契约用 API 全树回填（`obj.nodes = apiTree.nodes`）；单独打开 `resource.html` 时由本页脚本自行 fetch 同一 API。两条路都**不携带内嵌数据副本** |
| 搜索 | `GET /api/taxonomy/resource/search?q=&limit=20` | 输入去抖 160ms + `AbortController` 取消竞态；结果映射回内存树取准确名称/层级/上级 |
| 明细 / 路径 | 全部在内存树上派生 | 无额外请求（`path` 时间线由 `parent` 链推导） |

- 子级**排序**：API 的 `children` 是 DB 顺序（如门类 `0` 返回 `["02","03","04","01"]`），视图层统一按 `code` 做 `localeCompare(…, {numeric:true})` 重排，保证 `01,02,03,04`。
- 运行时不变量（§4.13）：全部 `/api/` 请求都落在 `/api/taxonomy/resource/` 下；没有任何 `.json`/`.csv` 非 API 取数。

## 4. N1：对齐「域览」外壳与交互

| 参考能力 | resource.html | 与 industry 的差异及理由 |
|---|---|---|
| 顶栏搜索框（Ctrl K + 下拉结果 + ↑↓/Enter/Esc） | ✅ | 按**中文名称 / CPC 编码**检索（无英文名字段，见 §5） |
| 中部视图切换 | ✅ **层级图 / 列表** | 行业是**地图 / 层级图 / 列表**三档；CPC 是产品分类、无地理维度，按任务卡 N1 只留 **层级图 / 列表** 两档 |
| 左侧树 + 我的收藏 | ✅ 顶层 `联合国 → CPC Ver.3.0 → 门类…` | 行业顶层是**真实数据节点**；资源为**视图层合成**（N3） |
| 右栏明细（名称 / 路径 / 编码 / 子级 + 三页签） | ✅ **分类说明 / 子级列表 / 我的笔记** | 同上，行业有英文名槽位，此处改为**官方层级英文名 + 编码位数**（诚实派生，不编造） |
| 面包屑 / 返回上级 / 全景 | ✅ | — |
| 快速探索 / 完整目录条 | ✅ 门类 0/2/4/9 + 五级全量目录 | 完整目录点开即按层级扁平列出（子类 2877 条自动落列表视图） |
| 导出 | ✅ 当前分支 JSON / 当前分支 CSV / 完整目录 CSV / 层级图 PNG | 行业是 Excel(=CSV)/PNG/JSON 三档；此处用**无外部依赖**的 CSV + `canvas` 出 PNG（行业靠 JSZip，本页不需要） |
| 帮助弹窗 | ✅ 五级编码表 + 版本来源 + 中文名口径 | — |
| 键盘/无障碍 | ✅ Ctrl K 搜索、Esc 返回上级、`+`/`−` 缩放、方向键选搜索结果、Tab 焦点环、`aria-*`、`role="tree"/"listbox"`、弹窗焦点圈禁 | — |
| 收藏 / 笔记持久化 | ✅ `localStorage: gri-cpc-v1`（当前节点 / 收藏 / 笔记 / 视图） | 行业键为 `industry-isic5-v1`；命名空间隔离，互不干扰 |

**真浏览器实测路径**（playwright-core + chromium，`pageerror=0` / `console.error=0` 全程）：
搜索「谷物」→ 命中 `011 谷物` → 点选 → 明细随选 → 搜索「011」→ 回车跳转 → 层级图（9 小类）→ 列表（9 行）→ 点行进 `0111` → 点块展开至末级 `01111`（面包屑 7 段 / 路径时间线 7 步）→ 末级大字块 → 返回上级 → 全景 → 面包屑中段跳转 → Esc 返回 → 子级列表筛选 → 笔记 → 收藏 → 刷新持久化 → 完整目录 2877 子类 → 四种导出下载 → 帮助弹窗 → Ctrl K。

## 5. 诚实性：中文名来源与英文名缺失

- `un-cpc.json` 的 `meta.nameZh` 明确记载：中文名称为**机器翻译（LLM，术语向）的工作译名，非联合国官方中文**；官方英文原名只存在于仓库内上游真源。
- **C1 API 不返回 `english` 字段**（`mapResource` 的 `english` 恒为 `null`）。因此本视图：
  - 不显示任何按节点编造的英文名；
  - `#detail-english` 显示**官方层级英文名 + 编码位数**（如 `Group · 3 位编码`）；合成根显示其真实英文全称（`United Nations` / `Central Product Classification, Version 3.0`）；
  - 列表行 `<small>` 显示 `Group · 3 位编码`，同样不编造。
- 帮助弹窗与明细底部来源行**显式声明**：数据经 GRI 本体 API 实时读取；中文为术语向机翻工作译名，非联合国官方中文；官方英文原名保留在上游真源 `scripts/reference-data/`。

## 6. N4：五级中文层级

`门类(section) / 大类(division) / 中类(group) / 小类(class) / 子类(subclass)`，与 P5-A2 一致；视图内**零**旧口径「细类」残留（§1 断言）。层级映射锚定 `section→subclass`，编码位数 `1/2/3/4/5 位`，前导零按文本保存（`01`、`011` 不丢零）。

## 7. N6：零裸色

- 全文件**唯一**出现颜色字面量的位置是顶部单个 `:root{…}` 令牌真源块（1090 字符，与 industry 参考的 `:root` 及 `index.html` 的 `injectSkin()` **同源同值**）；令牌块之外 **`#hex` / `rgb()` / 具名色 grep 命中 0 处**。
- 规则区引用 `var(--…)` **228 处**、覆盖 **50 个不同令牌**；无未声明的令牌（无 `var(--typo)` 类悬空）。
- **脚本不写颜色**：SVG 瓦片配色靠 `.p0`–`.p5` / `.leaf` 类，PNG 导出的画布底色读运行时令牌（`getComputedStyle`），`toBlob` 前用 `ctx.fillStyle=CSS_SAFE_BG()`。
- 运行时断言（§4.14）：加载器 `injectSkin()` 后 `--teal` 解析为 `#1b7a3d`、`--bg` 为 `#f4fcf5`（与区域/行业页签同一皮肤），层级图底色/瓦片填充均为令牌解析值。

## 8. N5：接入方式与无回归

`?dim=resource` 现在与 industry **同一代码路径**：`fetch('./resource.html')` → `<style>` 并入 `head`（打 `data-gri-embed`，切换维度时先清）→ `injectSkin()` → `body.innerHTML` 并入（**非 iframe**，§4.1 断言 `iframe` 数 = 0）→ 数据脚本回填 → 执行应用脚本 → `injectControls()` 注入 GRI 三大页签 + SSO。

回退（仅 resource）：`fetch` 失败或 `!r.ok` 时 `loadResource()` 渲染 P5-A 原生裸树，保证页签不白屏；region/industry 异常照旧冒泡到 `load(dim).catch` → 显示「加载失败」。§2 断言回退作用域为 resource-only + 参考文件未改。

实测无回归（同一浏览器会话内）：

| 维度 | 断言 | 结果 |
|---|---|---|
| `?dim=region` | 顶栏/搜索/树（7 行）/`#map-svg` 地图元素/明细「联合国」/页签 `区域*`/`pageerror=0`/无 `#resource-data` | ✅ 全绿 |
| `?dim=industry` | 顶栏/搜索/树（24 行）/树顶层「联合国」/视图切换 `map,graph,list`/ISIC 层级图/明细「联合国」/页签 `行业*`/`pageerror=0`/无 `#resource-data` | ✅ 全绿 |

## 9. 验证结果（本机实测）

`bash .agents/claude/outputs/p5-a3-verify.sh` → **PASS=159 FAIL=0 VERIFY_EXIT=0（SKIP=0）**，7 节：

| 节 | 内容 | 断言数 |
|---|---|---|
| §0 | nginx / api 在跑、nginx 已直挂 explorer、playwright-core 就位 | 4 |
| §1 | resource.html 静态契约（N1 无 iframe + 17 个必需节点、N2 空占位与唯一数据源、N3 合成根、N4 五级层级、N6 零裸色与令牌自洽、N7 体积判定） | 34 |
| §2 | index.html 接线（N5 短路已除、同路径、回退保留且 resource-only、参考文件未改） | 5 |
| §3 | C1 API 实测（4586 节点 + 五级直方图 10/71/327/1301/2877 + 后端根 `0..9` + `search 谷物/011` 首项 + `path/011`） | 10 |
| §4 | 真浏览器 E2E（resource，桌面 1600px + 移动端 375px）：加载 / 树顶层 / 全景 / 搜索命中与跳转 / 层级图 / 列表 / 深层展开 / 末级 / 面包屑·返回上级·全景·Esc / 三页签 / 子级筛选 / 笔记 / 收藏 / 刷新持久化 / 完整目录 2877 / 四种导出 / 帮助 / Ctrl K / N2·N3·N6 运行时断言 / 移动端抽屉与联动 + 2 条跨页签横向溢出对照 | 85 |
| §5 | region / industry 无回归（同一浏览器会话内紧随 §4 跑，断言名以 `§5` 前缀标记） | 14 |
| §6 | 凭据零泄漏（私钥 / AKIA / `nvapi-` / 口令赋值 / 长 Bearer 五重 grep；resource 为匿名只读，无测试凭据） | 2 |
| §7 | 改动范围（无暂存、改动面仅在预期文件、HEAD 前后一致 → 未 commit 未 checkout） | 5 |
| | **合计** | **159** |

**数据卫生**：§4 全程只读（搜索/树/明细均为匿名 GET）；导出文件落在 playwright 临时目录，不写仓库；`localStorage` 仅写入本机浏览器上下文；浏览器上下文逐个 fresh，跑完即销毁。脚本**不读 `.env`、不落任何密钥**。

## 10. 明确未做

- **未**改后端、**未**加迁移：`ontology.resource` 的 id/level 模型原样保留，两级根只在视图层合成（N3 既定路线；若日后要落库，另开 Codex 卡）。
- **未**引入「地图」视图：CPC 无地理维度，按 N1 保留 **层级图 / 列表** 两档。
- **未**做 Excel（`.xlsx`）导出：行业靠 JSZip 内嵌库实现，本页为保持零外部依赖，用 UTF-8 BOM 的 CSV（Excel 可直接打开且保留前导零）。
- **未**改 `.gitignore`（75 KB 未达 1 MB 阈值）、**未**碰 `styles/**` 令牌真源（本页令牌与 GRI 皮肤同源同值，无需新增）。
- **未**在合成根（联合国 / CPC）上开放治理写操作——后端只收数字 id，这两级本就不该被写。
