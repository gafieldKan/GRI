# P3-S2 ~ S6 下达提示词（逐段复制给 Codex）

> 用途：用户手动下达。**串行铁律**：一次下达一个，S2→S3→S4→S5→S6。
> ⚠️ S3–S6 的承重事实会随后续卡落地而变化——**下达前请让我复核一遍**（避免"旧卡病"）。
> 卡片全文在 `.agents/codex/tasks/p3-sN-*.md`；本文件是「可粘贴提示词」形态。

---

## 【P3-S2】应用注册表 AppModule（后端）

```text
【任务】P3-S2：应用注册表 AppModule（后端）

工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。
任务卡（完整要求以此为准）：.agents/codex/tasks/p3-s2-app-module-registry.md —— 先读它。

■ 必读上下文
1. .agents/codex/tasks/p3-s2-app-module-registry.md（本卡全文）
2. apps/portal/src/config/modules.js（S1 的本地目录——本卡将其搬到后端）
3. packages/ontology/ontologies/*.ontology.yaml + packages/codegen/src/cli.js（本体→迁移范式）
4. services/api/src/migrate/022_isic_rev5.sql + run-migrations.ts（记录表 public._api_migrations）
5. services/api/src/modules/identity/*（权限/身份契约样式）

■ 硬约束（违反即失败）
N1 本体驱动：新写 packages/ontology/ontologies/app-module.ontology.yaml → @gri/codegen → 迁移 023。禁手写结构 DDL。
N2 授权走 assertSiteOperator/assertRole；身份取 req.auth.externalId；禁 req.auth.roles。
N3 只新增，不重建既有模块/表。
N4 迁移编号 023，登记 public._api_migrations；跑迁移前先 npm run build（runner 读 dist/migrate/*.sql）。
N5 本卡只做目录；用户"选用"状态不在本卡（S3）。

■ 承重事实（实测）
- 迁移当前到 022；记录表 public._api_migrations。
- 角色闭集 consumer|student|merchant|operator。
- codegen: node packages/codegen/src/cli.js <yaml> --tracks sql。
- 全仓无既有插件/模块注册概念；ontology.master_data 是扁平字典，不适合（用独立本体对象）。

■ 产出
1. packages/ontology/ontologies/app-module.ontology.yaml（AppModule: code/name/short/description/icon/entry_url/category/allowed_roles/is_core/status/sort_order）
2. services/api/src/migrate/023_app_module.sql（codegen + 审阅头注）
3. 种子：9 模块（与 S1 的 modules.js 对齐）
4. services/api/src/modules/module-registry/*（GET /api/modules：登录门禁，按角色过滤 allowed_roles）
5. S1 工作台改从 GET /api/modules 取（替换本地常量）
6. .agents/codex/outputs/p3-s2-file-list.md + p3-s2-verify.sh

■ 自检（交付前全绿）
- tsc --noEmit 0 err；模块 jest 绿；全量 jest 不回归（记录基线）
- GET /api/modules：consumer 不见 org-admin；operator 全见；无 token→401
- 本体 schema+语义双校验 OK；迁移登记
- verify.sh FAIL=0
- 纪律：不 commit、不 checkout；凭据零泄漏。

■ 明确不做
用户选用(S3)/维度挂接(S4)/微前端。
```

---

## 【P3-S3】用户插件选用 UserModule（opt-in）

```text
【任务】P3-S3：用户插件选用（opt-in）

工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。
任务卡：.agents/codex/tasks/p3-s3-user-plugin-optin.md —— 先读它。

■ 必读上下文
1. .agents/codex/tasks/p3-s3-user-plugin-optin.md（本卡全文）
2. P3-S2 产出（ontology.app_module + GET /api/modules）
3. packages/ontology/ontologies/app-module.ontology.yaml（本卡增 UserModule）
4. services/api/src/modules/module-registry/*（S2 样式）

■ 硬约束（违反即失败）
N1 选用≠授权：user_module 只记偏好；可用性仍由 GET /api/modules 角色过滤决定；越权插件不可被 enable（403）。
N2 本体驱动：app-module.ontology.yaml 增 UserModule 对象 → codegen → 迁移 024。
N3 身份取 req.auth.externalId；(user_id, module_code) 唯一，enable/disable 幂等。
N4 迁移编号 024；先 build 再 migrate。

■ 产出
- 本体 + services/api/src/migrate/024_user_module.sql
- POST /api/modules/:code/enable|disable（登录门禁；校验对该角色可用）
- GET /api/modules 增 selected 字段
- 工作台勾选/取消 UI
- outputs + p3-s3-verify.sh

■ 自检
- 勾选/取消→刷新工作台随之变化；对不可用模块 enable→403（且不写行）；幂等；全量 jest 不回归；verify FAIL=0
- 纪律：不 commit、不 checkout；凭据零泄漏。

■ 明确不做：维度挂接(S4)/微前端。
```

---

## 【P3-S4】双维度挂接 module_region / module_industry

```text
【任务】P3-S4：双维度挂接（模块可选声明区域/行业作用域）

工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。
任务卡：.agents/codex/tasks/p3-s4-dimension-binding.md —— 先读它。

■ 必读上下文
1. .agents/codex/tasks/p3-s4-dimension-binding.md（本卡全文）
2. packages/ontology/ontologies/{un-regions,isic-rev5}.ontology.yaml（维度本体）
3. services/api/src/migrate/{021_un_regions,022_isic_rev5}.sql（维度表）
4. P3-S2/S3 产出（app_module / user_module / GET /api/modules）

■ 硬约束（违反即失败）
N1 维度关联用真 FK（本体 link → 外键），不用 JSON 字段。
N2 粒度闭集（防组合爆炸）：region 挂 level ∈ {country, province}；industry 挂 level = section。写死在卡内。
N3 不改既有 ontology.region / ontology.industry 表结构（只新增关联表）。
N4 本体驱动：ModuleRegion/ModuleIndustry 对象 → codegen → 迁移 025。
N5 未挂接的模块在任意维度下仍可见（默认全可见）。

■ 承重事实
- ontology.region（node_id/code/level/parent_id；7999 节点）；ontology.industry（code/level/section/parent_id；832 节点）。
- 两棵树可复用钻取。

■ 产出
- 本体 + services/api/src/migrate/025_module_dimension.sql
- GET /api/modules?region=<nodeId>&industry=<code> 过滤
- GET/PUT /api/modules/:code/bindings（operator）
- 门户「区域×行业」选择器 UI + 过滤
- outputs + p3-s4-verify.sh

■ 自检
- 未挂接模块任意维度可见；挂了作用域的仅命中可见；选择器驱动过滤；全量 jest 不回归；verify FAIL=0
- 纪律：不 commit、不 checkout；凭据零泄漏。

■ 明确不做：维度写维护(S5)/微前端。
```

---

## 【P3-S5】维度维护（operator CRUD + 审计）

```text
【任务】P3-S5：维度维护（operator CRUD + 审计）

工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。
任务卡：.agents/codex/tasks/p3-s5-dimension-admin-crud.md —— 先读它。

■ 必读上下文
1. .agents/codex/tasks/p3-s5-dimension-admin-crud.md（本卡全文）
2. services/api/src/migrate/{021_un_regions,022_isic_rev5}.sql（维度表结构）
3. services/api/src/modules/organization/*（assertSiteOperator 门禁 + 审计表样式）
4. apps/portal/src/pages/console/*（operator 页面样式）

■ 硬约束（违反即失败）
N1 写操作走 assertSiteOperator（根组织 owner|admin）；禁 req.auth.roles。
N2 完整性：移动节点防环（不能移到自己后代下）；level 与父子关系一致校验。
N3 变更一律入 ontology.dimension_change_log（dimension/target_node_id/op/before/after/actor_id/source/created_at）。
N4 本体驱动：DimensionChangeLog 对象 → codegen → 迁移 026。
N5 只改运行时库；不自动回写 data/*.json（真源同步为开放项）。

■ 产出
- services/api/src/migrate/026_dimension_change_log.sql
- GET/POST/PATCH/DELETE /api/regions · /api/industries（写门禁）
- operator 维度维护页（portal）
- outputs + p3-s5-verify.sh

■ 自检
- operator 增/改名/移动节点→DB 生效+审计一条；非 operator→403；把 A 移到 A 的后代→400；全量 jest 不回归；verify FAIL=0
- 纪律：不 commit、不 checkout；凭据零泄漏。

■ 明确不做：AI 命令(S6)/微前端。
```

---

## 【P3-S6】维度 AI 命令（NLP → 提案 → 确认 → 应用）

```text
【任务】P3-S6：维度 AI 命令（自然语言 → 提案 → 确认 → 应用）

工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。
任务卡：.agents/codex/tasks/p3-s6-dimension-ai-command.md —— 先读它。

■ 必读上下文
1. .agents/codex/tasks/p3-s6-dimension-ai-command.md（本卡全文）
2. P3-S5 产出（维度 CRUD + 校验 + 审计）
3. packages/agent-core/*（LLM/AI 能力）
4. docs/ai-tutor/NVIDIA_API_CONFIG.md（LLM 通道）

■ 硬约束（违反即失败）
N1 不直接改库：command 只产出提案（不落库）；apply 才落库。
N2 复用 @gri/agent-core + LLM；解析失败/歧义 → 拒绝并提示（不猜、不臆造）。
N3 apply 须事务 + 复用 S5 校验（防环/层级）+ 审计（source=ai_command）。
N4 operator 门禁（assertSiteOperator）。
N5 提案 planId 一次性 + TTL（防重放/过期应用）。

■ 产出
- POST /api/ontology/dimensions/command {text} → {planId, preview[]}
- POST /api/ontology/dimensions/apply {planId}
- GET /api/ontology/dimensions/changes（审计流水）
- 门户提案预览 UI（diff 展示 + 确认）
- outputs + p3-s6-verify.sh

■ 自检
- 输入"把行业 011 移到门类 B"→预览 diff 正确→确认→库生效+审计 source=ai_command；歧义/非法命令→拒绝提示（不落库）；非 operator→403；全量 jest 不回归；verify FAIL=0
- 纪律：不 commit、不 checkout；凭据零泄漏。

■ 明确不做：微前端。
```
