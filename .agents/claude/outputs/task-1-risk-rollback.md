# Task-1 风险评估与回滚方案

> 作者：GRI 项目架构师（Claude） | 日期：2026-10-07
> 适用范围：单后端收敛版统一鉴权闭环（`services/api` + `@gri/jwt-verifier` + `auth-center`）

---

## 1. 风险登记册

| ID | 风险 | 触发条件 | 影响 | 等级 | 缓解措施 |
|----|------|----------|------|------|----------|
| R1 | **JWKS 每请求拉公钥**（已定位缺陷 F-1） | 未注入静态 PEM 的部署 | 性能下降 + auth-center 单点瓶颈/放大 DoS | **高** | 应用 `task-1-jwt-verifier-jwks-cache.patch`（缓存快路径）+ 回归测试 |
| R2 | JWKS 缓存陈旧（密钥轮换后短暂 401） | auth-center 轮换 RSA 密钥 | 轮换瞬间部分请求 401 | 中 | 现实现「kid 不匹配触发重拉」+「校验失败清缓存重试一次」已覆盖；配合 R1 修复后仍保留该语义 |
| R3 | auth-center 不可用 → 全站鉴权失败 | auth-center 宕机（JWKS 路径） | 全部受保护端点 401 | 中 | **生产注入静态 PEM**（`AUTH_PUBLIC_KEY`，k8s secret）→ 完全离线校验，去除运行时依赖；auth-center 仅签发时需在线 |
| R4 | 时钟偏移导致 `exp` 误判 | 节点时钟漂移 | 合法 token 被判过期 → 401 | 低 | 全节点 NTP；`jsonwebtoken` 默认容忍 `clockTolerance: 0`，如需可显式放宽（当前未开） |
| R5 | 算法混淆攻击（none/HS256 降级） | 攻击者伪造 token | 绕过鉴权 | 低（已防） | `verify` 已显式限定 `algorithms:['RS256']`；`iss` 强校验 |
| R6 | 旧客户端兼容 | 仍在调旧 `/api/auth/login` 的客户端 | 404 | 低（无对象） | 旧后端已退役；三前端已走 `@gri/auth-client`。**无存续旧客户端** |
| R7 | 白名单过宽导致数据泄露 | 误把个人/写端点加入 `public-routes.ts` | 越权读 | 中 | 白名单**单文件集中**、有 `public-routes.spec.ts` 守卫；加以「入名单需双人评审」约定；dashboard 聚合已移出 |
| R8 | 生产未注入 RSA 密钥对 → 重启后 token 失效 | 生产缺 `JWT_PRIVATE_KEY/PUBLIC_KEY` | auth-center 每次重启换临时密钥，已签发 token 全失效 | **高** | 生产**必须**经 secret 注入持久密钥（见 `docker-compose.prod.yml`）；启动日志已 warn |
| R9 | `externalId` 与 `sub` 语义混用 | 开发误用 `sub` 作业务键 | 越权/查不到数据 | 中 | 本文档 §5 裁决：**业务真源恒为 `externalId`**；review 检查点 |

---

## 2. 回滚方案（目标：**≤ 5 分钟**）

> 注：本任务**不新增**生产鉴权路径（统一中间件早已上线），回滚面**仅限**本次若采纳的
> JWKS 缓存补丁（R1 修复）。回滚即「撤销该补丁」或「切换到静态 PEM」。

### 2.1 方案 A —— 撤销 JWKS 缓存补丁（最快，< 1 分钟）

```bash
cd /home/ubantu/GRI
# 若补丁已提交为独立 commit：
git revert --no-edit <patch-commit-sha>
# 若补丁为工作区改动、未提交：
git apply -R .agents/claude/outputs/task-1-jwt-verifier-jwks-cache.patch
```
随后重建受影响服务（若补丁已进入镜像）：
```bash
docker compose build api && docker compose up -d api
```

### 2.2 方案 B —— 切静态 PEM，彻底绕开 JWKS 路径（推荐用于故障止血）

无需改代码，仅改环境变量并重启：静态 PEM 下 `resolvePem` 第一行即返回，**永不拉 JWKS**。

```bash
# docker-compose.prod.yml / k8s secret 中设置：
AUTH_PUBLIC_KEY_FILE=/run/secrets/auth_public.pem   # 或直接 AUTH_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
docker compose up -d api
```
> 前置：该 PEM 必须与 auth-center 当前签发私钥配对，否则全部 401（先核对 `/auth/jwks`）。

### 2.3 方案 C —— 临时把 auth-center 恢复为旧鉴权

**不适用**：旧 `services/backend` / `services/ai-tutor-backend` 已退役删除，
**无法回退到旧 opaque-token/无鉴权模型**（且不应回退——那会重新引入明文密码与硬编码 `student_001`）。
若必须「关闭鉴权」做应急（仅限隔离环境）：从 `main.ts` 摘除 `app.use('/api', authRouter)`
→ 但**生产严禁**（红线性安全降级）。

### 2.4 回滚验收

- [ ] `curl -s -o /dev/null -w '%{http_code}' $API/api/identity/me -H "Authorization: Bearer $TOKEN"` = 200
- [ ] 无 token → 401
- [ ] `docker compose ps` 全 healthy
- [ ] `task-1-e2e-verification.sh` 复跑全绿

---

## 3. 上线前检查清单（fail-fast 门禁）

- [ ] **schema 门禁**：`services/api` 迁移 001–016 幂等通过（`npm run migrate`）。
- [ ] **语义门禁**：`npm run test`（api）+ `npm run test:codegen` 全绿。
- [ ] 生产注入**持久** RSA 密钥对（R8），禁临时密钥。
- [ ] 生产注入静态 `AUTH_PUBLIC_KEY`（R3），去除 auth-center 运行时单点。
- [ ] `AUTH_JWKS_URL` 指向服务名（容器内 `http://auth-center:3004/auth/jwks`）。
- [ ] 白名单 review：`public-routes.ts` 新增项经评审（R7）。
- [ ] 三前端 `authBase` 收敛到 `/auth`（`@gri/auth-client` 默认值）。

---

## 4. 监控建议

- auth-center `/auth/jwks` **请求速率**（R1 修复前会异常高 → 修复后应趋近为零/仅轮换时）。
- `services/api` 401 比率（突增 → 密钥/时钟/issuer 配置问题）。
- auth-center 启动日志中的「未注入 JWT 密钥，已生成临时密钥」warn（**生产出现=告警**，R8）。
