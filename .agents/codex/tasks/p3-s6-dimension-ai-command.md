# P3-S6：维度 AI 命令（NLP → 提案 → 确认 → 应用）

> 执行者：Codex ｜ 波次：P3 ｜ 依赖：**S5** ｜ 状态：待下达（下达前复核）

## 🎯 本卡定位

operator 用**自然语言**下达维度变更命令；系统解析为**结构化提案（diff）**→ 预览 → 确认 → **事务应用 + 审计**。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **不直接改库**：`command` 只产出**提案**（不落库）；`apply` 才落库。 |
| N2 | 复用 `@gri/agent-core` + LLM；解析失败/歧义 → **拒绝并提示**（不猜、不臆造）。 |
| N3 | `apply` 须**事务** + 复用 S5 的**校验**（防环/层级）+ 审计（`source=ai_command`）。 |
| N4 | operator 门禁（`assertSiteOperator`）。 |
| N5 | 提案 `planId` **一次性 + TTL**（防重放/过期应用）。 |

## 📥 承重事实

- `@gri/agent-core` 存在；LLM 通道 NVIDIA（见 `docs/ai-tutor/NVIDIA_API_CONFIG.md`）。
- S5 已提供 CRUD + 校验 + 审计。

## 📦 产出物

- `POST /api/ontology/dimensions/command {text}` → `{planId, preview[]}`
- `POST /api/ontology/dimensions/apply {planId}` → 应用
- `GET /api/ontology/dimensions/changes`（审计流水）
- 门户**提案预览** UI（diff 展示 + 确认）
- spec + `p3-s6-verify.sh`

## ✅ 验收标准

1. 输入"把行业 011 移到门类 B"→ 预览 diff 正确 → 确认 → 库生效 + 审计 `source=ai_command`。
2. 歧义/非法命令 → **拒绝提示**（不落库）。
3. 非 operator → **403**。
4. 不回归；verify FAIL=0。
