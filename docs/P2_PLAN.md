# P2 阶段实施计划：portal / nginx / NestJS 签发中心 / 统一前端

> 状态：规划定稿 v1 | 日期：2026-09-11（更新：2026-09-12 阶段 A/B 已完成落地）
> 决策已拍板：①签发中心 = NestJS 独立服务；②顺序 = 网关优先（nginx + portal 壳）；③统一前端 = 共享鉴权 + 主题 + 路由 shell。

---

## 1. 背景与目标

P1 打牢了底座（本体四件套 + 死代码清理 + 设计令牌契约 + uni-ui 试点）。P2 的目标是把
「多个孤立的端 + 散落的自制鉴权 + 直连端口」收敛为**一个有统一入口、统一身份、统一视觉的成熟系统**。

现状勘察结论（已核对源码）：
- **无 nginx**：`docker-compose.yml` 里反向代理已「规划但注释」（第 174-193 行，TODO 指向缺失的 `./nginx/nginx.conf` 与 `./ssl/`）。
- **无 portal**：没有任何统一入口/门户页。
- **鉴权散落**：`services/backend/src/api/routes/auth-routes.js` 是自制 opaque token（`crypto.randomBytes` + DB 存 sha256 hash），明文密码、refresh token 空实现。无 JWT、无 RSA 签名、无独立身份中心。
- **前端各自为政**：apps/web（点餐→3002）、apps/web-ai-tutor（AI→3003）、apps/mini-program-ai-tutor（AI→3003）。
- **技术栈**：两后端均 Express + pg + dotenv，纯 `.js`，全仓无 tsconfig、无 @nestjs（零起点）。

## 2. 分阶段路线（按拍板顺序）

### 阶段 A — 网关优先（nginx + portal 壳）✅ 已落地（commit 1553c8b）
先让「统一入口」立起来，风险最低、见效最快。

1. **nginx 反向代理**：新增 `nginx/nginx.conf` + `nginx/conf.d/`，反向代理
   - `/` → portal 壳（静态）
   - `/web` → apps/web（5174）
   - `/ai-tutor` → apps/web-ai-tutor（5175）
   - `/api` → backend（3002）
   - `/ai-api`（或 `/tutor-api`）→ ai-tutor-backend（3003）
   - WebSocket：`/ai-api/ws`、`/ws` 支持 `Upgrade` 头升级
2. **portal 壳页**：一个轻量静态站点（`apps/portal/` 或 nginx 托管静态页），
   聚合三个端入口的统一导航（点餐 / AI 辅导 / 小程序二维码），走设计令牌视觉。
3. **启用 docker-compose 里已注释的 nginx 服务**，挂载 `./nginx/` 与 `./ssl/`（ssl 先用自签占位 + 文档说明生产用真实证书）。

### 阶段 B — NestJS 签发中心（独立身份服务）✅ 已落地（commit 62e9177 / 7ca60bf / b4e7fd9）
新建 `services/auth-center/`（Nest 应用），零起点构建标准身份中心。

1. **技术选型**：NestJS 11 + TypeScript 5.9 + `jsonwebtoken`（RS256）+ bcrypt + pg。
   这是全仓第一个 TS 服务，建立 tsconfig/Nest 基线（供后续复用）。
   > 详见 `docs/P2_STAGE_B_AUTH_CENTER_DESIGN.md`：A1 独立身份库（identities/identity_links/refresh_tokens）。
2. **能力**：
   - RSA 私钥签发 JWT access token + refresh token（refresh 存 DB，可轮转/吊销）✅
   - 用户注册/登录（bcrypt 取代明文，存量明文惰性升级）、统一身份（订餐密码账户 + AI 无密码学生）✅
   - `/auth/...` 端点：`login` `register` `refresh` `logout` `me` + `/auth/jwks` ✅
   - 业务后端公钥校验中间件 `@gri/jwt-verifier`（无状态，据 external_id 定位实体）✅
3. **迁移**：`seed-from-legacy.ts` 幂等迁移旧 `users` → `identities`（保留原 UUID 作 external_id）✅。
   > backend 的 `auth-routes.js` 登录端点收敛为「改调 auth-center」留待阶段 C 与前端统一登录时一起切，
   > 当前旧 opaque 登录兜底仍在，未破坏现有前端。
4. **统一登录态**：三前端 + portal 改调 auth-center 签发/校验 —— 阶段 C 完成。

### 阶段 C — 统一前端 shell（共享鉴权 + 主题 + 路由壳）
1. **共享鉴权层**：抽出 `packages/`（或 `styles/` 旁）一个前端共享包，
   封装「登录态获取/刷新/登出」+ 路由守卫，三前端接入。
2. **主题投影落地**：把延后的 antd token 投影（web-ai-tutor）、tailwind 引用令牌（apps/web）、
   uni-ui 已完成（mini-program），全部接到 `styles/tokens/` 真源。
3. **路由 shell**：统一入口导航 + 登录跳转（未登录 → portal/auth-center 登录页）。

## 3. 验收判据（逐段）

- **阶段 A**：`docker compose up nginx portal` 后，浏览器访问 `/` 看到 portal 壳，点击可跳转 `/web`、`/ai-tutor`；`/api/version`、`/ai-api/...` 经 nginx 转发成功；WebSocket 可建立。
- **阶段 B**：`services/auth-center` 用 `npm run test` 通过；登录返回 JWT，`verify` 用公钥校验通过；backend 旧登录端点回归通过（或已被 auth-center 取代）。
- **阶段 C**：三前端共享登录态，未登录访问业务页被重定向；antd/tailwind/uni-ui 三投影层均引用令牌而非裸色。

## 4. 边界与风险

- **不碰业务逻辑**：不改两后端的领域层/业务路由，只做网关与鉴权收敛。
- **NestJS + TS 是新增栈**：保持与现有 Express .js 后端隔离，不强行重写旧服务。
- **WebSocket**：nginx 升级、跨端口、小程序 `ws://` 需重点验证。
- **安全**：`.env` 里的真实密钥（LLM_API_KEY 等）永不提交；RSA 私钥走环境变量/k8s secret。

## 5. 关键文件

- 新增：`nginx/nginx.conf`、`nginx/conf.d/*.conf`、`apps/portal/`、`services/auth-center/`、`packages/jwt-verifier/`
- 修改：`docker-compose.yml`（启用 nginx + portal）、`services/backend/src/api/routes/auth-routes.js`（收敛）、三前端 api/auth 层
- 参考：`docs/ARCHITECTURE.md`（服务边界图）、`docs/CICD.md`