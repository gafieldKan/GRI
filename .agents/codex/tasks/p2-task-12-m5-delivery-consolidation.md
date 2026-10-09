> ⚠️ STATUS: NARROW & REWRITE (2026-10-10) —— 前提已不存在（services/ 只有 api+auth-center，无旧后端可下线；前端硬编码=0；CI 已有）。按 card-recon §九 收窄重写后执行。

# T12 任务卡：前端 API base 收敛 `/api` + 旧两后端下线 + CI/CD 容器化

**执行者**：Codex  
**依赖**：M4 完成（T4、T10、T11 均已就绪）  
**产出目录**：`apps/web-ai-tutor/`、`apps/portal/`、`.github/workflows/`、`docker-compose.yml`  
**预估**：1 天

---

## 📋 任务目标

完成 **M5 交付收口**，实现三大收敛：

1. **前端 API base 统一**：`web-ai-tutor`、`portal` 所有请求指向 `/api`（Nginx/网关统一转发），移除硬编码 `localhost:3004/3005/3008`
2. **旧后端下线**：停用 `services/auth-center` 独立部署、`services/gateway`（如有），所有鉴权/业务合入 `services/api`
3. **CI/CD 容器化**：GitHub Actions 构建 → 推镜像 → `docker compose up -d` 部署，含健康检查、回滚

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `apps/web-ai-tutor/src/utils/http.ts` | 现有 axios 实例、baseURL 配置 |
| `apps/portal/src/utils/http.ts` | 同前 |
| `nginx/nginx.conf` | 反向代理配置，`/api` → `api:3008`、`/auth` → `api:3008`（代理到 api 模块） |
| `docker-compose.yml` | 现有服务编排，需精简为 `postgres`、`redis`、`api`、`web`、`portal`、`nginx` |
| `services/api/src/main.ts` | 统一入口，已含所有模块 |
| `.github/workflows/` | 现有 workflow（如有），需新增/重写 `ci.yml`、`cd.yml` |
| `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` §5 | M5 交付收口清单 |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `apps/web-ai-tutor/src/utils/http.ts` | `baseURL: '/api'`，拦截器自动附加 JWT |
| `apps/portal/src/utils/http.ts` | 同上 |
| `nginx/nginx.conf` | `location /api/ { proxy_pass http://api:3008/; }`、`location /auth/ { proxy_pass http://api:3008/auth/; }` |
| `docker-compose.yml` | 精简服务：`postgres`、`redis`、`api`、`web`、`portal`、`nginx`（6 容器） |
| `.github/workflows/ci.yml` | `npm run build`、`npm run test`、`docker compose build` |
| `.github/workflows/cd.yml` | 触发：main 分支推镜像到 GHCR → SSH 部署机 `docker compose pull && docker compose up -d` |
| `scripts/health-check.sh` | 部署后验证：`/api/health`、`/api/food/restaurants`、`/api/ontology/stats` |
| `.agents/codex/outputs/p2-task-12-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/codex/outputs/p2-task-12-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build`（根目录、api、web、portal）0 error
2. **单测全绿**：`npm run test`（api）全部通过
3. **端到端验证脚本通过**：运行 `bash .agents/codex/outputs/p2-task-12-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **前端统一**：
   - `web-ai-tutor` 登录/练习/辅导/图谱/错题本全走 `/api`
   - `portal` 组织/运营台全走 `/api`
   - 无 `localhost:3004`、`localhost:3005` 硬编码
5. **旧后端下线**：
   - `docker compose ps` 仅 6 容器，无 `auth-center`、`gateway`
   - `auth-center` 代码保留（库复用），不再独立部署
6. **CI/CD**：
   - `main` 推送 → Actions 绿 → 镜像推送 GHCR
   - 部署机 `docker compose up -d` 启动 ≤ 2min、健康检查通过
   - 回滚：`docker compose up -d --force-recreate` 指定 tag

---

## 🧪 验收脚本 `task-12-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T12 自动化验收：M5 交付收口
set -uo pipefail
API_BASE="${API_BASE:-http://localhost/api}"  # 走 nginx

# 1. 容器数检查：docker compose ps --services | wc -l = 6
# 2. 无 auth-center/gateway 容器
# 3. 前端构建产物无硬编码端口：grep -r "300[45]" apps/*/dist/ || true
# 4. 登录流程：POST /api/auth/login → token → GET /api/identity/me → 200
# 5. 业务全链路：食堂下单、练习中心、错题本、知识图谱、组织管理 → 均 200
# 6. 健康检查：GET /api/health → {"status":"ok"}
# 7. CI/CD：手动触发 workflow，验证镜像推送、部署成功
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| Nginx 统一入口 | 80/443 端口，`/api/`、`/auth/` 透传到 `api:3008`，`/` → `web:80`、 `/portal/` → `portal:80` |
| JWT 透传 | Nginx 不校验，透传 `Authorization` 头到 api，api 中间件校验 |
| 环境变量 | `docker-compose.yml` 统一用 `${VAR:-default}`，`.env.prod` 覆盖 |
| 镜像标签 | `ghcr.io/${GITHUB_REPOSITORY}/api:${GITHUB_SHA::8}`、`web`、`portal`、`nginx` |
| 数据库迁移 | 容器启动前 `npm run migrate:up`（init container 或 entrypoint） |

---

## 📝 任务卡存放路径

```
.agents/codex/tasks/p2-task-12-m5-delivery-consolidation.md
```