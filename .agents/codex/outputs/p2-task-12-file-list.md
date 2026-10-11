# P2-T12 交付清单：部署健康检查 + CI 加固（收窄）

- 分支：`feat/stage-c-unified-auth-shell`
- 执行者：Codex ｜ 日期：2026-10-11
- 范围：仅新增/修改 `scripts/`、`.github/workflows/` 及本卡验收产物；未触碰业务源码、迁移或 Compose 服务集。

## 一、改动文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `scripts/health-check.sh` | 新增（可执行） | 经 nginx 网关做只读 GET 探测：`/health`、`/api/food/restaurants`、`/api/tuition/questions`、`/auth/jwks`；可选带 token 探测 `/api/ontology/stats`。PostgreSQL/Redis 优先走容器 native readiness，Docker 不可用时退化为端口 TCP 可达性；失败非零退出，输出 `PASS/FAIL/SKIP/WARN`。 |
| `.github/workflows/ci-cd.yml` | 加固 | 保留既有文件，改为统一入口：在既有触发事件上调用可复用 `monorepo-ci.yml`，随后执行 preview/production 部署桩；不再与 monorepo workflow 同事件重复跑测试。 |
| `.github/workflows/monorepo-ci.yml` | 加固 | 保留既有文件，改为 `workflow_call`/`workflow_dispatch`；统一 Node 20，补齐 API/auth-center `tsc`、Jest、Docker build 门禁、迁移构建产物与真实迁移自举、部署健康 smoke；移除仓库当前无 ESLint 配置支撑的失效 lint 门禁。 |
| `.agents/codex/outputs/p2-task-12-verify.sh` | 新增（可执行） | T12 自动化验收：脚本语法/只读性、实际 health-check、两个 workflow YAML、CI gate 关键项、Compose 服务集、容器存在性、API health 契约兼容性。 |
| `.agents/codex/outputs/p2-task-12-file-list.md` | 新增 | 本文件，记录改动、审查结论、验证结果与未决项。 |

## 二、CI 审查结论

### 原问题

- `ci-cd.yml` 使用根目录不存在的 `npm run test:run`、`npm run build:h5`，且根目录没有可直接 `npx tsc --noEmit` 的 `tsconfig.json`；原有根 `npm run lint` 又依赖仓库中不存在的 ESLint 配置。
- `monorepo-ci.yml` 使用 Node 24，与 `ci-cd.yml` 的 Node 20 不一致；原 `e2e-smoke` 在 API 启动前未构建/执行迁移，`scripts/full-test.js` 也不是当前网关契约的健康检查。
- 两个 workflow 在 `main` 上重复触发同一批测试，且都缺少 Docker build 和迁移自举硬门禁。

### 加固结果

- 统一 Node 20、`main`/`develop` 触发面与 npm 缓存；`ci-cd.yml` 只负责调用质量门禁和部署桩，避免与 `monorepo-ci.yml` 重复跑测试。
- `monorepo-ci.yml` 现在包含：
  - API/auth-center 分 workspace `npx tsc --noEmit -p`
  - API/auth-center Jest（`--runInBand`）
  - 前端/工具既有测试与三端 H5 build
  - `docker build`：`services/api/Dockerfile` 与 `services/auth-center/Dockerfile`
  - 迁移自举：先 `nest build`，核对 `dist/migrate/*.sql` 资产数量，再分别对全新 PostgreSQL `gri`/`gri_auth` 执行 built migration runner
  - Deployment smoke：起 storage + api + auth-center + nginx，等待网关后执行只读 `scripts/health-check.sh`
- `auth-center` 保留为 RS256 身份签发中心；未删除、停用或从 Compose 服务集移除。

## 三、健康检查契约说明

- 当前 API 的真实存活端点是 **`/health`**：`services/api/src/main.ts` 使用
  `app.setGlobalPrefix('api', { exclude: ['health'] })`。
- 任务卡写的 **`/api/health`** 当前返回 `401 Unauthorized`（会落入 `/api` 鉴权中间件），不是健康端点。
- 为不触碰 N5 限定的业务源码/nginx 文件，脚本把 `/api/health` 作为兼容性 `WARN` 探测，硬门禁使用真实 `/health`；业务网关转发由 `/api/food/restaurants` 和 `/api/tuition/questions` 验证。
- 当前运行 nginx 是 prod overlay（80→443 + 自签 TLS），脚本使用 `curl -k -L`，因此 HTTP 入口跳转后仍可正常探测；默认 URL 仍按 N6 为 `http://localhost`。

## 四、自检命令与结果

```bash
bash -n scripts/health-check.sh
bash scripts/health-check.sh
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd.yml')); yaml.safe_load(open('.github/workflows/monorepo-ci.yml'))"
cd services/api && npx tsc --noEmit
npm run test --workspace=gri-api -- --runInBand
npm run test --workspace=gri-auth-center -- --runInBand
npm run build --workspace=gri-api
npm run build --workspace=gri-auth-center
docker build -f services/api/Dockerfile -t gri-api:ci .
docker build -f services/auth-center/Dockerfile -t gri-auth-center:ci services/auth-center
bash .agents/codex/outputs/p2-task-12-verify.sh
```

- `bash -n scripts/health-check.sh`：PASS，退出码 0。
- `bash scripts/health-check.sh`：`PASS=7 FAIL=0 SKIP=1 WARN=1`，退出码 0；`WARN` 为 `/api/health` 当前返回 401，`SKIP` 为未提供可选 `HEALTHCHECK_AUTH_TOKEN`。
- 两个 workflow YAML 解析：PASS。
- `cd services/api && npx tsc --noEmit`：PASS，0 error。
- API Jest：`32 suites / 493 tests` 全过；auth-center Jest：`4 suites / 31 tests` 全过。
- API/auth-center 构建：PASS；`dist/migrate` SQL 产物分别为 21、2。
- API/auth-center Docker build：PASS。
- `bash .agents/codex/outputs/p2-task-12-verify.sh`：`全绿：PASS=26 FAIL=0 SKIP=0`，退出码 0；包含不可达网关时健康脚本非零退出的负向检查。

## 五、N1-N6 对照

- **N1**：`auth-center` 保留，workflow 中仅新增测试和镜像构建门禁。
- **N2**：只修改既有 `ci-cd.yml`、`monorepo-ci.yml`，未新建/重写第三个 workflow。
- **N3**：health-check 仅使用 GET HTTP 探测；PostgreSQL/Redis 仅做 `pg_isready`/`PING` 或 TCP 可达性检查，不改数据。
- **N4**：未修改 `docker-compose.yml`，服务集仍为 9 个。
- **N5**：改动限于 `scripts/`、`.github/workflows/` 与本卡输出文件。
- **N6**：HTTP 业务探测统一从 `http://localhost/...` nginx 网关进入，不直连 API/auth-center 业务端口。

## 六、未决项

❓ 需确认：任务卡要求探测 `/api/health`，但当前代码契约明确将该路径排除在 `/api` 前缀之外，真实健康端点只有 `/health`。本卡为遵守 N5/N6 未新增 nginx alias 或改 API 路由；如必须保留 `/api/health` 对外契约，应另立小卡为该路径增加显式转发或路由别名。
