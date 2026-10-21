# W0-b 可下达提示词（粘贴给 Codex）

> 任务卡：`.agents/codex/tasks/w0-b-deploy-freshness-guard.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。
> 前置：无（独立部署健壮性卡）。**不 commit / 不 checkout / 不 push**（助手统一提交）。

---

【任务】W0-b：部署新鲜度守卫 —— 消灭「改了源码、跑了旧代码」。

■ 背景（事故复盘，已定性）
W6-a「学科城区」用户看不到：根因是 `gri-api` 容器镜像是 **2026-10-18** 的（`services/api/Dockerfile` = `COPY dist` 的**烘焙镜像**，**无源码挂载**），缺 W5-a（`380c3d3`，10-20）的 `/api/curriculum/learning-chain` 与 `/api/curriculum/kp-cave`；城区唯一数据源 `learning-chain` 在该镜像里 **404** → 前端拿不到学习链 → 城区 0 店 0 门。已手工 `build api && up -d --no-deps api` 修复。**本卡要把这件事变成「一条命令 + 一个门禁」。**

■ 必读
1. `docker-compose.yml`、`docker-compose.prod.yml`、`scripts/prod-run.sh`、`scripts/health-check.sh`。
2. `services/api/Dockerfile`、`services/auth-center/Dockerfile`（确认二者 = `COPY dist` 烘焙镜像）。
3. nginx 经 **bind-mount** serve：`apps/web/dist/build/h5→food`、`apps/web-ai-tutor/dist/build/h5→tutor`、`apps/portal/dist/build/h5→portal`。

■ 判定口径（写进脚本注释，git 为权威）
- 烘焙镜像 `api` / `auth-center`：
  `newest = git log -1 --format=%ct -- <构建上下文路径>`（api 用仓库根 `.`，auth-center 用 `services/auth-center`）
  `镜像时间 = docker image inspect $(docker inspect <容器> --format '{{.Image}}') --format '{{.Created}}'`
  `newest > 镜像时间` ⇒ **STALE**；另有未提交改动 `git status --porcelain -- <ctx>` 非空 ⇒ **一律 STALE**。
- 前端 `web` / `web-ai-tutor` / `portal`：
  `dist = apps/<x>/dist/build/h5/index.html`
  源码面 = `apps/<x>/src` + `styles/` + `packages/world-art`（按端实际依赖列举；tutor 依赖 world-art 与 styles）
  源码最新（提交/未提交）晚于 dist ⇒ **STALE**。

■ 硬约束（违反即失败）
N1 脚本**只读**：除显式 `--fix` 外**不得**改动任何容器/镜像/文件；默认 **dry-run**，只打印修复命令。
N2 **git 为权威**（`%ct` + `status --porcelain`），mtime 仅 fallback；禁把目录 mtime 当唯一依据。
N3 服务→上下文、前端→dist 路径**显式列举**为脚本常量；**禁模糊扫描 / 默认兜底**。
N4 输出**可机读**：每行 `STALE <service> <reason>` / `FRESH <service>`；末行 `STALE=<n> FRESH=<m>`；**有 STALE 时 exit 1**，否则 exit 0。
N5 **不改**既有 compose 结构/服务名/端口；**不改**既有端点契约；不动 prod overlay 语义；新增只落 `scripts/`。
N6 **不 commit / 不 checkout / 不 push**；凭据零泄漏（脚本内无 token 明文，token 走 env）。

■ 产出
1. `scripts/deploy-freshness.sh`
   - 默认扫「烘焙镜像服务 + 前端三端」，逐行 STALE/FRESH；STALE 附**可复制修复命令**。
   - `--fix`：STALE 项执行 `docker compose -f docker-compose.yml build <svc> && docker compose -f docker-compose.yml up -d --no-deps <svc>`；前端执行 `npm run build:all-h5` 后 **`docker restart gri-nginx`**（uni build 会替换 dist 目录 → bind-mount 失效）。
   - 退出码遵循 N4。
2. `scripts/health-check.sh`（增量）：新增 `GET /api/curriculum/learning-chain?subject=math&branch=math.num` 探针 ——
   无 token 时 `401`⇒PASS（路由存在）/ `404`⇒**FAIL「api 镜像过期」** / `200`⇒PASS；有 `HEALTHCHECK_AUTH_TOKEN` 时 `200`⇒PASS。
3. `.agents/codex/outputs/w0b-file-list.md` + `w0b-verify.sh`。
4. 一段说明：为何 api/auth-center 走 git、前端走 dist。

■ 自检（末行须 `FAIL=0`）
`STALE=0` 基线 · 人为过期→检出 `STALE api`（含修复命令）· `--fix` 后归零 · health-check 探针两态 FAIL/PASS · 输出格式正则 `^STALE=<n> FRESH=<m>$` · 无 token 字面量 · 不 commit/checkout · 末行 `FAIL=0`。

■ 已知坑（写进脚本注释）
- `npm run build:portal` 会**替换** `dist/build/h5` 目录 → nginx 目录 bind-mount 失效（/portal/ 403）→ 构建后须 `docker restart gri-nginx`。
- `pkill -f <pattern>` 会匹配自身 shell 导致自杀；判活用 `ss -lnt`。
- 容器内 api 工作目录 `/app/services/api`，dist 在 `/app/services/api/dist`（非 `/app/dist`）。
