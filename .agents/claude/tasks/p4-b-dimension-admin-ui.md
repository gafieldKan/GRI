# P4-B：维度治理 UI 补全（新建节点 + 审计流水查看）

> 执行者：Claude ｜ 波次：P4 ｜ 依赖：无（S5/S6 治理后端已就绪）｜ 状态：待下达
> 定位：把"维度维护"从「改名/移动/归档/AI命令」补全为**完整治理闭环**——能**新建**、能**看审计流水**。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **新建节点**需新增后端端点 `POST /api/taxonomy/:name/node`（operator 门禁 + 审计 `op=create`）；粒度闭集同 S4（region 仅 country/province 级可新建；industry 仅 section）。 |
| N2 | 身份取 `req.auth.externalId`；operator 门禁 `assertSiteOperator`；**禁** `req.auth.roles`。 |
| N3 | 审计表复用 `ontology.dimension_change_log`（`source='manual'`）；不新建迁移（表 026 已在）。 |
| N4 | 前端只在 `apps/explorer/index.html` 增强（内嵌参考 UI 的 GRI 控制层）；**不改参考文件本身**（region.html/industry.html）。治理按钮沿用 `probeOperator()` 显隐。 |
| N5 | 空值/非法→400；父级不存在→404；编码重复→409。 |

## 📥 承重事实（实测）

- 治理端点：`PATCH :name/node/:id`、`POST :name/node/:id/move|archive`、`GET :name/changes`、`POST command|command/apply`（均在 `services/api/src/modules/taxonomy/`，operator 门禁 + 审计）。
- Explorer 加载器 `apps/explorer/index.html`：`injectControls/renderSso/probeOperator/curDim/currentId` + `editCurrent/moveCurrent/archiveCurrent/commandCurrent`。
- `curDim()` 从 `?dim=` 取；`currentId()` region 用 `window.Atlas.current()`、industry 读 `.tree-row.current .node-code`。
- 数据树来自 `GET /api/taxonomy/:name/tree`（真源）。

## 📦 产出物

- 后端：`POST /api/taxonomy/:name/node`（新建；body `{code?, name, short?, parentId?}`；operator + 审计 create）+ spec
- 前端 `apps/explorer/index.html`：GRI 控制层加「**＋ 新建**」「**▤ 审计**」（operator）→ 新建弹窗（父级/编码/名称）、审计流水面板（`GET :name/changes` 展示 op/target/before-after/time/source）
- `.agents/claude/outputs/p4-b-file-list.md` + `p4-b-verify.sh`

## ✅ 验收标准

1. tsc 0 err；全量 jest 不回归；`verify.sh` FAIL=0。
2. 新建：operator 201 + 落库 + 审计 create；非 operator 403；编码重复 409；粒度外 400。
3. 审计面板：列出 `dimension_change_log` 最近若干条（op/target/source/时间），异常 0。
4. 参考 UI 不受影响（区域地图/行业 treemap 仍正常）。

## 🚫 明确不做

- 不做资源定位（P4-A）；不做登录视觉（P4-C）；不改参考文件。
