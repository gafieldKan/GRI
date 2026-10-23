# B-2 交付清单：对外契约 + 发布面 —— 让底座/业务 agent 真正「可被其他项目调用与使用」

> 执行者：Claude ｜ 日期：2026-10-23 ｜ 分支：`feat/stage-c-unified-auth-shell`（**未 commit / 未 checkout / 未 push**）
> 依据：`docs/AI_PRODUCTIZATION_OPTIONS.md` §〇（缺口①发布边界 / ②外部入口）§七裁决
> 依赖：B-1 `8fb1fb5`、B-3a `40ea83c`、B-3b `b426070`、B-3c `194a72a`（均已提交）
> 定位：**产品化封口** —— 补上外部入口（②）与发布边界（①），即"按产品可发布"的最后一块。

---

## 一、交付文件（11 项）

| # | 文件 | 状态 | 说明 |
|---|------|------|------|
| 1 | `services/api/src/modules/agent/agent-v1.controller.ts` | **新** | `@Controller('v1/agent')` 四条路由；v1 信封 `{v,success,data\|error}`；复用 `AgentService`；`backends` 走 `cliBackends.list()` |
| 2 | `services/api/src/modules/agent/agent-v1.controller.spec.ts` | **新**（8 测） | **真 HTTP**（`listen(0)` + node:http）证明 `/api/v1/agent/*` 路由已注册 + 形状/校验/所有权/空注册表 |
| 3 | `services/api/src/modules/agent/agent.module.ts` | 改（2 行） | `controllers` 增 `AgentV1Controller`（+1 行注释） |
| 4 | `packages/agent-sdk/package.json` | **新** | `@gri/agent-sdk`：`type:module` + `exports` + `files` + `publishConfig` + 零 `dependencies` |
| 5 | `packages/agent-sdk/src/index.js` | **新** | `createAgentClient` + `AgentSdkError`；Bearer 注入 / 基址拼接 / 超时 / 不吞错 |
| 6 | `packages/agent-sdk/index.d.ts` | **新** | 类型同步（C10） |
| 7 | `packages/agent-sdk/tests/agent-sdk.test.js` | **新**（16 测） | 桩 fetch：请求头/基址/信封解包/非 2xx/超时/网络/入参/不依赖底座 |
| 8 | `packages/agent-sdk/README.md` | **新** | 用法 + 错误表 + **「如何作为依赖被其他项目接入」** |
| 9 | `packages/agent-core/package.json` | 改 | 补 `files`/`publishConfig`/`repository`/`homepage`（+ 换行展开 keywords） |
| 10 | `packages/agent-core/README.md` | **新** | 目录导览 + **「如何作为依赖被其他项目接入」**（`files` 引用它，故必须存在） |
| 11 | `docs/AGENT_PUBLIC_CONTRACT.md` | **新** | v1 契约（信封/端点/错误码）+ 版本策略 + 发布边界 + 变更流程 |
| — | `.agents/claude/outputs/b2-file-list.md` + `b2-verify.sh` | **新** | 本文件 + 复验脚本（末行 `PASS=41 FAIL=0 VERIFY_EXIT=0`） |

**未改动**其他任何模块文件；未 `commit`/`checkout`/`push`；零明文。

---

## 二、三条目标的落法

### 目标 1：`/api/v1/agent/*` 版本化对外契约 → 选 **(a) 新增 `AgentV1Controller`**

- **为何选 (a)**：v1 面与旧面**物理隔离**（两个控制器、两个文件），旧面 `agent.controller.ts` 一行不改 → C1 零回归可由 `git diff --quiet` 直接证明；且不必改旧面路由注册方式。
- **版本语义**：路径 `/v1/` ＋ body `v:1` ＋ 响应头 `X-Agent-Api-Version: 1`（三处一致）。
- **信封**：成功 `{v,success,data}`；失败 `{v,success:false,error:{code,message}}`（`content` 空 → HTTP 400 `INVALID_CONTENT`，**fail-fast 不到业务层**）。
- **所有权（C4）**：主体恒取 `req.auth.externalId`；v1 面**不接受任何 `studentId` 入参** → 越权被结构性消灭（无从传入）。

### 目标 2：`@gri/agent-sdk` 薄 HTTP 客户端

- 照 `auth-client` 风格：`type:module` + `exports` + `scripts.test=node --test`。
- **零运行时依赖**（Node ≥18 原生 `fetch`；`AbortController` 超时）；**不 import `@gri/agent-core`**（C5，脚本断言）。
- 非 2xx → 抛 `AgentSdkError{code,status,statusText,url,body}`；2xx 但 `success:false` → `AGENT_ERROR`；**绝不吞错**。
- token 由调用方注入；不读 env、不落盘、不硬编码（C6）。

### 目标 3：发布面

- 两包 `files: ["src","index.d.ts","README.md"]`（**不含 `tests`**，脚本断言）+ `publishConfig{registry: npmmirror, access: restricted}`。
- 根 `package.json` **保持 `private:true`**（C8）；**未执行任何 `npm publish`**（C2，脚本断言无 publish 脚本 / 无 `.npmrc` authToken / 无 `.tgz`）。
- 接入兜底写入两包 README（私有 registry / `npm i git+…` / `npm pack`）。

---

## 三、开放设计点自决（任务卡「❓需确认：无」）

| 点 | 决定 | 理由 |
|---|---|---|
| v1 控制器落点 | **同目录** `agent/agent-v1.controller.ts`（非 `v1/` 子目录） | 与 `agent-admin*.controller.ts` 同层并列，模块注册一行；不必新建目录层级 |
| SDK HTTP 实现 | **原生 `fetch`**（Node ≥18），可 `opts.fetch` 注入 | 零依赖；测试注入桩 fetch，零网络 |
| 契约文档落点 | `docs/AGENT_PUBLIC_CONTRACT.md` | 与既有 `AGENT_*.md` 命名一致 |
| 错误软失败 | v1 面把 `content` 空改判 **400**（旧面仍走 service 软失败） | v1 是对外承诺面，fail-fast + 可编程 `error.code`；不触旧面（C1） |
| `repository`/`homepage` | 占位 `https://example.invalid/gri…` | 避免写死真实主机；仅声明用 |

---

## 四、验收对照（命令 + 实测）

| 验收 | 证据 |
|---|---|
| ① v1 面可用 | `npx jest src/modules/agent/agent-v1.controller.spec.ts` → **8 passed**（真 HTTP：`/api/v1/agent/me`、`me/message`、`me/diagnosis`、`delegate/backends`） |
| ② 旧面零回归 | `git diff --quiet HEAD -- …/agent.controller.ts` → 空；`npx jest` → **Tests: 654 passed, 654 total**（原 646 + 新 8） |
| ③ SDK 契约 | `packages/agent-sdk` → `node --test` → **pass 16 / fail 0**（Bearer 头、`/api/v1/agent/*` 基址、2xx 解包、非 2xx 结构化、TIMEOUT/NETWORK/INVALID_ARGUMENT） |
| ④ SDK 不依赖底座 | `dependencies == {}` 且 src 无 `@gri/agent-core` import（§4 断言） |
| ⑤ 发布面 | 两包 `files`+`publishConfig` 齐备；根包 `private:true`（§5 断言） |
| ⑥ 无远端副作用 | 无 publish 脚本 / 无 `.npmrc` authToken / 无 `*.tgz`（§6）；**registry 无新包**（未执行任何推送） |
| ⑦ 零回归 + C9 | `agent-core` → **pass 123 / fail 0**；`services/api` `tsc --noEmit` = 0；`verify.sh` 末行 **`PASS=41 FAIL=0 VERIFY_EXIT=0`**；零明文 |

---

## 五、未决项

无。task 卡「❓需确认」为空，开放设计点已在 §三 自决并说明。

> 备注（非本卡范围，供后续卡参考）：`npm publish` 到私有 registry 需宿主机先配置 `@gri:registry` 与凭据；
> 本卡只把「独立产品」语义（`files`/`publishConfig`）坐实，未触远端。
