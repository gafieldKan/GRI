# GRI Monorepo — CI/CD 流水线

**日期:** 2026-09-20（重写对齐 M5 单后端拓扑；旧 `services/backend` / `services/ai-tutor-backend` 已退役）

---

## 拓扑（重写轨）

- **业务后端**：`services/api`（workspace `gri-api`，NestJS，全局 `/api`，容器 3002）
- **身份签发中心**：`services/auth-center`（`gri-auth-center`，`/auth/*`，容器 3004）
- **前端**：`apps/{web,web-ai-tutor,portal,mini-program-ai-tutor}`，H5 产物 = `dist/build/h5`
- **网关**：`nginx` 反代 `/api`、`/auth`，并 serve 前端静态产物（prod）或反代 dev server（dev）

## GitHub Actions 配置

文件：`.github/workflows/monorepo-ci.yml`（另有 `ci-cd.yml`）

触发：`push`/`pull_request` 到 `main`、`master`。

### Job 概览

| Job | 命令 | 说明 |
|-----|------|------|
| `backend-test` | `npm run test --workspace=gri-api` | services/api jest 套件 |
| `auth-center-test` | `npm run test --workspace=gri-auth-center` | 签发中心 jest（含身份目录 PII 面） |
| `ai-tutor-test` | `npm run test --workspace=services/ai-tutor-backend` | 遗留/兄弟 AI 后端 |
| `web-ai-tutor-test` | `npm run test:web-ai` | AI 辅导前端单测 |
| `mini-ai-tutor-test` | `npm run test:mini-ai` | 小程序前端单测 |
| `nat-proxy-test` | `node --test tools/nat-proxy/tests/*.test.js` | NAT 工具 |
| `frontend-build` | `npm run build:all-h5` | 校验 web/web-ai/portal 的 prod 静态产物可构建 |
| `e2e-smoke` | 构建并启动 `gri-api`，跑 `scripts/full-test.js` | 需 postgres（DB `gri`） |

> `ci-cd.yml` 的 `deploy-preview` / `deploy-production` 目前为文档化桩（`echo`），接真实主机 SSH/注册表前仅校验产物可构建——不自动 rollout。

## 生产部署（Docker Compose 单机）

完整流程见 `scripts/prod-run.sh`（一键）或手动：

```bash
# 0) 准备 secrets（.env.prod 不入库，从模板复制并填真实密钥）
cp .env.example .env.prod            # 编辑 POSTGRES_PASSWORD / LLM_API_KEY / PAYMENT_NOTIFY_SECRET / AUTH_SERVICE_TOKEN / JWT 密钥对

# 1) 构建前端静态产物
npm run build:all-h5

# 2) 起 prod overlay 栈（真镜像后端 + nginx 静态前端 + TLS + 端口收敛）
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    --env-file .env.prod up -d --build
```

prod overlay（`docker-compose.prod.yml`）相对 dev 的差异：
- **前端**：4 个 dev server（`npx uni`）被 `profiles:["dev"]` 关闭，nginx 直接 serve `dist/build/h5` 静态产物
- **TLS**：443 + 80→443 跳转；证书 `./ssl/`（自签见 `scripts/gen-ssl.sh`，生产换 Let's Encrypt）
- **端口收敛**：仅 nginx 对 80/443 对外；api/auth-center/redis/postgres 宿主端口不再暴露
- **secrets 注入**：`--env-file .env.prod`；DB 密码、`AUTH_SERVICE_TOKEN`、`PAYMENT_NOTIFY_SECRET` 缺失即失败（`:?`）

### 部署/排障命令

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    --env-file .env.prod ps            # 状态
docker compose ... logs -f api         # 日志（api 容器内跑迁移）
docker compose ... down                # 停止
docker compose ... down -v             # 停止并清卷（慎用：会清 pgdata/jwtkeys）
bash scripts/prod-run.sh config        # 仅校验 overlay 渲染不启动
```

## 生产部署建议（追加）

1. **前端**：nginx 直 serve `dist/build/h5`（prod overlay 已内建）；前端默认同源相对 base，部署到独立 CDN/域名时经 `VITE_API_BASE_URL`/`VITE_AUTH_BASE_URL` 在构建期覆盖。
2. **后端正镜像**：api、auth-center 均为多段 Nest `dist/main.js` 镜像（api 容器内跑迁移）。
3. **数据库**：模板建议云托管 PostgreSQL 替代自建；保留迁移 on-start（`node dist/migrate/run-migrations.js`）。
4. **JWT 密钥**：生产注入稳定 `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`（env），避免依赖 dev 卷 `jwtkeys` —— 保证多副本/重启已签发 token 持续有效。
5. **LLM key / 服务令牌 / 支付验签**：只经 env 注入，不入库、不回显。「凭证铁律」延续：admin 写路径由后端 DB 角色守卫（`assertSiteOperator`），前端仅展示开关。