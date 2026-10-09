# 任务 2：启动 M0 骨架 — `services/api` NestJS 基线（分配给 Codex）

> 优先级：**P0 本周必做** | 预估工时：6-8h | 依赖：任务 1 设计确认后可并行

---

## 🎯 目标

在 `/home/ubantu/GRI/services/api/` 生成 **完整可运行的 NestJS 基线**，复用 `services/auth-center/` 的成熟模式，作为单后端重写的地基（M0 里程碑）。

---

## 📋 验收标准（硬性）

| # | 指标 | 通过标准 |
|---|------|----------|
| 1 | TypeScript 编译 | `npm run tsc` **0 error**（严格模式） |
| 2 | ESLint | `npm run lint` **0 error**，warning ≤ 10 |
| 3 | 单元测试 | `npm run test` **全绿**，覆盖率 ≥ 70% |
| 4 | 容器构建 | `docker compose build api` **成功**（alpine 镜像） |
| 5 | 启动健康检查 | `npm run start:dev` 后 `GET /health` 返回 200 |
| 6 | 迁移运行器 | `npm run migrate:status` 正常输出（表 `_api_migrations` 存在） |
| 7 | 全局鉴权生效 | `app.use('/api', requireAuth)` 挂载，白名单生效 |

---

## 📂 参考实现（必须遵循的模式）

**源头**：`/home/ubantu/GRI/services/auth-center/src/`

逐模块对标复制，必要处适配业务后端差异：

| 模块 | 参考文件 | 适配点 |
|------|----------|--------|
| `config/` | `auth-center/src/config/config.ts` | 环境变量：`PORT=3002`、`DATABASE_URL=postgres://.../gri`、`REDIS_URL`、`AUTH_JWKS_URL=http://auth-center:3004/auth/jwks` |
| `database/` | `auth-center/src/database/` | pg Pool 单例、`run-migrations.ts` 幂等、`_api_migrations` 跟踪表 |
| `auth/` | `auth-center/src/auth/` | **薄封装** `@gri/jwt-verifier`，导出 `requireAuth` Guard + `PUBLIC_ROUTES` 常量，**不实现登录/签发**（仅校验） |
| `infra/` | `auth-center/src/infra/` | logger、error-handler、redis client |
| `bootstrap/` | auth-center `main.ts` 中间件链 | **关键**：`app.use('/api', requireAuth)` 全局挂 + 白名单合并 |
| `migrate/` | `auth-center/src/migrate/` + `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` §3.2-3.3 | 001-014 迁移脚本（单库 `gri` 多 schema） |

---

## 🏗️ 目标目录结构（必须完全生成）

```
services/api/
├── package.json              # 依赖对齐 auth-center + @gri/jwt-verifier + @nestjs/* + pg + redis + ioredis
├── tsconfig.json             # 严格模式、路径别名 @/* → src/*
├── nest-cli.json             # Nest CLI 配置
├── .eslintrc.js              # 复用根配置或 auth-center 配置
├── jest.config.js            # Jest 配置
├── Dockerfile                # alpine + bcryptjs（无 native 依赖）
├── .dockerignore
├── src/
│   ├── main.ts               # bootstrap + 全局管道 + 端口 3002
│   ├── app.module.ts         # 根模块
│   ├── config/
│   │   ├── config.ts         # ConfigService 注册（@nestjs/config）
│   │   └── config.module.ts
│   ├── database/
│   │   ├── database.service.ts    # pg Pool 单例（@Global）
│   │   ├── database.module.ts
│   │   ├── run-migrations.ts      # 幂等迁移运行器
│   │   └── migrations/            # 001_init_auth.sql ~ 014_k12_curriculum.sql
│   ├── auth/
│   │   ├── guards/
│   │   │   └── require-auth.guard.ts   # 复用 @gri/jwt-verifier
│   │   ├── constants/
│   │   │   └── public-routes.ts        # 白名单常量（从 auth-center 同步 + 业务扩展）
│   │   ├── auth.module.ts
│   │   └── index.ts            # 导出 requireAuth, PUBLIC_ROUTES
│   ├── infra/
│   │   ├── logger.service.ts
│   │   ├── error-handler.filter.ts
│   │   ├── redis.service.ts
│   │   └── infra.module.ts
│   ├── bootstrap/
│   │   ├── middleware.ts       # 全局中间件链注册
│   │   └── bootstrap.module.ts
│   ├── health/
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   └── modules/                # 空目录，预留 M1-M4 模块
│       ├── identity/
│       ├── food/
│       ├── tuition/
│       ├── organization/
│       ├── ontology/
│       └── master-data/
├── test/
│   ├── app.e2e-spec.ts         # 端到端：健康检查、鉴权生效
│   └── jest-e2e.json
└── README.md                   # 服务说明、运行命令、环境变量表
```

---

## 🔑 关键实现细节（Codex 必须照做）

### 1. `package.json` 依赖（核心）
```json
{
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/jwt": "^11.0.0",          // 仅用类型，不实际用 JwtService
    "@gri/jwt-verifier": "workspace:*", // 本地包引用
    "pg": "^8.11.0",
    "ioredis": "^5.4.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "bcryptjs": "^2.4.3",              // 纯 JS，无 native
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^11.0.0",
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "@types/jest": "^29.5.0",
    "@types/bcryptjs": "^2.4.0",
    "typescript": "^5.9.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

### 2. `src/auth/guards/require-auth.guard.ts`（核心）
```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { verifyToken, JWTPayload } from '@gri/jwt-verifier';
import { PUBLIC_ROUTES } from '../constants/public-routes';

@Injectable()
export class RequireAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path = req.path.replace(/^\/api/, '') || '/';
    const method = req.method;

    // 白名单检查
    if (PUBLIC_ROUTES.some(r => r.method === method && this.matchPath(r.path, path))) {
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice(7);
    try {
      const payload = await verifyToken(token) as JWTPayload & { externalId: string };
      req.auth = {
        sub: payload.sub,
        domain: payload.domain,
        externalId: payload.externalId,
        roles: payload.roles || [],
        studentId: payload.domain === 'tutor' ? payload.sub : undefined,
      };
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private matchPath(pattern: string, path: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(path);
  }
}
```

### 3. `src/bootstrap/middleware.ts`（关键）
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RequireAuthGuard } from '../auth/guards/require-auth.guard';
import { ValidationPipe } from '@nestjs/common';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // 全局前缀
  app.setGlobalPrefix('api');

  // 全局鉴权（关键：一处挂接）
  const authGuard = app.get(RequireAuthGuard);
  app.use('/api', async (req, res, next) => {
    try {
      await authGuard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => null,
        getClass: () => null,
      } as any);
      next();
    } catch (e) {
      next(e);
    }
  });

  // CORS
  app.enableCors({ origin: true, credentials: true });

  await app.listen(process.env.PORT || 3002);
  console.log(`🚀 services/api listening on ${await app.getUrl()}`);
}
```

### 4. 迁移脚本命名规范（必须与 `run-migrations.ts` 匹配）
```
src/migrate/
├── 001_init_auth.sql              # auth.identities / refresh_tokens / _api_migrations
├── 002_init_users.sql             # public.users
├── 003_init_students.sql          # edu.students
├── 004_init_food.sql              # public.restaurants/dishes/orders/payments...
├── 005_init_tenant.sql            # tenant.organizations/members/roles/invitations/audit_logs
├── 006_init_edu_questions.sql     # edu.questions/knowledge_points/practice_sessions...
├── 007_init_edu_exams.sql         # edu.exams/exam_questions/exam_results
├── 008_init_edu_plans.sql         # edu.learning_plans/plan_items
├── 009_init_edu_reports.sql       # edu.reports/radar_data
├── 010_init_ontology.sql          # ontology.master_data/rule_*/ontology_orders
├── 011_init_agent.sql             # agent.llm_routes/sessions/messages/tool_runs/mcp
├── 012_k12_curriculum_core.sql    # ontology.k12_* (本体生成)
├── 013_textbook_inheritance.sql   # 教材继承体系 + CHECK 约束
├── 014_knowledge_area.sql         # KnowledgeArea + KnowledgeAreaPrerequisite (版图 0.4.0)
├── 015_student_twin.sql           # 学生孪生扩展
├── 016_student_twin_ontology.sql  # 孪生本体表
├── run-migrations.ts              # 幂等运行器（参考 auth-center 实现）
└── seed-from-legacy.ts            # 旧数据迁移（可选，M1 做）
```

---

## 📦 交付物清单

| # | 文件/目录 | 说明 |
|---|-----------|------|
| 1 | `services/api/` 完整目录 | 含所有上述文件 |
| 2 | `.agents/codex/outputs/task-2-m0-file-list.md` | 生成的文件清单（用于审计） |
| 3 | `.agents/codex/outputs/task-2-m0-verify.sh` | 验证脚本（自动跑通 7 项验收） |

---

## 🚀 验证脚本内容（`task-2-m0-verify.sh`）

```bash
#!/bin/bash
set -e
cd /home/ubantu/GRI/services/api

echo "=== 1. TypeScript 编译 ==="
npm run tsc

echo "=== 2. ESLint ==="
npm run lint

echo "=== 3. 单元测试 ==="
npm run test -- --coverage

echo "=== 4. 容器构建 ==="
cd /home/ubantu/GRI
docker compose build api

echo "=== 5. 启动服务（后台）==="
docker compose up -d postgres redis
docker compose up -d api
sleep 10

echo "=== 6. 健康检查 ==="
curl -f http://localhost:3002/health

echo "=== 7. 迁移状态 ==="
docker compose exec api npm run migrate:status

echo "=== 8. 鉴权生效测试 ==="
# 无 token 应 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/food/restaurants | grep -q 401 || echo "FAIL: 公开读应 200"
# 受保护端点无 token 应 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/api/orders | grep -q 401 && echo "PASS: 鉴权生效"

echo "✅ M0 验收全部通过"
```

---

## ❓ 需确认的决策点（标记后继续，不阻塞生成）

1. **端口冲突**：`services/api` 3002 是否与旧 `backend` 冲突？（旧已冻结，可复用）
2. **数据库连接串**：`DATABASE_URL=postgres://postgres:postgres@postgres:5432/gri` 确认？
3. **Redis**：共用现有 Redis (6379) 还是新实例？
4. **迁移脚本来源**：完全从 `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` §3.2 抄录，还是参考现有 `services/api/src/migrate/`（当前有 015/016）？

---

## 📝 备注

- **严禁**引入 `bcrypt`（native），必须用 `bcryptjs`
- **严禁**在 `auth/` 模块实现登录/签发逻辑，仅校验
- **必须**复用 `@gri/jwt-verifier`，不重复造轮子
- 所有测试文件 `*.spec.ts` 与源文件同目录
- 生成前先 `cd /home/ubantu/GRI && cat .agents/shared-context.md` 建立上下文