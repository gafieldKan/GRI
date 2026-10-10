> ✅ STATUS: REWRITTEN (2026-10-10) —— 依据 `.agents/coordination/card-recon-2026-10-10.md §九` 收窄重写。原卡**三大前提两项不成立**：① `services/` 仅 `api` + `auth-center`，**无旧后端可下线**（auth-center 是 JWT 签发中心，**不可下线**）；② 前端硬编码端口实测 = **0**（已统一）；③ CI 已存在（`.github/workflows/ci-cd.yml` + `monorepo-ci.yml`）。**真缺口 = `scripts/health-check.sh`（不存在）+ CI 加固**。
> 执行者：Codex ｜ 依赖：无 ｜ 预估：0.5 天

# T12 任务卡：交付收口 —— 部署健康检查脚本 + CI 加固（收窄）

**执行者**：Codex
**依赖**：无
**产出目录**：`scripts/`、`.github/workflows/`
**预估**：0.5 天

---

## 🎯 本卡定位（必须先读，防重蹈覆辙）

原卡把 T12 写成「前端 base 收敛 + 旧两后端下线 + CI/CD 容器化」三大收敛，**但前两项前提已不存在**。实测对照：

| 原卡要求 | 现实 | 判定 |
|---|---|---|
| 前端 API base 统一 `/api` | ✅ 已统一（`apps/*/src` 无 `localhost:3004/3005/3008` 硬编码） | **核验即可，非目标** |
| 旧后端下线（停 auth-center/gateway） | ❌ **前提错误**：`services/` = `api` + `auth-center`；**auth-center 是 JWT 签发中心，必须保留** | **取消此项** |
| CI/CD 容器化 | 🟡 已有 `.github/workflows/ci-cd.yml` + `monorepo-ci.yml`（需审查/加固，非从零） | **加固，非重建** |
| `scripts/health-check.sh` 部署健康检查 | ❌ **真缺口（不存在）** | **本卡核心** |

**本卡只做 2 件真缺口**：
1. **新增 `scripts/health-check.sh`** —— 部署后验证 `api/health`、关键业务端点、DB/Redis 可达。
2. **CI 加固** —— 审查现有两个 workflow，去重/统一、确保 `tsc`+`jest`+`docker build` 门禁、补充迁移自举检查。

---

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| **N1** | **不得停用/删除 `auth-center`** —— 它是统一 RS256 JWT 签发中心，是身份域基石。原卡「下线 auth-center」是**错误前提**，明确禁止。 |
| **N2** | **不得新建/重写 CI workflow 文件**，只能在既有 `ci-cd.yml` / `monorepo-ci.yml` 上**加固合并**（避免重复触发）。改动前先读全两个文件。 |
| **N3** | **health-check.sh 必须幂等、只读**（GET 探测，不改数据），失败退出码非 0。 |
| **N4** | **不改 `docker-compose.yml` 服务集**（9 服务：api/auth-center/nginx/portal/postgres/postgres-auth/redis/web/web-ai-tutor 均为现状所需）。仅当发现明显编排缺陷时最小修，并在 file-list 记明。 |
| **N5** | **限作用域提交**：本卡产物仅 `scripts/` + `.github/workflows/`（+ 必要时最小 compose 修）；**不得**裹挟前端/后端在途改动。 |
| **N6** | 走 nginx 网关探测（`http://localhost/api/...`），非直连端口。 |

---

## 📥 必读上下文（按序）

| 文件 | 用途 |
|---|---|
| `.github/workflows/ci-cd.yml` | 现有 CI/CD（审查基线） |
| `.github/workflows/monorepo-ci.yml` | 现有 monorepo CI（审查基线，注意与上者可能重叠） |
| `docker-compose.yml` | 服务编排（9 服务），health-check 的探测目标 |
| `nginx/nginx.conf`（或 `nginx/`） | 网关口，`/api` → api、`/auth` → auth-center 转发 |
| `services/api/src/modules/*/.../health*` 或 `main.ts` | 确认 `/api/health` 实现 |
| `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md §5` | M5 交付清单 |

**实测事实**：
- `services/` = `api`、`auth-center`（**无** backend/ai-tutor-backend/gateway）。
- `.github/workflows/` = `ci-cd.yml`、`monorepo-ci.yml`。
- `scripts/health-check.sh` **不存在**。
- 前端硬编码 `300[458]` = **0**。

---

## 📦 产出物清单

| 文件 | 动作 |
|---|---|
| `scripts/health-check.sh` | **新增**：探测 `/api/health`、`/api/food/restaurants`、`/api/ontology/stats`（登录后）、DB/Redis 可达；输出 PASS/FAIL 汇总，退出码非 0 表示失败 |
| `.github/workflows/ci-cd.yml` | 加固（审查后最小改：确保 build/test/docker build 门禁 + migrate 自举检查） |
| `.github/workflows/monorepo-ci.yml` | 加固（同上；与 ci-cd.yml 去重） |
| `.agents/codex/outputs/p2-task-12-file-list.md` | 新增/修改清单 + 对两个 workflow 的审查结论 |
| `.agents/codex/outputs/p2-task-12-verify.sh` | 自动化验收脚本 |

---

## ✅ 验收标准（硬性）

1. `bash -n scripts/health-check.sh` 语法通过；可执行位已设。
2. 运行 `bash scripts/health-check.sh` → 输出 `PASS=X FAIL=0`，退出码 0（容器均在位时）。
3. 两个 workflow YAML 语法合法（`python3 -c "import yaml,sys;yaml.safe_load(open(f))"` 遍历通过）。
4. `bash .agents/codex/outputs/p2-task-12-verify.sh` → `FAIL=0`。
5. **核验项（非改动）**：`grep -rn "localhost:300[458]" apps/*/src` = 0；`docker compose ps` 含 auth-center（**未下线**）。
6. TS 编译不回归：`npx tsc --noEmit`（api）0 error。

---

## 🧪 验收脚本 `p2-task-12-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T12 自动化验收：部署健康检查 + CI 加固
set -uo pipefail
API_BASE="${API_BASE:-http://localhost/api}"   # 走 nginx
# 1. bash -n scripts/health-check.sh
# 2. bash scripts/health-check.sh → PASS>0, FAIL=0, exit 0
# 3. workflow YAML 合法性 × 2
# 4. 核验：无 localhost:300[458] 硬编码（=0）
# 5. 核验：docker compose ps 含 auth-center、nginx、api、postgres、redis
# 6. GET /api/health → {"status":"ok"}
echo "全绿：PASS=$PASS FAIL=$FAIL"
```

---

## 📝 任务卡路径

```
.agents/codex/tasks/p2-task-12-m5-delivery-consolidation.md
```
