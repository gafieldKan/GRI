# P2 阶段 B 详细设计：NestJS 签发中心（auth-center）

> 状态：设计定稿 v1 | 日期：2026-09-11
> 上游：docs/P2_PLAN.md 阶段 B。目标是把两服务散落的身份，收敛到一个统一身份域与标准 JWT 签发。

---

## 1. 现状与设计输入（已核对源码）

| 服务 | 身份现状 | 痛点 |
|---|---|---|
| `services/backend`（订餐） | `users` 表（`id UUID` + username/email/phone + `password_hash` 列**实际存明文**）+ 自制 opaque token（`auth_tokens` 存 sha256 hash）+ 无 refresh | 明文密码、token 存 DB、无签名、无标准 |
| `services/ai-tutor-backend`（AI 辅导） | `students` 表（`id VARCHAR(64)`，如 `student_001`）+ **无密码、无 auth**，前端硬编码 `student_001` | 身份空转，无登录 |

**核心洞察**：两域身份模型完全不同（订餐 = 密码账户 UUID；AI = 无密码学生 string-id）。
「签发中心」的价值不止是替换一个 login 实现，而是建立一个**统一身份域（Identity Domain）**，
让两者都能通过它获得 JWT，业务服务用公钥离线校验，互不持有私钥。

## 2. 目标架构

```
                    ┌────────────────────────────┐
                    │   services/auth-center     │
                    │   (NestJS + TS, 新服务)     │
                    │  RSA 私钥签 JWT             │
                    │  bcrypt 校验密码            │
                    │  refresh 存 DB(可吊销)       │
                    └──────┬─────────────────────┘
                           │ 公开 JWKS / RSA 公钥
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
  backend (Express)   ai-tutor-backend (Express)  前端/portal
  校验 JWT 公钥       校验 JWT 公钥              拿 JWT 调 API
  (订餐 users)         (AI students)             (统一登录态)
```

## 3. 技术选型

- **框架**：NestJS 11（当前 Node 25，兼容）+ TypeScript 5.9 + `bcrypt` + `pg` + `jsonwebtoken`。
  这是全仓第一个 TS 服务，同时落地 `tsconfig` / Nest 模块基线，后续服务可复用。
  > 说明：JWT 签名/校验直接用底层 `jsonwebtoken`（而非 `@nestjs/jwt` 的 `JwtService`），
  > 因 `@nestjs/jwt` 面向单一共享 secret 设计，RS256 下若 module 注册了占位 secret，
  > `sign()` 会误判 "secretOrPrivateKey must be an asymmetric key"。直接 `sign(payload, privateKey, {algorithm:'RS256'})` 最清晰。
- **JWT 算法**：**RS256**（RSA 非对称）。私钥只存 auth-center，公钥通过 JWKS 端点公开给两后端 + 前端离线校验。
- **密码**：`bcrypt`（cost 12）取代明文。存量明文 `password_hash` 迁移时惰性 rehash（登录成功时升级为 bcrypt）。
- **refresh token**：随机 opaque token，DB 存 `sha256` hash + 设备元信息，可轮转、吊销（区别于现有空实现）。

## 4. Nest 模块划分

```
services/auth-center/src/
├── main.ts                 # 引导 + 全局管道 + 端口(PORT || 3004)
├── app.module.ts
├── config/                 # 环境读取(JWT/RSA/DB)
│   └── config.ts           # loadConfig() 返回 JwtConfig + DbConfig
├── auth/                   # 鉴权核心
│   ├── auth.controller.ts  # /auth/login /register /refresh /logout /me
│   ├── auth.service.ts     # 密码校验 + 签发逻辑 + 惰性升级明文
│   ├── dto/auth.dto.ts     # class-validator 校验 DTO
│   ├── jwt-issuer.service.ts   # RS256 sign/verify/JWKS（底层 jsonwebtoken）
│   ├── jwks.controller.ts  # /auth/jwks + /.well-known/jwks.json
│   ├── refresh-tokens.service.ts # refresh 存储/轮转/吊销
│   └── auth.module.ts
├── users/                  # 身份域实体(统一)
│   ├── identity.entity.ts  # 统一身份: id/username/email/phone/domain/name/external_id
│   ├── users.service.ts    # 读写 PG(identities + identity_links)
│   └── users.module.ts
├── database/               # pg 连接
│   ├── database.service.ts # Pool 注入
│   └── database.module.ts
└── migrate/                # SQL 迁移
    ├── 001_init_identity.sql   # identities/identity_links/refresh_tokens
    ├── run-migrations.ts       # 迁移运行器(幂等, _auth_migrations 跟踪)
    └── seed-from-legacy.ts     # 旧 users → identities 迁移(幂等)
```

> **关键决策点 A（身份域是否接管数据）——已拍板：A1 独立身份库**：
> auth-center 拥有独立身份数据库（专用 PG 实例 `gri_auth`），统一 `identities` 表存量迁移进此库，
> 两后端业务表外键引用 `identity_id`（逐步替换原 uuid/string-id）。
> 理由：最规范、前瞻，唯一真源，避免两域各自为政。演进：阶段 B 建库 + 迁移 + 签发，
> P3 完成业务表外键替换收口。

## 5.1 身份域 Schema（A1 独立身份库）

数据库：`gri_auth`（独立 PG，docker-compose 新增 `postgres-auth`，端口 5434）。

```sql
-- 统一主体身份：容纳订餐密码账户 + AI 无密码学生
CREATE TABLE identities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        VARCHAR(20)  NOT NULL,            -- 'food' | 'tutor'
  username      VARCHAR(100) UNIQUE,               -- 订餐有，学生可空
  email         VARCHAR(255) UNIQUE,
  phone         VARCHAR(20)  UNIQUE,
  password_hash VARCHAR(255),                      -- bcrypt；学生可空
  name          VARCHAR(100),                      -- 学生姓名 / 用户昵称
  external_id   VARCHAR(64),                       -- 原域主键（订餐 users.id / AI students.id）
  status        VARCHAR(20)  DEFAULT 'active',
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- 多身份关联（幂等迁移）：一个 identity 可能对应多个原域账户（如一人订餐+学生）
CREATE TABLE identity_links (
  identity_id  UUID REFERENCES identities(id) ON DELETE CASCADE,
  domain       VARCHAR(20) NOT NULL,
  external_id  VARCHAR(64) NOT NULL,
  PRIMARY KEY (domain, external_id)
);

-- refresh token（opaque，可吊销/轮转）
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  device      TEXT,                                 -- 设备/UA 元信息
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

## 5.2 存量迁移策略（A1）

- **订餐 `users` → `identities`**：`domain='food'`、`username/email/phone` 转 `username/email/phone`，
  `password_hash` 原样保留（存量可能是 bcrypt 或明文，登录时由 `AuthService` 惰性 rehash 明文）；
  `external_id` 记原 users.id。
- **AI `students` → `identities`**：`domain='tutor'`、`name` 转 `name`、`password_hash=NULL`（无密码）、
  `external_id` 记原 students.id（如 `student_001`）。
- **迁移脚本**：`services/auth-center/src/migrate/seed-from-legacy.ts`（幂等，可重复跑），
  读两服务的 PG 产出 identities/identity_links。
- **兜底**：迁移完成前，两后端仍用各自旧鉴权；迁移后逐步切 auth-center 签发。

## 5. JWT 契约

- **access token**（RS256，短 TTL 15min）claims：
  `{ sub: <统一主体 id>, domain: 'food'|'tutor', username/name, roles: [], iat, exp, iss: 'gri-auth-center' }`
- **refresh token**（opaque，长 TTL 30d）：DB 存 hash，`/auth/refresh` 轮转。
- **校验**：两后端只校验 `RS256` 公钥（不查库、无状态），从 `iss`/`domain` 判断来源。

## 6. 迁移与对接

1. **backend 端**：`auth-routes.js` 保留（给未迁移的直连调用兜底），新增「JWT 公钥校验中间件」；
   登录端点逐步改调 `/auth/login`（nginx 已把 `/auth` 转发）。`users.password_hash` 惰性 bcrypt 升级。
2. **ai-tutor-backend 端**：新增「JWT 公钥校验中间件」，`studentId` 从 JWT `sub` 注入（替代硬编码 `student_001`）。
3. **nginx**：阶段 A 已预留，新增 `/auth/` → auth-center（3004）转发行。

## 7. 分步落地（阶段 B 内部顺序）

1. Nest 脚手架 + tsconfig 基线 + `pg` 连接 + `/health` 健康检查。
2. `users` 域：读接 backend.users（A2），实现 `login`（bcrypt 校验 + 惰性升级明文）。
3. JWT 签发：RS256 access + refresh，`/auth/login` `/auth/refresh` `/auth/logout` `/auth/me` `/auth/jwks`。
4. 后端接入：backend + ai-tutor-backend 加公钥校验中间件（首个「统一校验」闭环）。
5. 测试：`node --test`（或 jest）覆盖 login/refresh/吊销/校验。

## 8. 验收判据（阶段 B）

- `services/auth-center` `npm run test` 通过。
- `/auth/login` 返回 access+refresh，`/auth/jwks` 返回 RSA 公钥。
- backend 用公钥校验 JWT 通过（旧 `/api/auth/login` 兼容兜底）。
- ai-tutor `studentId` 从 JWT `sub` 注入（不再硬编码）。
- 全仓仍无明文密码新增（存量用户名登录时 bcrypt 升级）。

## 9. 边界与风险

- **不重写**两后端的领域/业务层，只加「公钥校验中间件」+ 登录端点收敛。
- **NestJS 是新栈**，与现有 Express 隔离；不反向移植 TS 到旧服务。
- **RSA 私钥**走环境变量/secret，永不入库（`.env` 已 gitignored）。
- **惰性密码升级**：明文存量的重新登录才升级，避免一次性全表 bcrypt 卡顿。