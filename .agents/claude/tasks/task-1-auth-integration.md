# 任务 1：auth-center 后端接入完成（分配给 Claude）

> 优先级：**P0 本周必做** | 预估工时：4-6h | 依赖：无

---

## 🎯 目标

完成 `services/backend` (订餐) 与 `services/ai-tutor-backend` (AI辅导) 两个旧后端的 **JWT 公钥校验中间件接入**，实现统一登录态闭环：
- 从 auth-center JWKS 获取 RS256 公钥
- 校验 JWT，解析 `sub` (identities.id) 与 `externalId` (users.id)
- `studentId` 从 JWT `sub` 注入请求上下文，**移除硬编码 `student_001`**
- 保留旧登录端点作为兼容兜底，逐步切流

---

## 📋 验收标准

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | backend 接入中间件 | `services/backend` 所有 `/api/*` 受保护端点校验通过，白名单合并正确 |
| 2 | ai-tutor-backend 接入中间件 | `services/ai-tutor-backend` 所有 `/api/*` 受保护端点校验通过 |
| 3 | studentId 注入正确 | `req.auth.studentId === JWT.sub`，不再出现硬编码 `student_001` |
| 4 | 端到端闭环验证 | 登录 auth-center → 拿 access_token → 访问两后端受保护端点 → 200 OK |
| 5 | 回滚策略文档化 | 提供 5 分钟内回滚到旧鉴权的步骤 |

---

## 📂 需阅读的上下文（必读）

| 文件 | 关注点 |
|------|--------|
| `services/auth-center/src/auth/jwt-issuer.service.ts` | RS256 签发/校验/JWKS 实现细节 |
| `services/auth-center/src/auth/auth.service.ts` | 登录流程、惰性 bcrypt 升级 |
| `services/backend/infra/auth.js` | 旧订餐鉴权：opaque token、明文密码、requireAuth 实现 |
| `services/ai-tutor-backend/infra/auth.js` | 旧 AI 鉴权：无密码、硬编码 student_001 |
| `packages/jwt-verifier/src/index.js` | 共用 JWT 公钥校验库（两后端需复用） |
| `docs/P2_STAGE_B_AUTH_CENTER_DESIGN.md` §6-7 | 接入设计、迁移顺序、验收判据 |
| `docs/ARCHITECTURE.md` "鉴权拓扑" 小节 | 单后端鉴权模型（目标态） |

---

## 🔧 交付物清单

### 1. 统一中间件设计文档（Markdown）
**文件**：`.agents/claude/outputs/task-1-auth-integration-design.md`

内容：
- 中间件架构图（Mermaid）
- `requireAuth` 统一接口定义（复用 `@gri/jwt-verifier`）
- 白名单合并策略：auth-center 公开读 + 业务公开读
- `req.auth` 结构标准化：`{ sub, domain, externalId, roles, studentId? }`
- 错误码映射：401/403 统一格式

### 2. backend 接入代码
**文件**：`services/backend/infra/auth-unified.js`（新建，替换原 `auth.js`）
- JWKS 缓存（内存 + 定时刷新，参考 `@gri/jwt-verifier`）
- `requireAuth` 中间件：校验 → 解析 → 注入 `req.auth`
- 兼容旧 `/api/auth/login` 兜底（标记 deprecated）
- 单测：`services/backend/infra/auth-unified.spec.js`

### 3. ai-tutor-backend 接入代码
**文件**：`services/ai-tutor-backend/infra/auth-unified.js`（新建）
- 同 backend，额外处理：`studentId = req.auth.sub`（AI 域专用）
- 移除所有硬编码 `student_001` 引用（全局搜索替换）
- 单测：`services/ai-tutor-backend/infra/auth-unified.spec.js`

### 4. 端到端验证脚本
**文件**：`.agents/claude/outputs/task-1-e2e-verification.sh`
```bash
#!/bin/bash
# 1. 登录 auth-center 拿 token
# 2. 访问 backend /api/food/restaurants (公开读) → 200
# 3. 访问 backend /api/orders (需登录) → 200 + req.auth.externalId 正确
# 4. 访问 ai-tutor /api/tuition/questions (需登录) → 200 + req.auth.studentId 正确
# 5. 无 token 访问受保护端点 → 401
# 6. 错误 token → 401
```

### 5. 风险评估与回滚文档
**文件**：`.agents/claude/outputs/task-1-risk-rollback.md`
- 潜在风险：JWKS 缓存失效、时钟偏移、旧客户端兼容
- 回滚步骤：git revert + 环境变量切换 + 重启

---

## ❓ 需你确认的决策点

1. **JWKS 刷新间隔**：建议 5 分钟（auth-center 密钥轮换频率低），你确认吗？
2. **白名单策略**：auth-center 定义的公开读 + 各业务自定义公开读（合并去重），还是完全下发？
3. **旧登录端点保留期**：建议 2 周后下线，你定夺。

---

## 🚀 执行建议顺序

1. 读取上下文文件 → 建立心智模型
2. 产出设计文档（交付物 1）→ 你审核确认
3. 实现 backend 接入（交付物 2）→ 自测
4. 实现 ai-tutor-backend 接入（交付物 3）→ 自测
5. 编写验证脚本（交付物 4）→ 你执行验收
6. 产出风险/回滚文档（交付物 5）

---

## 📝 备注

- **不修改** auth-center 代码（已就绪）
- **不修改** 业务逻辑层，仅鉴权边界
- 旧后端代码在 `services/backend/` 和 `services/ai-tutor-backend/`，均为 Express + JS
- `@gri/jwt-verifier` 已发布为包，可直接 `require('@gri/jwt-verifier')`