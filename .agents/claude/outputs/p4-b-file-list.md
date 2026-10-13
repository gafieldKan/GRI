# P4-B 维度治理 UI 补全（新建节点 + 审计流水查看）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，**未** commit / **未** checkout）
> 依据：`.agents/claude/tasks/p4-b-dimension-admin-ui.md`
> 依赖：P3-S5 治理端点（`PATCH node/:id`、`move`、`archive`、`GET changes`）已就绪；审计表 `ontology.dimension_change_log`（迁移 026）已存在
> 复验：`bash .agents/claude/outputs/p4-b-verify.sh` → **PASS=65 FAIL=0 VERIFY_EXIT=0**（连跑两次一致，造数清理后库复原）

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `.agents/claude/outputs/p4-b-verify.sh` | 六段验收：tsc / jest 不回归 → 离线服务层断言 → 活体 HTTP（新建 + 门禁 + 审计）→ 真实浏览器 UI（operator 按钮 / 审计面板 / 新建弹窗 / 参考 UI 未坏）→ 参考文件零改动 |
| `.agents/claude/outputs/p4-b-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `services/api/src/modules/taxonomy/taxonomy.service.ts` | 新增 `createNode()`（唯一新增写路径）+ 闭集常量 `CREATE_LEVEL_RULES/CREATE_LEVEL_HINT` + 私有校验 `requireText/optionalText/codeExists` + `isUniqueViolation()`；`ConflictException` 引入 |
| `services/api/src/modules/taxonomy/taxonomy.controller.ts` | 新增 `POST :name/node`（`externalId` 取身份 → `assertSiteOperator` → 服务层；Nest 默认 201） |
| `services/api/src/modules/taxonomy/taxonomy.service.spec.ts` | 新增 `createNode` 用例 8 例（region/industry 正例、粒度外、父级 404、空值/非法编码 400、重复 409、23505 兜底 409） |
| `services/api/src/modules/taxonomy/taxonomy.controller.spec.ts` | 新增 `create` 用例 3 例（门禁 + externalId 下传 / 缺身份 403 不触服务层 / 非 operator 403 不落库）；`org` mock 提取为可断言变量 |
| `services/api/src/auth/public-routes.spec.ts` | 新增 1 例：`POST /taxonomy/:name/node` 与 `GET /taxonomy/:name/changes` **不得**进匿名白名单（写与审计视图强制登录） |
| `apps/explorer/index.html` | **仅** GRI 控制层：`.gri-*` 样式（弹窗 / 面板）；`openCreate()` 新建弹窗、`openAudit()` 审计面板 + `renderSso()` 增 `＋ 新建` / `▤ 审计` 两枚 operator 按钮（沿用 `probeOperator()` 显隐） |

**未改动（N4）**：`apps/explorer/region.html`、`apps/explorer/industry.html`（参考 UI 文件零改动，见 §6 断言）。
**未新增迁移（N3）**：审计复用 `ontology.dimension_change_log`，无 028。

## 2. API 契约

### `POST /api/taxonomy/:name/node`

- 门禁：`assertSiteOperator(req.auth.externalId)`（身份取 `req.auth.externalId`；**不读** `req.auth.roles`）。无 token → 401（未进白名单）；登录但非 operator → 403。
- 请求体：`{ code, name, short?, parentId }`。**无 level 字段**——层级由父级按闭集推导（下方规则表），不信任客户端自报层级。
- 成功：`201` + 映射后的 `TaxonomyNode`（与 `GET :name/node/:id` 同形）。

| 情形 | 状态码 | 说明 |
|---|---|---|
| 成功 | 201 | 落库（`status='active'`）+ 审计 `op=create` / `source='manual'` / `actor_id=externalId` |
| 缺 `name` / 缺 `code` / 缺或空白 `parentId` / 越界文案 / 编码不符规则 | 400 | 校验先于任何 SQL（fail-fast，不把坏值丢给 PG NOT NULL/VARCHAR） |
| 粒度外（父级 level 不在闭集规则内） | 400 | 报错文案含当前父级 level 与闭集提示 |
| 父级不存在（或已归档） | 404 | `父级不存在` |
| 编码重复（含已归档节点占用的编码） | 409 | 预检（不带 status 过滤）+ PG `23505` 兜底（并发下同样 409，不冒 500） |

### 粒度闭集（同 S4 模块挂接粒度；取自真源实际父子层级）

| 维度 | 父级 level → 新建节点 level | 依据（真源实测） |
|---|---|---|
| region | `world` / `subregion` / `intermediate` → `country`；`country` → `province` | `world→country 1`、`subregion→country 142`、`intermediate→country 105`、`country→province 34` |
| industry | `system` → `section` | `system→section 22` |

- 其余父级（region 的 `province`/`admin1`/`city`…、industry 的 `section`/`division`…）一律 400：这两级之下不开放新建，避免 8000×832 颗度失控。
- 编码即锚点：region 写 `node_id = code = <数字编码>`（与真源 7999 节点同构）；industry 写 `code`，且 `section = code`（与真源 22 个 section 行同构）。
- 审计 `before = {}`、`after = <新建节点全量>`、`target_id = <编码>`。

## 3. 前端行为（`apps/explorer/index.html`）

- 治理按钮组由 4 枚扩为 6 枚：`＋ 新建` `▤ 审计` `✎ 编辑名称` `⇄ 移动` `⧗ 归档` `✦ AI 命令`；仍由 `probeOperator()`（`GET :name/changes?limit=1` 是否 200）决定整组显隐——非 operator 与游客**一个按钮都不显示**。
- **新建弹窗**：父级 id（默认预填当前选中节点 `currentId()`）/ 编码 / 名称 / 简称（可选）+ 该维度粒度闭集提示；空值先在前端拦截，提交后按 201/400/403/404/409 分别就地显示后端 `message`（不整页 alert 失败）。
- **审计面板**：右侧抽屉，`GET /api/taxonomy/:name/changes?limit=50`，逐条渲染 `op`（分色标签）/ `target_id` / `source` / 本地化时间 / `before → after` 字段级差异摘要；空结果、加载失败、请求异常均渲染为文案而非抛错（页面 `pageerror` 计数 0）。
- 全部新增 DOM 均 `esc()` 转义（审计内容来自 DB，视为不可信输入）；样式与函数一律 `.gri-*` / IIFE 内，不触碰参考文件契约（`window.Atlas`、`.tree-row`、`__` 等）。

## 4. 验证结果（本机实测）

| 段 | 结果 |
|---|---|
| tsc | `tsc --noEmit` **0 err** |
| jest（全量） | **40 suites / 584 tests 全绿**（基线 572 → 584，+12：service 8 + controller 3 + public-routes 1），0 回归 |
| 离线服务层（ts-node + 记录型假库，27 断言） | 层级推导 / 锚点写入 / 审计五要素 / 粒度外 / 空值 fail-fast（零 SQL）/ 404 / 409 / 23505 兜底 / 非唯一约束错误不吞——全 PASS |
| 活体 HTTP（容器镜像已含本卡代码） | 匿名 401；非 operator 403；operator 新建 industry section → **201**（`level=section`、`parentId=ISIC Rev.5`）；region province（父级 100000）→ **201**；重复编码 **409**；父级缺 **404**；粒度外（父级 `A`/`section`）**400**；缺 `name` **400**；`GET :name/changes` 出现 `op=create` 行（`source=manual`、`actor_id` 为操作者 UUID、`after.id` 可回溯）；回归 `region/tree`、`industry/search` 仍 200，非 operator `PATCH node/:id` 仍 403 |
| 真实浏览器（playwright-core + 缓存 chromium，`https://localhost/explore/`） | operator：按钮 6 枚含 `＋ 新建`/`▤ 审计`，`pageerror=0`；`▤ 审计` → 面板 3 行（`create,create,update`；source `manual`；含本次新建编码；时间已本地化）；`＋ 新建` 全流程（填父级/编码/名称 → 提交）→ 提示「已创建 industry · …」→ 刷新后 API `GET node/<code>` 返回 200 且 `level=section`；非 operator：按钮 **0** 枚；`?dim=region` 地图 path ≥5、`?dim=industry` treemap rect+树行均正常，全程 `pageerror=0` |

> 复验口径：`verify.sh` 六段共 65 条断言；§3/§4 各造 1~3 个节点，退出时（含失败路径 `trap`）经 `docker exec gri-postgres psql` 真删，复核 `ontology.industry=832 / ontology.region=7999 / dimension_change_log=3`——与验收前完全一致。

## 5. 数据卫生

- 验收造数（新建的 region/industry 节点 + 其审计行）在验收后由脚本经 `docker exec gri-postgres psql` **真删**；复验前后 `dimension_change_log` 计数一致（3 条既有历史：`industry|A|update` + `resource_dimension|restaurant:*|update` ×2）。
- 非 operator 门禁验证需一个「登录但不属任何组织」的用户，脚本按 P2 惯例现场注册一次性账号（`p4b_<ts>@example.com`，仅落 `gri_auth` 身份库，无组织/权限），验证后保留（无副作用，与既有 verify 脚本同法）。
- 凭据零泄漏：脚本只用 dev 测试账号（`testuser`，可用 `TEST_IDENTIFIER/TEST_PASSWORD` 覆盖），不落任何密钥/私钥/LLM key。

## 6. 明确未做

- 未做资源定位（P4-A，已由 codex 片交付）；未做登录/门户视觉（P4-C）；未改参考文件 `region.html` / `industry.html`。
- 未把新建能力接进 AI 命令解析（`command.service` 仍只支持 rename/move/archive）——`createNode` 已留 `source` 参数位，后续接线为一行。
- 未回写 `packages/ontology`/`scripts/reference-data` 真源 JSON（与 P3-S5 同口径：真源同步为开放项）。
