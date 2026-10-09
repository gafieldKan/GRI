# 卡片与现实校正记录（2026-10-10）

> 目的：剩余任务卡多写于 **2026-10-08 之前**，此后本体/孪生/课程大规模合并（`b3ac600` `8fdde79` `e8adac2` 等）已让引用路径/端点对不上现实（与 T4/T11 同一病根）。
> 本文件逐卡记录**实测校正结论**，避免按旧卡下发导致返工。
> 核实方式：直接读源码 + 查库 + 列端点（非自述）。

---

## 一、T2 —— 🔴 真缺口（已重写为 T2a/T2b）

| 项 | 卡片假设 | 现实 |
|---|---|---|
| 授权 | 用 `req.auth.roles` 判 Operator | **恒空**（`roles:[]` 硬编码，`agent-admin.controller.ts:72` 注释佐证） |
| 现状端点 | 仅有 me/:id/updateMe/deleteMe | 一致（**确实缺** role/status/list） |
| 真判定 | — | `OrganizationService.assertSiteOperator(externalId)`（根组织 owner\|admin） |

**处置**：重写。设计卡 `p2-task-2a-*` + 实现卡 `p2-task-2-identity-operator-role-status-impl.md`。旧卡作废。

---

## 二、T3 —— 🟡 真任务（已重写）

| 项 | 现实 |
|---|---|
| T1 e2e 脚本 | **已存在** `.agents/codex/outputs/p2-task-1-verify.sh`，PASS=20 FAIL=0 |
| `identity.contract.spec.ts` | **未创建** |
| 依赖 | 需 T2 完成后并入运营面覆盖 |

**处置**：重写（增量整合，非从零）。见 `p2-task-3-e2e-identity-lifecycle-contract.md`。

---

## 三、T5（Codex）—— 🟠 降级核验（大半已存在）

`tuition.controller.ts` 实测已有：`GET questions`、`GET questions/:id`、`POST practice/session/start`、`POST practice/session/complete`、`POST practice/answer`、`GET practice/history/:studentId`、`GET practice/stats/:studentId`、`GET practice/sr-queue/:studentId`、`GET practice/weakness/:studentId`、`GET analysis/report/:examId`、`GET analysis/report/latest/:studentId`。

| 卡片要的端点 | 现实 |
|---|---|
| `GET /tuition/questions/:id` | ✅ 已有 |
| `POST /practice/sessions/:id/answers` | ⚠️ 路径不同（现有 `POST practice/answer`） |
| `GET /practice/sessions/:id/analysis` | ⚠️ 语义分散在 `analysis/report/*` |
| `GET /practice/sessions/:id/progress` | ⚠️ 需确认 |
| `GET /practice/stats/:externalId` | ✅ 等价 `practice/stats/:studentId` |

**处置**：降级为**核验卡**——先核对现有实现 vs 卡片语义，只补真实缺口（如 progress 端点、路径对齐），不重写已有部分。

---

## 四、T6（Claude）—— 🟠 部分存在 + 参照物失效，需重写卡

| 卡片产出物 | 现实 |
|---|---|
| `tutor-agent.ts` | ✅ 已存在（12K，class TutorAgent） |
| `session-fsm.ts` | ✅ 已存在（20K，class SessionFsm/SessionFsmService） |
| `teaching-card-fsm.ts` | ❌ 缺失 |
| `intent-classifier.ts` | ❌ 缺失 |
| `socratic-templates.ts` | ❌ 缺失 |
| `packages/ontology/ontologies/k12/teaching.yaml` | ❌ **不存在**（本体真源仅 4 个扁平文件） |

**处置**：重写卡——① 沿用既有 `session-fsm` 基座，勿新建重复 FSM；② 修正本体引用（无 `k12/teaching.yaml`，改指 `k12-curriculum.ontology.yaml` 或明确新建 YAML→codegen 路径）；③ 意图/模板确为真缺口。

---

## 五、T7（Claude）—— 🟠 骨架存在，核心缺失，需重写卡

| 卡片产出物 | 现实 |
|---|---|
| `exam-scanner.ts` | ✅ 骨架存在（4K） |
| `ocr-processor.ts` | ❌ 缺失 |
| `question-parser.ts` | ❌ 缺失 |
| `variant-generator.ts` | ❌ 缺失 |
| `packages/ontology/ontologies/k12/questions.yaml` | ❌ **不存在** |

**处置**：重写卡——修正本体引用 + 确认 OCR 引擎选型（卡列了 PaddleOCR/Mistral/Tesseract，需定论）。

---

## 六、T8（Codex）—— 🟠 大半已存在，小缺口

| 项 | 现实 |
|---|---|
| `spaced-repetition.service.ts`（SM-2，interval/easeFactor） | ✅ 已存在 |
| 错题端点 | ✅ 已有 `wrong-questions`(list)、`:id/resolve`、`:id/review`、`:id/retry` |
| `GET /wrong-questions/due`（到期卡片流） | ❌ 缺 |
| `GET /wrong-questions/stats/:externalId` | ❌ 缺 |

**处置**：降级核验 + 小增补（due 队列、stats 聚合）。

---

## 七、T9（Codex）—— ⚫ 作废（与 curriculum 重叠）

`curriculum.controller.ts` 实测已提供 `GET /curriculum/knowledge-graph`、`/knowledge-map`、`/learning-path`（且在白名单内，游客可读结构、登录叠加掌握度）。T9 要在 `tuition` 下重建 `knowledge-graph/:externalId` —— **功能重叠、真源分裂**。

**处置**：**VOID**。知识图谱能力归 `curriculum`（本体驱动），不再在 tuition 重复建设。

---

## 八、T10（Claude）—— 🟢 近乎完整，降级核验

`organization.controller.ts` 实测已有约 24 端点：organizations CRUD、`tree`、`search`、`my`、`capability`、`users/lookup`、`:id/children`、`:id/members`(CRUD)、`:id/members/:userId/role`、`has-role/:role`、`:id/roles`(CRUD)、`:id/invitations`(CRUD)、`invitations/accept/:token`、`:id/audit`。

**处置**：降级为**核验卡**——逐项核对卡片清单 vs 现有实现，只补真实缺口（如审计导出、分页筛选细节）。

---

## 九、T12（Codex）—— 🟠 需收窄重写

| 卡片目标 | 现实 |
|---|---|
| 前端 base 收敛 `/api` | ✅ 已 `VITE_API_BASE_URL \|\| ''`；`localhost:300x` 硬编码计数 = **0** |
| 旧后端下线 | ⚠️ `services/` **只有** `api` + `auth-center`，**无旧后端可下线** |
| CI/CD | ⚠️ 已有 `.github/workflows/ci-cd.yml` + `monorepo-ci.yml` |
| `scripts/health-check.sh` | ❌ 缺 |
| compose 精简 | ⚠️ 已 9 服务（postgres/postgres-auth/redis/auth-center/api/web/web-ai-tutor/portal/nginx） |

**处置**：收窄重写——剩余仅 `health-check.sh` + CI 加固 + prod compose 核对 + 显式验证无硬编码基址。原卡的「旧后端下线」前提已不存在。

---

## 汇总

| 卡 | 判定 | 下一步 |
|---|---|---|
| T2 | 🔴 真缺口 | ✅ 已重写 T2a/T2b |
| T3 | 🟡 真任务 | ✅ 已重写 |
| T5 | 🟠 大半已存在 | 降级核验卡 |
| T6 | 🟠 部分存在 | 重写卡（修本体引用） |
| T7 | 🟠 骨架存在 | 重写卡（修本体引用+定 OCR 选型） |
| T8 | 🟠 大半已存在 | 降级核验 + 小增补 |
| T9 | ⚫ 重叠 | **作废** |
| T10 | 🟢 近乎完整 | 降级核验卡 |
| T12 | 🟠 前提不存在 | 收窄重写 |
