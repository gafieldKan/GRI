# 双产品三维度复盘与调整优化方案（2026-10-24）

> 背景：B 波五卡（B-1 `8fb1fb5`、B-3a `40ea83c`、B-3b `b426070`、B-3c `194a72a`、B-2 `a05419f`）已提交并复验。
> 本文按用户要求**重新审视两个产品**（① 底座产品 `@gri/agent-core`；② 业务 agent 运行时产品「GRI AI 教师」及其对外契约 `/api/v1/agent/*` + `@gri/agent-sdk`），从**三个维度**找出考虑不全面、不完善之处，并按项目总目标（`docs/GRI_REWRITE_TARGET_BLUEPRINT.md`：单一后端 + 以人为本的**多行业平台**；`docs/AGENT_LAYERING.md`：底座=引擎/业务=整车）给出**调整后的优化方案**。
> 方法：每条判断附 `file:line` 或提交号证据；不采信注释与自述，以扫描实况为准。

---

## 〇、先修正一句我之前说过头的话

B-2 收官时我说「按产品可发布门槛达成」。按方案 B 原文（`docs/AI_PRODUCTIZATION_OPTIONS.md` §二）的定义细纠：

- **「可调用」** ✅ 真达成（`/api/v1/agent/*` + SDK，有测试有契约文档）。
- **「可安装」** 🟡 只是**声明式**（`packages/agent-core/package.json` 补了 `files`/`publishConfig`，但**没有真实 registry、没有发布 CI**；`repository`/`homepage` 是 `example.invalid` 占位）。
- **「可被别人用」** ❌ **未达成**——业务 agent 仍是**教育专用**：17 个教学工具 + `tutor` 技能**全部硬编码**在 `services/api/src/modules/agent/agent.service.ts`（`_teachingTools()` 一处装配），外部项目要「用」只能整体 fork GRI 服务——这正是方案 B 要消灭的状态。

**结论：B-2 只完成了 B 的「对外封口」半边；B 的主体——「业务 agent 模板化（插件化）」一行未动。** 下文三维度即围绕这个要害展开。

---

## 一、维度一：产品形态与生态位（对齐「多行业平台」总目标）

### 1.1 现状事实

| 项 | 实况 | 证据 |
|---|---|---|
| 底座行业无关性 | 名义成立、**实际渗漏** | `packages/agent-core/src/agent.js:163` system prompt 硬写「## 关于该学生的记忆」；`memory.js:3`、`mcp/pool.js:6` 注释用「学生」术语 |
| 业务 agent 可移植性 | **零**：教育硬编码进宿主 | 17 工具（`answer.grade`…`wrong.list`）+ `tutor` 技能集中装配于 `agent.service.ts` `_teachingTools()`；第二范式 `modules/tuition/agents`（16 文件）另起炉灶 |
| 每用户配置 | 数据模型有、**写入面只有运营** | 路由写入口径一：`agent-admin.controller.ts` `_guard()` = `assertSiteOperator`；`entity=<uid>` 行仅运营代建 |
| 用户自助选择 | **不存在**（前端零 UI、无端点） | `agent.controller.ts` 仅透传 `routeKey`；三前端 + portal 无 provider/cli 选择界面（grep 实测） |
| 业务 agent 运行时交付物 | 只有「GRI 这个服务」 | 无独立运行时包/镜像/模板仓库；`@gri/agent-sdk` 只是 HTTP 客户端，不是运行时 |

### 1.2 考虑不全面的点（风险）

1. **「多行业」卡在教育**：平台总目标是订餐 + 辅导 + 组织等多行业。底座尚可移植，但「业务 agent 运行时」换行业必须 fork——B-2 之后别人「能调 GRI 的教师」，**不能造自己的 agent**。这是 B 方案的核心未竟。
2. **「每用户单独配大模型 + key」做了三成**：加密存储（`032_agent_credentials.sql` + `CredentialStore`）✅；但**只有运营能建/改每个用户的路由行与 key**，用户本人无任何自助面（E-4 未做）；**主密钥轮换工具不存在**（`agent-credentials.service.ts` 只 fail-fast，无 rotation runbook）。
3. **persona/subject 选择未进对外契约**：服务层支持 `opts.subject` 注入学科 persona（`agent.service.ts` `sendMessage`），v1 契约只收 `{content, routeKey}`——外部项目无法选科，契约缺项。
4. **第二范式的归宿未决**：`tuition/agents`（FSM 流水线零件 + 自带 `LlmService`）既非插件也非底座消费者——V1/V2 两条判据上的双路径至今并存。

### 1.3 方向

业务 agent 运行时拆成「**运行时薄壳 + 行业插件包**」，GRI 教育栈降为**第一组插件**（`AGENT_SKILL_PLUGIN_CONTRACT.md` 已铺路）；E-4 补用户自助开关。

---

## 二、维度二：安全与信任边界（产品化的第一道门）

### 2.1 现状事实（已做的，不抹杀）

| 项 | 实况 | 证据 |
|---|---|---|
| 凭据加密 | AES-256-GCM，明文不落库不回传；GET 仅 `has_key`+掩码 | B-1 `8fb1fb5`；`agent-credentials.service.ts` |
| CLI 后端默认只读 | DENYLIST 默认不含 bypass/yolo；越界 cwd 拒绝且不 spawn | B-3a/B-3c（独立复验 28/28 + 9/9） |
| 父只拿摘要 | child stderr/pid/中间产物不回父 | `cli-delegate.js` 仅回 `{ok,backend,summary,sessionId,exitCode,timedOut,error}` |
| 审计 | `agent.tool_runs` 落 `entity_id/tool_name/args/result/latency_ms` | `agent.service.ts:1305-1307` |

### 2.2 考虑不全面的点（按严重度）

1. **「cwd 白名单」不是沙箱** ⚠️ 高：`spawn` 出的 claude-code/codex 以**宿主机进程权限**运行，cwd 只设工作目录；进程**仍可读取该 OS 用户能读的任何文件**（`../../etc/passwd` 之类）。今天的默认白名单 `['/home/ubantu/GRI']` 降低了误伤面，但**信任边界实际是 OS 用户级**，不是目录级。多用户上线前必须：按用户隔离 OS 身份 / 容器 / 明确在文档声明此边界。
2. **委派目标的注入面** ⚠️ 高：`agent.delegate` 的 `goal` 是自然语言、由**父 agent 的 LLM 生成**——模型输出不可信。恶意/幻觉的 goal 会让外部 agent 在允许目录内做任意事（写文件、跑 git）。当前只有 DENYLIST 旗标防护，**没有 goal 内容闸门、没有人审、没有速率限制**。
3. **外部后端的登录态即宿主机登录态**：`--isolated` 缺鉴权（B-3a 实测）→ openclaw/hermes/claude-code 实际用宿主机当前用户凭证跑。意味着**所有租户的提示词以同一身份执行**；且提示词原文离开 GRI 边界进入本地 CLI（数据驻留/隐私政策需成文）。
4. **审计含委派目标原文**：`tool_runs.args` 落 `{backend, goal…}`——学生学情可能被模型拼进 goal 入审计库。这本身可接受，但**无脱敏/保留期策略**，也无「回放」能力（故意不落 prompt 与可回放是矛盾的两难，需显式选边）。
5. **凭据生命周期半截**：无轮换工具、无 `AGENT_CRED_MASTER_KEY` 的托管说明、轮换后重加密 runbook 缺失（B-1 遗留问）。
6. **对外面无配额/限流**：v1 契约未定义 429/配额头，外部项目可刷 `me/message` 直烧模型额度。

### 2.3 方向

安全不是补丁，是**产品说明书**：把信任边界、数据驻留、委派闸门、审计策略写成对外可见的 SECURITY 一节，缺一项不开「改工作树/开放后端」档。

---

## 三、维度三：可运维性与产品生命周期（成熟度）

### 3.1 现状事实

| 项 | 实况 | 证据 |
|---|---|---|
| 测试门禁 | core 123、api 654、sdk 16 全绿；tsc/eslint 0 | B-2 复验（PASS=41） |
| 对标 | 协议成文 + `scripts/agent-benchmark.sh` 已成脚本（P0） | `docs/AGENT_BENCHMARK_PROTOCOL.md`、`scripts/` |
| 发布面 | `files`/`publishConfig` 声明；**无 registry、无 CI、无 semver/changelog** | `packages/*/package.json` |
| 依赖基线 | 底座唯一依赖 `@modelcontextprotocol/sdk ^1.30.0`（体积由它定，非「712K 小包」） | `packages/agent-core/package.json` |
| 可观测 | 审计表有；**无指标/告警/SLO/运行面板** | `agent.tool_runs` 只是原始表 |
| E2E | 委派活体真跑通过；**v1 契约无带真实鉴权的端到端**（只有 spec 内真 HTTP + 外部 JWT 未验） | B-3c 活体 + B-2 spec |
| 上手 | README 65 行 + 契约文档 144 行；**无 quickstart、无示例项目、无 OpenAPI** | 实测行数 |

### 3.2 考虑不全面的点

1. **「发布」缺一整链**：registry 在哪、谁发、版本怎么定（semver）、breaking 怎么升（v1→v2 契约已说、包版本没说）、下游怎么升——全空白。`example.invalid` 占位提醒我们：**离能 `npm i` 还差一条 CI**。
2. **多实例形态未定**：业务 agent 运行时当前是「GRI 单体服务」。别的项目要么整 fork、要么等插件化后的「运行时镜像/模板」。这与维度一第 5 条同根。
3. **benchmark 未常规化**：脚本已交付但没人周期性跑（协议说 monthly，未挂 scheduler）——参考对象（OpenClaw/Hermes）在动，一次性对标会过期。
4. **SDK 缺产品化细节**：无 retry、无 429 处理语义、无取消外的扩展；`Engines: node>=18` 已声明✅。缺 OpenAPI 导出供多语言客户端。
5. **契约漂移风险**：`AGENT_PUBLIC_CONTRACT.md` 是手写文档，与控制器无自动校验（本次靠人肉 + spec）。

### 3.3 方向

把「发布链 + 运维面 + 常规对标」做成可勾选的工程项，而不是散在会话里的承诺。

---

## 四、调整优化方案（波次重排）

> 原则不变：串行、落卡、harness 派发、助手独立复验后提交、每里程碑用户亲自测试。已并入基线的卡不再重做。

### 4.1 新基线视图

| 波次 | 内容 | 状态/顺序 | 出口判据 |
|---|---|---|---|
| **B 已完成** | B-1 凭据缝、B-3a/b/c 外部 agent、B-2 对外契约+声明发布面 | ✅ 5 commits | 已复验全绿 |
| **W1 E-4 用户自助面** | 用户为自己 `entity=<uid>` 切 api/cli（只能写自己行）；GET「当前生效 + 可用后端」；SDK 方法；v1 补 `subject` 契约参数 | **下一张卡（半天）** | 本人可自助切换且他人行 `is not a function` 403/404；非 cli 行默认关闭语义不变 |
| **W2 插件化（B 的真正主体）** | ① 17 工具 + tutor 技能 → `agent.skill` 插件包；② `tuition/agents` 双 LLM 路径归一（删 `LlmService`，走 `ModelRouter`）；③ `map.explorer` 归属 world 插件；④ 底座消毒（`agent.js:163` persona 参数化、术语 entity 化）；⑤ 运行时薄壳 + 「装插件即造 agent」验证 | **主战役（2-4 卡）** | 底座 grep 零业务词；GRI 教育栈降为插件后 api 测试不降；一个**外来最小插件**（非教育）能被装进运行时跑通 E2E |
| **W3 安全成文+加固** | ① SECURITY/信任边界文档（OS 用户级信任、数据驻留、各后端登录态来源）；② delegate 闸门（敏感操作人审/速率/目标长度）；③ 审计保留期+脱敏策略；④ 主密钥轮换 runbook + 工具 | **W2 后半并行** | 文档即契约：宣称的每条限制都有测试 |
| **W4 发布与运维链** | ① 真实 registry（verdaccio 容器）或 git 依赖兜底的 CI；② semver+changelog+升级策略；③ OpenAPI 导出 + quickstart + 示例项目；④ benchmark 挂周期任务；⑤ v1 限流/429 契约 | **W1/W2 之后** | 干净环境 `npm i @gri/agent-core @gri/agent-sdk` 可用；一次 minor 发布全链跑通 |
| **W5（可选）C 方案** | 项目编排器、运行期贯通、三位架构输出契约 | W2 稳定后评估 | — |

### 4.2 相对原计划的调整点（为什么改）

1. **E-4 从「可选」提为「W1 必做」**：它直接对应用户口径「按配置选择」，且是 W2 插件化前最后的用户面收口——插件化后用户选择的将是「插件+模型+后端」三元组，晚了就要返工。
2. **明确宣判：B 未完成，主体在 W2**。之前用「可发布门槛达成」把半程当终点，是把「可调用」偷换成「可发布」。
3. **W3 与 W2 并行启动文档侧**：安全边界文档先成文（写清楚 OS 用户级信任这个真相），再开放更强的执行档——避免管道能力跑在文档前面。
4. **W4 把「发布」从声明变成工程**：CI + 真 registry；`example.invalid` 占位必须消号。
5. **benchmark 常规化**：一次性对标改为周期任务（可挂 `automations`，月度）。

### 4.3 需要你裁决的三件事

1. **W1 范围确认**：只做后端+SDK（A），还是同时动托管 AI 教师的前端选择面板（B，量大）？
2. **W2 节奏**：插件化是主战役（17 工具 + 双路径），是否按上述 5 子项分 2-4 张卡串行？其中「外来最小插件 E2E」是证明「别人能用」的火线测试，我建议纳入。
3. **W4 发布形态**：verdaccio 容器（内网可控、可演示发布全链）vs git 依赖兜底（零基建）？只影响 CI 写法，不影响契约。

---

## 五、本文的纪律

- 每条判断都已附证据（commit / file:line / grep 实况）；无证据的已标「需裁决」而非断言。
- 本文不替代既有判据文档；分层以 `AGENT_LAYERING.md` 为准，契约以 `AGENT_PUBLIC_CONTRACT.md` 为准。
- 下一张卡（E-4 / W1）按本文 §4.3 裁决后落卡派发；每里程碑交用户实测。
