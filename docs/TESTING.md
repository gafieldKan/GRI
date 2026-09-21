# GRI Monorepo — 测试指南

**日期:** 2026-07-16

---

## 测试框架一览

| 模块 | 框架 | 运行命令 | 环境 |
|------|------|---------|------|
| services/backend | `node:test` + `node:assert` | `npm run test --workspace=services/backend` | 真实 Node.js, mock 外部依赖 |
| services/ai-tutor-backend | `node:test` + `node:assert` | `npm run test --workspace=services/ai-tutor-backend` | 真实 Node.js, mock LLM API |
| apps/web-ai-tutor | Vitest + jsdom + @vue/test-utils | `npm run test:run --workspace=apps/web-ai-tutor` | jsdom 浏览器模拟 |
| apps/mini-program-ai-tutor | Vitest + jsdom + @vue/test-utils | `npm run test:run --workspace=apps/mini-program-ai-tutor` | jsdom + uni API mock |
| packages/lowcode | Vitest + jsdom + React Testing Library | `npm run test --workspace=packages/lowcode` | jsdom |
| tools/nat-proxy | `node:test` + `node:assert` | `cd tools/nat-proxy && node --test tests/*.test.js` | 真实 Node.js, mock 子进程 |
| E2E | Manual + CI smoke | `node scripts/full-test.js` | Docker Compose 全栈 |

## 运行测试

### 根级快捷命令

```bash
# 后端测试
npm run test:backend

# AI 辅导后端测试
npm run test:ai-tutor

# 前端测试
npm run test:web-ai      # AI 辅导 H5
npm run test:mini-ai     # AI 辅导小程序
npm run test:lowcode     # 低代码平台

# 全量测试 (顺序执行)
npm run test:all

# E2E 测试 (需 Docker)
npm run test:e2e
```

### 单独运行

```bash
# 后端
cd services/backend && npm test

# AI 辅导
cd services/ai-tutor-backend && npm test

# 前端 (需先 npm install)
cd apps/web-ai-tutor && npm run test:run
```

## 测试约定

### node:test (后端)

- 使用 `node:test` 的 `describe/it` + `node:assert/strict`
- 测试文件放在 `tests/` 目录，命名 `<module>.test.js`
- Mock 模式: 使用闭包变量 + async 函数作为 mock

```javascript
// 正确: 闭包变量模式
let findByIdReturn = null
mockRepo = {
  findById: async () => findByIdReturn,
}
// 在测试中: findByIdReturn = { id: 'x', status: 'pending' }
```

- **注意**: `node:test` 的 `mock.fn()` **没有** `.resolves()` 方法，不要使用
- 不要 mock 数据库 — 使用 mock Repository 代替

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

# 3. 运行 E2E 测试
node scripts/full-test.js

# 4. 停止服务
docker compose down
```

## 当前测试覆盖 (2026-07-16)

| 模块 | 测试文件 | 测试数 | 状态 |
|------|---------|--------|------|
| services/backend | OrderService, NotificationService, E2E | 36+ | ✅ 通过 |
| services/ai-tutor-backend | SessionFSM, AIService, QuestionService, ReportService, TutorAgent | 81 | ✅ 通过 |
| apps/web-ai-tutor | api-client, session-store, report-store, ws-client, katex-helper | 34 | 📝 待 npm install 后运行 |
| apps/mini-program-ai-tutor | api-client, session-store, report-store, ws-client, katex-helper | 29+ | 📝 待 npm install 后运行 |
| tools/nat-proxy | frp-api, ngrok-controller | 34 | ⚠️ 需 node --test 手动运行 |

## CI/CD 集成

GitHub Actions workflow: `.github/workflows/monorepo-ci.yml`

- 5 个并行 job: backend-test, ai-tutor-test, lowcode-test, web-test, e2e-test
- PostgreSQL service containers 用于数据库依赖的测试
- Matrix strategy 覆盖不同 Node.js 版本