# 任务 3：bcryptjs 容器化验证（分配给 Codex）

> 优先级：**P0 本周必做** | 预估工时：1-2h | 依赖：无，可并行

---

## 🎯 目标

将 `services/auth-center` 的密码哈希依赖从 `bcrypt` (native) 替换为 `bcryptjs` (纯 JS)，使其能在 alpine 容器中正常构建运行。

---

## 📋 验收标准

| # | 指标 | 通过标准 |
|---|------|----------|
| 1 | 依赖替换 | `package.json`：`bcrypt` → `bcryptjs`，`@types/bcrypt` → `@types/bcryptjs` |
| 2 | 代码适配 | 所有 `import * as bcrypt from 'bcrypt'` → `import * as bcrypt from 'bcryptjs'`，API 兼容 |
| 3 | 容器构建 | `docker compose build auth-center` **成功**（alpine 镜像） |
| 4 | 单测通过 | `npm run test` 全绿（登录/注册/refresh/密码校验） |
| 5 | 回归验证 | 明文存量密码惰性升级流程正常 |

---

## 📂 需修改的文件

| 文件 | 修改点 |
|------|--------|
| `services/auth-center/package.json` | 依赖替换 |
| `services/auth-center/src/auth/auth.service.ts` | `bcrypt` → `bcryptjs` 导入 |
| `services/auth-center/src/auth/auth.service.ts` | `bcrypt.hash`/`compare` 调用保持不变（API 兼容） |
| `services/auth-center/Dockerfile` | 移除 `python3 make g++` 等 native 构建依赖 |

---

## 🔧 关键代码变更

### `auth.service.ts` 导入变更
```typescript
// 旧
import * as bcrypt from 'bcrypt';
// 新
import * as bcrypt from 'bcryptjs';
```

**注意**：`bcryptjs` API 与 `bcrypt` 完全兼容：
- `bcrypt.hash(password, rounds)`
- `bcrypt.compare(password, hash)`
- `bcrypt.genSalt(rounds)`

### `Dockerfile` 精简（移除 native 构建工具）
```dockerfile
# 旧：需要 python3 make g++ 编译 bcrypt native
# 新：纯 JS，只需 node
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3004
CMD ["node", "dist/main.js"]
```

---

## 📦 交付物清单

| # | 文件 | 说明 |
|---|------|------|
| 1 | `services/auth-center/package.json` | 修改后 |
| 2 | `services/auth-center/src/auth/auth.service.ts` | 修改后 |
| 3 | `services/auth-center/Dockerfile` | 修改后 |
| 4 | `.agents/codex/outputs/task-3-bcryptjs-verify.sh` | 验证脚本 |

---

## 🚀 验证脚本（`task-3-bcryptjs-verify.sh`）

```bash
#!/bin/bash
set -e
cd /home/ubantu/GRI/services/auth-center

echo "=== 1. 依赖检查 ==="
grep -q '"bcryptjs"' package.json && echo "PASS: bcryptjs 在 dependencies 中" || exit 1
! grep -q '"bcrypt"' package.json && echo "PASS: bcrypt 已移除" || exit 1

echo "=== 2. 代码导入检查 ==="
grep -r "from 'bcrypt'" src/ && echo "FAIL: 仍有 bcrypt 导入" && exit 1
grep -r "from 'bcryptjs'" src/auth/auth.service.ts && echo "PASS: 已改为 bcryptjs" || exit 1

echo "=== 3. TypeScript 编译 ==="
npm run tsc

echo "=== 4. 单元测试 ==="
npm run test

echo "=== 5. 容器构建 ==="
cd /home/ubantu/GRI
docker compose build auth-center

echo "=== 6. 容器运行测试 ==="
docker compose up -d postgres redis
docker compose up -d auth-center
sleep 5
curl -f http://localhost:3004/health
curl -X POST http://localhost:3004/auth/login -H "Content-Type: application/json" -d '{"username":"test","password":"test123"}' || true

echo "✅ bcryptjs 容器化验证通过"
```

---

## ⚠️ 注意事项

- **不修改** `@gri/jwt-verifier`（它不依赖 bcrypt）
- **不修改** 旧后端（backend/ai-tutor-backend，已冻结）
- 测试时需确保现有 bcrypt hash 仍能通过 `bcryptjs.compare` 校验（兼容性已验证）
- 如遇 `bcryptjs` 性能问题，可考虑 `bcryptjs` + `bcrypt` 双支持，但首选纯 `bcryptjs`