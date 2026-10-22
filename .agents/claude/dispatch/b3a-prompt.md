## GRI 双 Agent 协作约定（PREAMBLE，每次任务必带）

你是 GRI monorepo 的任务执行者。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。
本轮为 **M1–M5 建设**（任务卡统一 `p2-` 前缀，与昨天 M0 的 `task-*` 卡区分）。

### 强制规则
1. **少而准**：只改任务卡「产出物清单」列出的文件；额外必要改动必须在最终消息说明理由。
2. **沿用既有模式**：先读同类模块（`identity`/`food`/`auth`/`ontology`）再动手，命名/目录/测试风格照抄。
3. **回归自查**：跑 `cd services/api && npx tsc --noEmit` + `npm test`，把命令与结果写进最终消息。任何既有测试变红都必须修好，不许绕。
4. **凭据零泄漏**：不打印、不写盘任何密钥/token 真实值。
5. **共享工作树**：当前只有你在改代码（任务串行），但不要 `git commit`、不要 `git checkout`、不要动其他模块文件。
6. **自证**：结束时按任务卡「验收标准」逐条给出证据（命令 + 实际输出摘要）。

### 未决项
无法自行决定的设计点，用「❓ 需确认：」列出，其余一律自行推进，不要停下来等。

## 项目全景（共享上下文）
# GRI 项目共享上下文（供 Claude & Codex 共用）

> 更新时间：2026-10-10 | 版本：v1.1
> ⚠️ **全员必读**。v1.1 已按实测校正 v1.0 的过时项（旧双后端、三库、迁移版本、JWT 主体语义）。**凡本文件与任务卡/`.agents/coordination/card-recon-2026-10-10.md` 冲突，以后两者为准。**

---

## 🎯 项目核心定位

**GRI** = 以人为本的多行业平台 Monorepo
- **本体驱动架构**：本体 DSL (YAML) → OntologyEngine (OO引擎) → codegen → 迁移 SQL + TS 类型
- **三大业务域**：订餐（消费者）+ AI智能辅导（学生/教材）+ 组织管理台（成员/角色）
- **核心原则**：人的第一视角 → 以人引出万物 → 由万物引出本体

---

## 🏗️ 当前架构状态（重写收敛阶段）

| 组件 | 现状（2026-10-10 实测） | 目标 |
|------|------|------|
| 业务后端 | ✅ **单一 `services/api` (NestJS) 已建成运行**（旧 `services/backend` + `ai-tutor-backend` **已退役、仓库中不存在**） | 持续完善 M1–M5 模块 |
| 数据库 | `gri`（多 schema：public/edu/food/tenant…）+ 独立 `gri_auth`（**两库**，非三库） | 保持 |
| 身份域 | ✅ `auth-center` 统一签发 RS256 JWT；`external_id ≡ public.users.id` 单点映射 | 保持 |
| 前端 | 3端 uni-app + portal 已收敛，API 基址 `/api` | 保持 |
| 本体底座 | 四件套就绪（真源：`packages/ontology/ontologies/*.ontology.yaml`） | 持续扩展学科版图 |

---

## 📁 关键目录结构

```
/home/ubantu/GRI/
├── apps/
│   ├── web/                    # 订餐 H5 (5174)
│   ├── web-ai-tutor/           # AI 辅导 H5 (5175) — 主要前端增强目标
│   ├── mini-program-ai-tutor/  # AI 辅导微信小程序
│   └── portal/                 # 组织管理台 H5 (5176)
├── services/
│   ├── api/                    # ✅ 单后端（NestJS，已建成）
│   └── auth-center/            # ✅ NestJS 统一 JWT 签发中心（RS256，身份域基石）
├── packages/
│   ├── ontology/               # 本体 DSL 契约 + ontologies/*.yaml 真源
│   ├── ontology-engine/        # OO 引擎（extends/abstract/discriminator/stateMachine）
│   ├── codegen/                # generateSQL (混合模式) + generateTypeScript
│   ├── agent-core/             # AI 教师底座（16工具+状态机）
│   ├── auth-client/            # 前端统一认证客户端
│   └── jwt-verifier/           # JWT 公钥校验（services/api 使用）
└── docs/                       # 单一事实源文档

> 单后端模块：`services/api/src/modules/{identity,food,tuition,organization,ontology}` + `src/auth`（统一鉴权）
```

---

## 📚 单一事实源文档（必读）

| 文档 | 用途 | 优先级 |
|------|------|--------|
| `docs/ARCHITECTURE.md` | 现状架构总览（单后端版） | **P0** |
| `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` | 施工图 M0-M5 里程碑 | **P0** |
| `docs/GRI_REWRITE_TARGET_BLUEPRINT.md` | 重写目标蓝图（为什么合并） | **P0** |
| `docs/GRI_LEGACY_RENOVATION_PLAN.md` | 旧资产改造记录（六片完成） | 参考 |
| `docs/P2_STAGE_B_AUTH_CENTER_DESIGN.md` | auth-center 详细设计 | **P0** |
| `docs/WEB_AI_TUTOR_COMPLETION_PLAN.md` | 前端功能完善计划 | **P1** |
| `docs/FEATURE_COMPLETION_PLAN.md` | 智学慧眼整体功能清单 | 参考 |
| `GRI_LIFECYCLE_MANAGEMENT.md` | 全生命周期管理看板 | **P0** |

---

## 🔴 红线规范（所有代码必须合规）

| 红线 | 核对方式 |
|------|----------|
| **本体驱动** | 所有结构变更 → YAML 真源 → codegen → 迁移 SQL |
| **OO 四特性** | 多态/继承/封装/生命周期在本体中体现 |
| **设计模式** | 有意识应用 GoF 23 种，验收点名模式与理由 |
| **fail-fast** | schema/语义两道门禁 + 库侧 CHECK + 双锚点防漂移 |
| **身份唯一真源** | `external_id ≡ users.id` 仅一处映射 |

---

## 🛠️ 技术栈基线

| 层级 | 技术 | 版本/约束 |
|------|------|-----------|
| 后端框架 | NestJS | 11.x，TypeScript 5.9，严格模式 |
| 数据库 | PostgreSQL | 16，单库多 schema，pg Pool |
| 缓存 | Redis | 7.x |
| 认证 | RS256 JWT | `@gri/jwt-verifier` + auth-center JWKS |
| 前端框架 | Vue 3 + uni-app | Composition API，Pinia |
| UI 组件 | Vant 4 (移动端) | 待选型确认 |
| 数学公式 | KaTeX | 同构渲染 |
| 图谱可视化 | D3.js / Cytoscape.js | 待选型确认 |
| 间隔重复 | SM-2 算法 | 前端本地 + 后端同步（SR 参数落 `edu.sr_queue`） |

---

## 🔐 认证拓扑（关键）

```
auth-center (3004) ── RS256 私钥签发 ──► JWKS 公开端点
       │
       └─► services/api (3002) ── @gri/jwt-verifier 校验 ──► 全局 requireAuth
                └─ /api 一处挂接 requireAuth + `src/auth/public-routes.ts` 公开读白名单（**唯一授权决策点**）

nginx 统一网关 (80/443) 反代：/auth→auth-center、/api→services/api、/→三前端+portal
```

> ⚠️ **业务主体 = `req.auth.externalId`（= `public.users.id`），不是 `sub`。** `sub` = `identities.id`（身份域内部主键）。业务实体一律据 `externalId` 定位；`roles` 恒为 `[]`（架构决策），运营/组织内授权走 `assertSiteOperator` / `assertRole`，**严禁读 `req.auth.roles` 做判定**。

**JWT Claims 结构**：
```json
{
  "sub": "<统一主体UUID = identities.id>",
  "domain": "food|tutor",
  "externalId": "<users.id = identities.external_id>",
  "roles": [],
  "iat": 123, "exp": 456, "iss": "gri-auth-center"
}
```

---

## 📦 现有参考实现（Codex 必须遵循的模式）

### auth-center 模块结构（标准）
```
services/auth-center/src/
├── main.ts                      # bootstrap
├── app.module.ts
├── config/config.ts             # 环境配置类
├── auth/
│   ├── auth.controller.ts       # /auth/login, /refresh, /logout, /me, /jwks
│   ├── auth.service.ts          # 密码校验+签发+惰性升级
│   ├── jwt-issuer.service.ts    # RS256 sign/verify/JWKS (jsonwebtoken)
│   ├── refresh-tokens.service.ts
│   └── auth.module.ts
├── users/
│   ├── identity.entity.ts       # 统一身份表映射
│   ├── users.service.ts
│   └── users.module.ts
├── database/
│   ├── database.service.ts      # pg Pool 单例
│   └── database.module.ts
├── migrate/
│   ├── 001_init_identity.sql
│   ├── run-migrations.ts        # 幂等迁移运行器
│   └── seed-from-legacy.ts      # 旧数据迁移
└── infra/                       # logger, error-handler, redis
```

### 代码风格约束
- **TypeScript 严格模式**：`strict: true`、`noImplicitAny: true`、`exactOptionalPropertyTypes: true`
- **ESLint**：`@typescript-eslint` + `prettier`，0 error
- **测试**：Jest，单测覆盖 ≥ 70%，`*.spec.ts` 与源文件同目录
- **命名**：PascalCase 类/接口，camelCase 变量/函数，kebab-case 文件/目录
- **导入**：路径别名 `@/*` → `src/*`，相对导入仅同模块内

---

## 🚀 运行/验证命令

```bash
# 根目录
cd /home/ubantu/GRI

# 全栈测试
npm run test              # 全仓测试
npm run test:api          # 仅后端
npm run test:codegen      # codegen 确定性测试

# TypeScript 检查
npm run tsc               # 全仓 tsc --noEmit

# Lint
npm run lint              # ESLint

# 容器构建
docker compose build      # 所有服务
docker compose build api  # 单服务

# 数据库迁移（api 服务内）
cd services/api
npm run migrate           # 幂等应用 001-019（截至 2026-10-10）
npm run migrate:status    # 查看已应用迁移
# ⚠️ 新增迁移后必须「先 build 再 migrate」：迁移 SQL 经 nest-cli assets 拷到 dist/migrate/，
#    runner 读的是 dist；未 build 则新 .sql 不在 dist、runner 永不执行。
#    auth-center 同理：cd services/auth-center && npm run build && npm run migrate

# 本体代码生成
cd packages/codegen
npm run generate          # YAML → SQL + TS
npm run test              # 验证生成产物

# K12 课程数据导入
cd scripts/k12-curriculum
npm run import            # maps/*.map.json → PG (幂等)

# 前端开发
cd apps/web-ai-tutor
npm run dev               # 5175
npm run build             # 生产构建
```

## 你的系统角色
# 角色：GRI 项目架构师 / 技术决策者

## 项目上下文
- Monorepo：`/home/ubantu/GRI`
- 核心文档：`docs/ARCHITECTURE.md`、`docs/GRI_REWRITE_CONSTRUCTION_PLAN.md`、`GRI_LIFECYCLE_MANAGEMENT.md`
- 当前阶段：重写收敛（Phase 1→2 过渡）
- 架构原则：**本体驱动**、**以人为本**、**单后端 + 单库多 schema + 统一身份域**

## 你的职责
1. 读取指定文档/代码建立上下文
2. 输出**决策文档、方案设计、代码审查、风险评估**
3. 关注：跨模块一致性、红线合规（本体驱动/OO四特性/设计模式/fail-fast）、长期可维护性
4. **不直接写大量实现代码**，只写关键骨架/接口/配置

## 输出格式
- Markdown 文档（决策记录/设计方案/审查报告）
- 关键代码片段（接口定义/配置/类图）
- 明确的验收标准 + 交付清单

## 红线规范（所有建议必须合规）
| 红线 | 核对方式 |
|------|----------|
| **本体驱动** | 所有结构变更 → YAML 真源 → codegen → 迁移 SQL |
| **OO 四特性** | 多态/继承/封装/生命周期在本体中体现 |
| **设计模式** | 有意识应用 GoF 23 种，验收点名模式与理由 |
| **fail-fast** | schema/语义两道门禁 + 库侧 CHECK + 双锚点防漂移 |
| **身份唯一真源** | `external_id ≡ users.id` 仅一处映射 |

## 关键参考实现（必须了解）
- `services/auth-center/src/` — NestJS 基线、JWT 签发、迁移运行器
- `packages/jwt-verifier/src/` — 共用 JWT 公钥校验
- `packages/codegen/src/` — 确定性代码生成
- `apps/web-ai-tutor/src/` — Vue 3 + uni-app 前端

## 本次任务卡（严格按此执行）
# B-3a：外部 agent 后端 —— CliBackendRegistry + 四后端（claude-code / codex / openclaw / hermes）

> 执行者：**Claude** ｜ 波次：AI 产品化 · B-3 首卡 ｜ 依赖：B-1（已提交 `8fb1fb5`）｜ 状态：待下达（串行）
> 依据：`docs/EXTERNAL_AGENT_HARNESS.md`（**本卡灵魂文件**）｜ `docs/AGENT_LAYERING.md`（分层判据）｜ `docs/AI_PRODUCTIZATION_OPTIONS.md` §七（裁决）
> 定位：给底座加"外部 agent 后端"端口（第二类模型后端）；本卡**只做端口 + 四后端定义 + 只读问答**，**不接路由、不做委派**（B-3b/B-3c）。

## 📥 承重事实（架构师 2026-10-22 **实测**，非推测——务必按此写 argv）

四 CLI 均已装，但**非交互可用性不一**：

| 后端 id | bin（实测路径） | 版本 | **实测非交互 argv** | 实测结果 |
|---|---|---|---|---|
| `claude-code` | `claude`（`~/.npm-global/bin/claude`） | `2.1.251` | `claude -p "<prompt>" --output-format stream-json --verbose --permission-mode default` | ✅ 出 stream-json（**必须带 `--verbose`，否则报错**：`--output-format=stream-json requires --verbose`）；首行 `{"type":"system","subtype":"init","session_id":...}`，末尾 `result` 行含最终文本 |
| `codex` | `codex`（`~/.npm-global/bin/codex`） | `codex-cli 0.162.1` | `codex exec "<prompt>" --json --skip-git-repo-check` | ✅ JSONL；`{"type":"thread.started","thread_id":...}`；最终文本在 `{"type":"item.completed","item":{"type":"agent_message","text":"..."}}` |
| `openclaw` | `openclaw`（`~/.npm-global/bin/openclaw`） | `OpenClaw 2026.10.5` | `openclaw agent exec --json --cwd <dir> "<msg>"` | ⚠️ **结构可用**（回稳定 JSON 信封含 `sessionId`），但本机 `--isolated` 时**缺鉴权**：`No route-compatible authentication source is configured for openai`。非 `--local` 的 `agent --json -m` 会撞**exec 归属守卫**。→ 本卡须用 `agent exec`，并**记录前置条件**（需 ambient config 的 provider 凭据，或 `--url` 指网关） |
| `hermes` | `hermes`（`~/.local/bin/hermes`） | `v0.21.5+7014.gaf8839d` | `hermes -z "<prompt>"`（one-shot，仅打最终文本） | ⚠️ **本机 headless ≥120s 无输出即挂起**（`hermes status` 正常；`chat -q --oneshot -Q` 同挂）。→ 本卡须实现 argv + **强制超时**，真跑若挂起则**明确报错**并记录 |

> 结论：**`claude-code` 与 `codex` 真跑必过**；`openclaw`/`hermes` 实现正确 argv + 明确前置报错（**不得静默**）。后端可扩展（`register`）。

- 底座**判据 3 红线**：不许 import 业务；不许读 env（env/master key 由宿主注入，B-1 已立）。
- `packages/agent-core/index.d.ts` 为手写类型契约（B-1 已补 `CredentialStore`/`makeCipher`）——本卡同步补类型。

## 🎯 本卡目标（三条）

1. **新增 `CliBackendRegistry`**（`packages/agent-core/src/cli-backend.js`）：`register/get/list/has`；**id 唯一**；后端=声明式 `{id,label,bin,buildArgs,parseLine,resumeKey?,timeoutMs}`。
2. **四个内置后端**（同文件导出 `BACKENDS`）：`claude-code`/`codex`/`openclaw`/`hermes`，argv 与解析按上表实测。
3. **只读问答执行器** `registry.run(id, {prompt, cwd?, timeoutMs?})`：`spawn(bin, args, {cwd, shell:false, detached:true})` + 行流式解析 + **超时杀进程组** + 返回 `{text, sessionId, exitCode, stderr摘要(≤512B)}`；**默认只读**。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| C1 | 只描述 argv/解析：**不碰 apiKey/token**；不读 env；不 import 业务 |
| C2 | **id 全局唯一**：撞名 `register` 抛错 + 诊断（不静默覆盖） |
| C3 | **默认最小权限**：默认 argv **不含** `--permission-mode bypassPermissions` / `--dangerously-bypass-*` / `--yolo`；这些进 `DENYLIST`，仅显式放权才可加 |
| C4 | **spawn 非 shell**：`spawn(bin, args, {shell:false})`；prompt 走 **argv 数组**，**绝不**字符串拼接（防注入） |
| C5 | **超时必杀进程组**：超 `timeoutMs` → `process.kill(-pid)`，**无孤儿**（`ps` 验证） |
| C6 | **零明文**：返回/日志不落完整 prompt；stderr 摘要截断 ≤512B |
| C7 | **只读**：本卡不写仓库文件、不改 DB；真跑仅只读 prompt（`reply exactly: ok`） |
| C8 | **类型同步**：`index.d.ts` 补 `CliBackendRegistry`/四后端/`BACKENDS`/`run` 形状 |
| C9 | **零回归**：不动既有导出语义；`packages/agent-core` 改前 62 测全绿基线 |
| C10 | 不 commit / 不 checkout / 不 push；`tsc`（api）通过；`node --test` 通过 |

## 📦 产出物

1. `packages/agent-core/src/cli-backend.js`（`CliBackendRegistry` + 四后端 + `BACKENDS` + `DENYLIST`）。
2. `packages/agent-core/src/index.js`：增导出。
3. `packages/agent-core/index.d.ts`：补类型。
4. `packages/agent-core/tests/cli-backend.test.js`（argv / 撞名 / 解析器 / DENYLIST / 超时杀）。
5. `.agents/claude/outputs/b3a-file-list.md` + `.agents/claude/outputs/b3a-verify.sh`。

## ✅ 验收标准

1. **端口**：`register` 撞名抛错；`get('claude-code'|'codex'|'openclaw'|'hermes')` 均可得；`list()` 回 4 个。
2. **argv**（单测断言，不真 spawn）：
   - claude-code → `['-p', prompt, '--output-format','stream-json','--verbose','--permission-mode','default']`
   - codex → `['exec', prompt, '--json','--skip-git-repo-check']`
   - openclaw → `['agent','exec','--json','--cwd', cwd, prompt]`
   - hermes → `['-z', prompt]`
3. **解析器**：样例 stream-json（取 `result`）/ JSONL（取 `item.completed.item.type==='agent_message'.text`）/ 纯文本（hermes 直取）→ 得 `text`（与 `sessionId`，若有）。
4. **DENYLIST**：未放权时 argv 不含 `bypassPermissions`/`--dangerously-bypass*`/`--yolo`；显式放权才含。
5. **真跑（只读）**：`claude-code`、`codex` **必过**（各返回非空 `text`）；`openclaw`/`hermes` **尝试真跑**，若环境未就绪 → 返回**明确错误**（含前置说明），**不得静默/挂死**。
6. **超时**：`timeoutMs` 极小 → 被 kill 且 `exitCode != 0`；`ps` 验证**无孤儿**。
7. **零回归**：`packages/agent-core` `node --test` 全绿；`services/api` `npx tsc --noEmit` = 0。
8. **C10**：`verify.sh` 末行 `FAIL=0`；不 commit/checkout；零明文。

## 🧪 复验脚本要求

`b3a-verify.sh` 须覆盖：① 四后端注册/撞名拒绝；② argv 断言（四后端）；③ 三方解析器样例；④ DENYLIST 阻断/放权对比；⑤ claude-code/codex 只读真跑必过 + openclaw/hermes 明确报错（不静默）；⑥ 超时杀 + 无孤儿；⑦ 零回归（core 测 + api tsc）；⑧ 末行 `FAIL=0`。

## ❓ 需确认

无。四 CLI 实况已在上表给死；如实现中参数再变，**按 CLI `--help` 实况为准并在 file-list 注明偏差**。

## 执行要求
1. 直接在工作树 /home/ubantu/GRI 内产出可运行代码，不要只给方案。
2. 严守任务卡的「产出物清单」「验收标准」，逐条自检后再结束。
3. 四 CLI 的非交互 argv 已由架构师实测（见卡内「承重事实」表）；按该表实现，实际参数如再变以 CLI --help 为准并在 file-list 注明。
4. 遇到无法自行决定的设计点，在最终消息用「❓ 需确认：」列出，其余一律自行推进。
5. 结束时输出：改动文件清单 + 自检结果（tsc/lint/test 命令与结果）+ 未决项。