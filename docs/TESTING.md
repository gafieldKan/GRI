# GRI Monorepo — 测试指南

**日期:** 2026-09-26（重写后单后端拓扑对齐）

---

## 测试框架一览

| 模块 | 框架 | 运行命令 | 环境 |
|------|------|---------|------|
| services/api | Jest（ts-jest） | `npm run test`（根级 = `npm run test --workspace=services/api`） | 真实 Node.js，mock 数据库/LLM |
| services/auth-center | Jest | `npm run test --workspace=gri-auth-center` | 签发中心（含身份目录 PII 面） |
| packages/ontology | `node:test` + `node:assert` | `npm run test:ontology` | 本体 DSL 门禁（schema + 语义） |
| packages/ontology-engine | `node:test` + `node:assert` | `npm run test:ontology-engine` | OO 引擎（继承/多态/状态机内省） |
| packages/codegen | `node:test` + `node:assert` | `npm run test:codegen` | 生成器防漂移（双锚点 orders + k12） |
| apps/web-ai-tutor | Vitest + jsdom + @vue/test-utils | `npm run test:web-ai` | jsdom 浏览器模拟 |
| apps/mini-program-ai-tutor | Vitest + jsdom + @vue/test-utils | `npm run test:mini-ai` | jsdom + uni API mock |
| tools/nat-proxy | `node:test` + `node:assert` | `cd tools/nat-proxy && node --test tests/*.test.js` | 真实 Node.js，mock 子进程 |
| E2E | CI smoke | `npm run test:e2e`（= `node scripts/full-test.js`） | Docker Compose 全栈（DB `gri`） |

## 运行测试

### 根级快捷命令

```bash
# 单后端全域 API（jest）
npm run test

# 前端测试
npm run test:web-ai      # AI 辅导 H5
npm run test:mini-ai      # AI 辅导小程序

# packages 测试（本体驱动链）
npm run test:ontology         # DSL 门禁
npm run test:ontology-engine  # OO 引擎
npm run test:codegen          # 生成器防漂移

# 全量前端 + packages（顺序执行）
npm run test:all

# E2E 冒烟 (需 Docker)
npm run test:e2e
```

### 单独运行

```bash
# 单后端
cd services/api && npx jest

# 认证中心
cd services/auth-center && npm test

# 前端 (需先 npm install)
cd apps/web-ai-tutor && npm run test:run
```

## 测试约定

### Jest（后端）

- 测试文件与源码同目录，命名 `*.spec.ts`
- ESM 包（`@gri/ontology-engine` 等）在 jest 模块注册表不可解析 → `jest.mock` 重定向到本地 fake（见 `ontology.service.spec.ts` / `ontology-stats.service.spec.ts` 模式）
- 不要 mock 数据库 — mock Repository / 注入 fake service 代替
- spec 锁「输出形态映射」；真实引擎/DSL 正确性由 packages 的 node --test 套件覆盖

### node:test (packages)

- 使用 `node:test` 的 `describe/it` + `node:assert/strict`
- 测试文件放在 `tests/` 目录，命名 `<module>.test.(js|ts)`
- **注意**: `node:test` 的 `mock.fn()` **没有** `.resolves()` 方法，不要使用
- codegen 防漂移：生成 SQL 与已审阅迁移文件**字节匹配**（锚点 011/012）

### Vitest (前端)

- 使用 `vitest` 的 `describe/it/expect` + `vi.mock()`
- 测试文件放在 `tests/` 目录，命名 `<module>.test.js`
- 使用 `jsdom` 环境模拟浏览器
- Pinia Store 测试: `setActivePinia(createPinia())` 在 `beforeEach` 中
- Vue 组件测试: 使用 `@vue/test-utils` 的 `mount()`

### E2E 测试

```bash
# 1. 启动全栈服务
docker compose up -d

# 2. 等待服务就绪
docker compose ps  # 所有服务 status = healthy

# 3. 运行 E2E 冒烟
node scripts/full-test.js

# 4. 停止服务
docker compose down
```

## 当前测试覆盖 (2026-09-27)

| 模块 | 测试数 | 状态 |
|------|--------|------|
| services/api | jest 242 | ✅ 通过（curriculum 含 knowledgeMap 比重锁形 + agent 含 map.explorer 套件） |
| packages/ontology | node --test 12 | ✅ 通过 |
| packages/ontology-engine | node --test 13 | ✅ 通过 |
| packages/codegen | node --test 36 | ✅ 通过（mixed-mode 15 objects/版图两表断言 + 双锚点防漂移） |
| apps/web-ai-tutor | vitest 20 | ✅ 通过 |
| apps/mini-program-ai-tutor | vitest 37 | ✅ 通过 |
| tools/nat-proxy | node --test | ⚠️ 需手动运行（`node --test tests/*.test.js`） |

## CI/CD 集成

GitHub Actions workflow: `.github/workflows/monorepo-ci.yml`

- 并行 job: backend-test, auth-center-test, web-ai-tutor-test, mini-ai-tutor-test, nat-proxy-test, frontend-build, e2e-smoke（lowcode 两 job 已随平台退役删除）
- PostgreSQL service containers 用于数据库依赖的测试
- 详见 [CICD.md](./CICD.md)
