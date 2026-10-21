# W0-b：部署新鲜度守卫 —— 消灭「改了源码、跑了旧代码」（烘焙镜像 + 前端 dist）

> 执行者：**Codex** ｜ 波次：部署健壮性（非功能波次）｜ 依赖：无 ｜ 状态：**待下达**（串行铁律：助手复验通过前不下达后继）
> 定位：给「部署产物是否跟得上源码」一条命令 + 一个门禁，不再靠人记。
> 触发事故：见下「事故复盘」。

## 🧯 事故复盘（已定性，2026-10-21）

- **现象**：用户登录后进 `https://localhost/tutor/#/pages/twin/world`，点第 3 个维度页签「学科城区」→ **0 间店 / 0 扇门**，空态「城区要等链取到才铺——不造假楼」+ 控制台 6 个 404。
- **根因**：`gri-api` 容器是 **2026-10-18 构建的旧镜像**（`services/api/Dockerfile` = `COPY dist` 的**烘焙镜像**，**无源码挂载**），**缺 W5-a（`380c3d3`，10-20）新增的 `/api/curriculum/learning-chain` 与 `/api/curriculum/kp-cave`**。
  - 城区唯一数据源 = `learning-chain`；该路由在旧镜像不存在 → **404 `Cannot GET`** → 前端 `chainReady` 永假 → 城区整片不铺。
  - 旧版就有的 `/knowledge-points`、`/knowledge-map`、`/summit-*` 一直 200，所以故障「只在一处、不易察觉」。
  - 旁证：容器内 `docker exec gri-api grep -rl learning-chain /app/services/api/dist` → **空**；本地 `services/api/dist/modules/curriculum/learning-chain.js` **存在**。
- **应急处置（已完成）**：`docker compose -f docker-compose.yml build api && docker compose -f docker-compose.yml up -d --no-deps api` → 城区恢复（76 店 / 6 门 / 12 里程碑 / 三态 dim,half,lit / pageerror=0）。
- **教训**：**烘焙镜像服务改源码后不 rebuild = 跑旧代码**；前端改源码后不 `build:all-h5` = nginx serve 旧 dist。二者都无守卫。

## 📥 承重事实（实测）

- compose 项目名 `gri`；配置 `docker-compose.yml`（+ `docker-compose.prod.yml` overlay）；`docker compose ls` 可见。
- **烘焙镜像服务（须 rebuild 才生效）**：
  - `api` → `build.context: .`，`dockerfile: services/api/Dockerfile`（`COPY --from=build /app/services/api/dist`）；容器 `gri-api`（宿主 3008→容器 3002）。
  - `auth-center` → `build.context: ./services/auth-center`；容器 `gri-auth-center`（宿主 3004）。
- **dev-server 服务（源码 bind-mount，无需 rebuild）**：`web` / `web-ai-tutor` / `portal`（`image: node:20-alpine` + `npx uni --host`，挂 `apps/<x>` 与 `packages`、`styles`）。
- **前端真源 = 构建产物**：nginx（`image: nginx:alpine`）**bind-mount**：
  - `./apps/web/dist/build/h5 → /usr/share/nginx/html/food`
  - `./apps/web-ai-tutor/dist/build/h5 → /usr/share/nginx/html/tutor`
  - `./apps/portal/dist/build/h5 → /usr/share/nginx/html/portal`
  → 前端新鲜度 = 「`dist/build/h5/index.html` mtime/提交」 vs「该端源码面（`apps/<x>/src` + `styles/` + `packages/world-art`）最新改动」。前端 rebuild **不需要**重建 nginx（bind-mount 指向目录）。
- `scripts/prod-run.sh` 已有 `npm run build:all-h5` + `up -d --build`；缺的只是**判定谁过期**。
- `scripts/health-check.sh` 现有探针：`/health`、`/api/health`、`/api/food/restaurants`、`/api/tuition/questions`、`/auth/jwks`、（可选 token）`/api/ontology/stats`；**不含 curriculum 端点**。
- 参考提交：`380c3d3`（W5-a 学习链派生器）→ api 最后相关改动；`b97fda5`（W5-b）→ 前端 + `packages/world-art` 改动。

## 🎯 本卡目标

1. 新增 **`scripts/deploy-freshness.sh`**：一条命令输出 STALE/FRESH + 每条 STALE 的**可复制修复命令**。
2. 烘焙镜像用 **git 权威**判定；前端按 **dist vs 源码**判定。
3. **`scripts/health-check.sh`** 增 **路由存在性**探针：`GET /api/curriculum/learning-chain` 若 404 ⇒ FAIL（=api 镜像过期）；401/200 ⇒ PASS（路由存在，鉴权正常）。
4. 说明文档化：为何 api/auth-center 用 git 判定、前端用 dist 判定。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| N1 | 脚本**只读**：除显式 `--fix` 开关外，**不得**改动任何容器/镜像/文件；默认 **dry-run**，只打印修复命令。 |
| N2 | 判定以 **git 为权威**（提交时间 `%ct` + 未提交改动 `status --porcelain`），mtime 仅作 fallback；**禁止**把易漂移的目录 mtime 当唯一依据。 |
| N3 | 服务→构建上下文、前端→dist 路径映射**显式列举**在脚本内常量里；**禁模糊扫描 / 默认兜底**。 |
| N4 | 输出**稳定可机读**：每行 `STALE <service> <reason>` 或 `FRESH <service>`；末行 `STALE=<n> FRESH=<m>`；**有 STALE 时 `exit 1`**，否则 `exit 0`。 |
| N5 | **不改**既有 compose 结构/服务名/端口；**不改**既有端点契约；不动 prod overlay 语义；新增只落 `scripts/`。 |
| N6 | **不 commit / 不 checkout / 不 push**；凭据零泄漏（脚本内无 token 明文，token 走 env）。 |

## 📦 产出物

1. `scripts/deploy-freshness.sh`
   - 默认：扫「烘焙镜像服务」+「前端三端」，逐行 STALE/FRESH，STALE 附修复命令。
   - `--fix`：对 STALE 项执行 rebuild+up（`docker compose -f docker-compose.yml build <svc> && up -d --no-deps <svc>`）或 `npm run build:all-h5`（前端）+ `docker restart gri-nginx`（**仅当前端 dist 目录被替换、bind-mount 失效时**；见下坑）。
   - 退出码遵循 N4。
2. `scripts/health-check.sh`（增量改）：
   - 新增探针：`GET /api/curriculum/learning-chain?subject=math&branch=math.num`
     - 无 token：`401` ⇒ PASS（路由存在）；`404` ⇒ **FAIL**「api 镜像过期：缺 learning-chain 路由」；`200` ⇒ PASS。
     - 有 `HEALTHCHECK_AUTH_TOKEN`：`200` ⇒ PASS。
3. `.agents/codex/outputs/w0b-file-list.md`、`.agents/codex/outputs/w0b-verify.sh`。
4. 一段说明：api/auth-center 走 git 判定、前端走 dist 判定的理由。

## ✅ 验收标准

1. 在**当前已修复**环境跑 `bash scripts/deploy-freshness.sh` → `STALE=0`、`exit 0`。
2. **人为复现过期**（任选其一：造一个 `services/api` 未提交改动；或 `git commit --allow-empty` 使 api 上下文提交时间晚于镜像）→ 脚本报 `STALE api` 且给可复制修复命令；`--fix` 后复跑 `STALE=0`。
3. health-check：**故意指向旧 api**（或临时把探针打到一个不存在的路径）时对 learning-chain 报 FAIL；指向新 api 报 PASS。
4. `w0b-verify.sh` 末行 `FAIL=0`；**不 commit / 不 checkout**；凭据零泄漏（grep 无 token 字面量）。

## 🧪 复验脚本要求（w0b-verify.sh）

须覆盖：`STALE=0` 基线 · 人为过期 → `STALE api` 检出 · `--fix` 后归零 · health-check 的 learning-chain 探针在两态下 FAIL/PASS · 输出格式可机读（正则匹配 `^STALE=<n> FRESH=<m>$`）· 无 token 字面量 · 不 commit/checkout · 末行 `FAIL=0`。

## ⚠️ 已知坑（写进脚本注释，勿再踩）

- `npm run build:portal`（uni build）会**替换** `dist/build/h5` **目录** → nginx 的目录 bind-mount 失效（`/portal/` 403）。**构建后须 `docker restart gri-nginx`** 重新绑定。（W2 复验已记录于 `handoff-log.md`。）
- `pkill -f <pattern>` 会匹配到自身 shell 命令导致自杀；判活用 `ss -lnt`。
- 容器内 `api` 的工作目录是 `/app/services/api`，dist 在 `/app/services/api/dist`（非 `/app/dist`）。
