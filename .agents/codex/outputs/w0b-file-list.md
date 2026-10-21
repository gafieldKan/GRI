# W0-b 文件清单与验证说明

## 改动文件

1. `scripts/deploy-freshness.sh`（新增）
   - 默认只读扫描 5 个服务：`api`、`auth-center`、`web`、`web-ai-tutor`、`portal`。
   - 每项输出 `STALE <service> <reason>` 或 `FRESH <service>`；STALE 后附 `FIX ...` 可复制命令。
   - 末行固定为 `STALE=<n> FRESH=<m>`；存在 STALE 时退出 1。
   - `--fix` 才会执行修复：烘焙服务按需 `build --no-cache` + `up -d --no-deps`；任一前端过期则执行
     `npm run build:all-h5`，随后 `docker restart gri-nginx`。

2. `scripts/health-check.sh`（增量修改）
   - 新增 `GET /api/curriculum/learning-chain?subject=math&branch=math.num` 路由存在性探针。
   - 无 token 时 `200` / `401` 为 PASS，`404` 为 FAIL 并明确提示 api 镜像过期。
   - 提供 `HEALTHCHECK_AUTH_TOKEN` 时，仅 `200` 为 PASS；token 仍只从环境变量读取。

3. `.agents/codex/outputs/w0b-verify.sh`（新增）
   - 覆盖基线归零、人为未提交改动判定、可复制修复命令、真实 `--fix` 重建、修复后归零。
   - 覆盖 learning-chain 的旧 API 404 与当前 API 200 两态。
   - 检查机读输出、无 token 字面量、脚本不含 commit/checkout/push、HEAD/分支未变化。
   - 最后两行分别为 `PASS=<n>`、`FAIL=<n>`，末行满足 `FAIL=0`。

4. `.agents/codex/outputs/w0b-file-list.md`（本文件）
   - 记录文件职责、判定口径、未改边界与验证证据。

## 新鲜度判定口径

### 烘焙镜像：api / auth-center

`services/api/Dockerfile` 与 `services/auth-center/Dockerfile` 都在构建阶段编译后把 `dist` 复制进运行镜像，
compose 没有挂载对应源码，因此运行中的容器不会自动反映新源码。

- `api` 的显式构建上下文为仓库根 `.`；`auth-center` 为 `services/auth-center`。
- 源码权威时间取 `git log -1 --format=%ct -- <context>`，镜像时间取容器实际镜像的 `.Created`。
- 源码提交时间晚于镜像时间即 STALE。
- 构建上下文内存在未提交改动即 STALE。`api` 使用其 Dockerfile 实际消费的显式源码面，避免任务文档或无关前端改动误报。
- 修复使用 `--no-cache`，避免 Docker 复用旧层后镜像 `.Created` 仍早于源码提交。

### 前端：web / web-ai-tutor / portal

生产 nginx 直接 bind-mount 三端 `dist/build/h5`，而 `dist` 是 gitignored 构建产物，不能作为 git 真源。

- `web`：`apps/web/src` + `styles`。
- `web-ai-tutor`：`apps/web-ai-tutor/src` + `styles` + `packages/world-art`。
- `portal`：`apps/portal/src` + `styles` + `packages/world-art`。
- 源码最新提交时间取 git `%ct`；未提交文件使用 mtime 作为 fallback。
- 源码提交或未提交改动晚于 `dist/build/h5/index.html` 即 STALE。
- uni build 会替换 `dist/build/h5` 目录，使目录 bind-mount 失效，因此修复后必须重启 `gri-nginx`。

## 边界确认

- 未修改 `docker-compose.yml`、`docker-compose.prod.yml`、既有服务名、端口或端点契约。
- 默认模式不构建、不重启容器、不写业务文件；只有显式 `--fix` 才执行部署动作。
- 未执行 commit、checkout 或 push。
- 脚本与环境变量中不含 token 明文；鉴权 token 只通过 `HEALTHCHECK_AUTH_TOKEN` 注入。

## 验证证据

- `bash scripts/deploy-freshness.sh`
  - 末行：`STALE=0 FRESH=5`
  - 退出码：`0`
- `GATEWAY_BASE_URL=http://localhost bash scripts/health-check.sh`
  - learning-chain：`PASS GET /api/curriculum/learning-chain -> HTTP 200 (route exists)`
  - 末行：`PASS=8 FAIL=0 SKIP=1 WARN=1`
- `bash .agents/codex/outputs/w0b-verify.sh`
  - 末两行：`PASS=19` / `FAIL=0`
  - 退出码：`0`
