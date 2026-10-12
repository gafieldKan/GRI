# P3-S5 ~ S6 下达提示词（**Claude**）

> 执行者：**Claude**（维度维护台 + AI 命令；设计先行 + UI/LLM 域，对齐 Claude 强项）。串行，一次一个。
> ⚠️ 下达前请让我复核承重事实（S6 依赖 S5 产出）。
> 卡片全文：`.agents/claude/tasks/p3-sN-*.md`。
> 注：这两卡偏"设计 + 复杂域"，属 Claude 负责范围（`2/3/6/7/10` 同族）；**产出后由我（OpenClaw）独立复验**（作者不自验）。

---

## 【P3-S5】维度维护台（operator CRUD + 审计）

```text
【任务】P3-S5：维度维护台（operator CRUD + 审计）

工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。
任务卡：.agents/claude/tasks/p3-s5-dimension-admin-crud.md —— 先读它。

■ 必读上下文
1. .agents/claude/tasks/p3-s5-dimension-admin-crud.md（本卡全文）
2. services/api/src/migrate/{021_un_regions,022_isic_rev5}.sql（维度表结构）
3. services/api/src/modules/organization/*（assertSiteOperator 门禁 + 审计表样式，T10 同族）
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
- .agents/claude/outputs/p3-s5-file-list.md + p3-s5-verify.sh

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
任务卡：.agents/claude/tasks/p3-s6-dimension-ai-command.md —— 先读它。

■ 必读上下文
1. .agents/claude/tasks/p3-s6-dimension-ai-command.md（本卡全文）
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
- .agents/claude/outputs/p3-s6-file-list.md + p3-s6-verify.sh

■ 自检
- 输入"把行业 011 移到门类 B"→预览 diff 正确→确认→库生效+审计 source=ai_command；歧义/非法命令→拒绝提示（不落库）；非 operator→403；全量 jest 不回归；verify FAIL=0
- 纪律：不 commit、不 checkout；凭据零泄漏。

■ 明确不做：微前端。
```
