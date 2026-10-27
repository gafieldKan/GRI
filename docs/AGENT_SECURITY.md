# Agent 安全与信任边界（W3）

> 本文件的**每条「宣称限制」都对应一个真测试**（gate = 「每条宣称限制有测试」）。见 §二矩阵。
> 未做/未测的诚实列在 §三。**作者不自验**：矩阵中的测试由独立复验对回源码。

---

## 一、信任模型：谁会看到什么

| 角色 | **拥有（不可让渡）** | **不见** |
|---|---|---|
| **宿主（GRI/`services/api`）** | 所有权真源（`entityId ≡ externalId`）、凭据缝（明文 apiKey 只在 env/宿主内存）、审计落库、`edu.*` 工具实现、冻结信封、无 key 确定性路径 | — |
| **引擎（`gri-core` 默认 / 外部 EnginePort）** | prompt 组装策略、工具环算法、上下文压缩、重试退避（各自内部） | 宿主 apiKey（密文亦不见明文）、他人 entity 数据 |
| **插件（`agent.skill` 等）** | 声明的工具与正文 | 宿主 `apiKey`/`baseUrl`（**只描述能力**，由 host 注入）；不得 import `@gri/*` 业务模块 |
| **外部 CLI 后端（claude-code/codex/openclaw/hermes）** | 自己的鉴权与环境 | GRI 的 apiKey（argv 只走 prompt，绝不拼密钥/token） |

原则：**底座不读 env**（凭据经注入）；**插件不碰凭据**；**引擎不见明文**；**每 entity 隔离**。

---

## 二、宣称限制 × 测试矩阵（gate：每条宣称限制有测试）

| # | 宣称的限制 | 测试（文件::用例，实测直取） |
|---|---|---|
| 1 | **明文 apiKey 绝不落表**（路由行无 `api_key` 列）；每用户密文 **AES-256-GCM**；随机 nonce；篡改/换钥 **fail-fast** | `credential-store.test.js`：`makeCipher: 加密→解密往返…`、`…同一明文两次加密 IV 不同`、`…明文不出现在密文里`、`…篡改 authTag / 换密钥 → 解密抛错`；`CredentialStore: meta 只回元数据，永不含明文/密文`、`…篡改密文 → get 抛错`、`…key_version 不符 → 抛错`；`model-router: 明文永不进路由行写入（set 仍无 api_key 列）` |
| 2 | **凭据只回 hint（后 4 位）**，短 key 全掩 | `credential-store.test.js`：`CredentialStore: set→get … hint 只回后 4 位`、`…短 key 全掩` |
| 3 | **底座不读 env**（判据 3）；构造缺件 fail-fast | `credential-store.test.js`：`CredentialStore: 无 process.env 依赖`、`…构造缺 cipher/query → 抛错` |
| 4 | **凭据来源优先级 entity > default > env**；未注入 credentials 零影响；明文永不进路由行 | `credential-store.test.js`：`model-router: entity 凭据优先于 default…`、`…未注入 credentials → 行为与今日完全一致`、`…明文永不进路由行写入` |
| 5 | **委派 C1 默认只读**：`agent.delegate` **从不**传 `allowDangerous` | `cli-delegate.test.js`：`delegate: 默认只读 —— 从不向 run 传 allowDangerous（C1）`、`…委派 argv 不含任何 DENYLIST 危险旗标（C1）` |
| 6 | **委派 C2 cwd 白名单强制**：越界**明确拒绝且不 spawn**；`../`、兄弟前缀不误放 | `cli-delegate.test.js`：`…cwd 越界（/tmp 之外绝对路径）→ 明确拒绝`、`…相对 ../ 越界 → 明确拒绝`、`…同名前缀兄弟目录不误放`、`…越界 cwd → execute 拒绝且**不 spawn**（run 未被调）` |
| 7 | **委派隔离**：父只拿摘要（无 child 中间产物/stderr/pid） | `cli-delegate.test.js`：`…父只拿摘要 —— 返回体不含 child 中间产物/stderr/pid` |
| 8 | **CLI 执行**：prompt 走 **argv 数组（shell:false）**，注入串原样不被解释；超时**杀进程组** | `cli-backend.test.js`：`run: prompt 走 argv 数组（shell:false），注入串原样传入不被解释`、`…超时 → 杀进程组，exitCode=124，无孤儿进程` |
| 9 | **最小权限（C3）**：四后端默认 argv 不含危险旗标；DENYLIST 拦截 | `cli-backend.test.js`：`argv: 四后端默认 argv 均不含危险旗标（C3 最小权限）`、`DENYLIST: 未放权时 run 拒绝含危险旗标的 argv（不 spawn）`、`…显式 allowDangerous 才追加` |
| 10 | **每 entity 隔离**：数据访问逐 entity 谓词；无 key 回落应答随 entityId 变化、**不跨 entity 复用** | `services/api/.../edu-core/ownership.spec.ts`：`…逐 entity 隔离谓词在内（所有权铁律不被搬丢）`；`agent-core/tests/conformance.js` 的 `entity-isolation` 检查（`engine-conformance.test.js` 驱动） |
| 11 | **`edu.*` 单一所有者**：内联 `edu.*` SQL 仅 `edu-core`（受守卫模块零直取） | `edu-core/ownership.spec.ts`：`agent/identity/twin/tuition 模块生产源码零直取 edu.*` |
| 12 | **鉴权 fail-closed**：需要运营身份却拿不到真源 → **拒绝（绝不放行）**；非运营 → 拒绝 | `authz/authz-plugin.spec.ts`：`**fail-closed**：需要运营身份却拿不到真源…→ 拒绝，绝不放行`、`requiresOperator + 真源判为**非**运营 → 拒绝`；`authz/site-operator.spec.ts`：`根组织 owner/admin → true`、`非成员 → false` |
| 13 | **授权组件后组装**（横切、可缺省；生产 fail-closed） | `authz-plugin.spec.ts`：`清单：id=authz、kind=policy…（「装配清单末位」的后组装依据）`（装配序见 `plugin-host` `DEFAULT_KINDS`：`policy` 恒最后 900） |
| 14 | **插件信任边界**：撞名**拒绝**（不顶替内建）；目录监狱（symlink 出狱拒绝）；P5 卸件**不崩**且诊断可见 | `agent-plugins.spec.ts`：`…插件撞宿主自有名 → 记 TOOL_NAME_RESERVED 且该插件不被装配`、`…skill 是**指向目录外的符号链接** → 拒该插件`、`…目录里只有坏插件 → 教师照常拿 13 个内建工具，且诊断可见（不静默）` |
| 15 | **插件清单 schema**：kind 闭集、apiVersion 兼容、id 规范、撞名拒绝 | `plugin-host.test.js`：`parseManifest: id/kind/apiVersion 非法一律拒绝且带 code`、`CapabilityRegistry: 撞名 id 拒绝加载` |
| 16 | **不静默降级**：CLI/引擎失败**如实报错**（非空成功）；零输出 → error | `cli-backend.test.js`：`run: 正常退出但零输出 → 明确 error，不静默`、`…非零退出且无文本 → 明确 error`；`cli-delegate.test.js`：`…未注入 CliBackendRegistry → ok:false（拒绝静默降级）`、`…桩 run 空文本 → ok:false` |
| 17 | **引擎一致性**：任一 EnginePort 适配器过黑盒套件（含无 key 回落 + entity 隔离） | `engine-conformance.test.js` + `engine-adapters.test.js`（`assertEnginePortConformance`） |

---

## 三、未做 / 未测（诚实清单 —— 勿过度宣称）

- **审计保留（retention）**：`agent.tool_runs` / `agent.external_runs` / `agent.external_events` 目前**只增不删，无保留策略**（无过期清理/归档）。「审计保留」尚未落地——**无对应测试**。
- **信任边界描述符的执行语义**：清单的 `trust`（`boundary`/`network`/`filesystem`）目前只被**解析与校验**，**未对插件运行时施加实际沙箱**（声明即文档，非强制）。
- **网络出口**：外部 CLI 后端按设计可联网（其自带鉴权），GRI 不做网络出口强制。
- **多租户**：业务表零 tenant 作用域（方案未选多租户）——不在本边界内。

> **How to apply**：动 §三 任一项（尤其审计保留）前先补**对应测试**，再把该项从 §三 移入 §二——否则违 gate「每条宣称限制有测试」。
