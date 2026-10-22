# AI 贯通产品化：方案选择（三选一）

> 需求回顾：**① 把 AI 底座与业务 agent 做成独立产品，可被其他项目/程序直接调用；② 业务 agent 支持"每个用户单独配大模型 + api key"，且这是底座提供的能力；③ 加一个应用 agent（代码开发 agent），由业务 agent 设计→发提示词→应用 agent 基于项目原则与底线实现；④ 核心目的：AI 贯穿项目全周期（设计期 + 运行期）。**
> 本文只做**方案与利弊**，供裁决；裁决后另落实施卡。
> 依据：`docs/AGENT_LAYERING.md`（分层判据）、`docs/EXTERNAL_AGENT_HARNESS.md`（外部 agent 契约）。

---

## 〇、先看清事实（本会话实读，非注释）

| # | 事实 | 证据（file:line） | 含义 |
|---|---|---|---|
| F1 | 底座**已是独立包**但未产品化 | `packages/agent-core/package.json`：`name:@gri/agent-core`、`version:0.1.0`、`main:src/index.js`、**无 `private`、无 `files`、无 `publishConfig`** | 能发，但缺发布面 |
| F2 | **仓库整体 `private:true`，今天什么都没发布** | 根 `package.json`：`gri-monorepo`、`private:True`、workspaces `apps/* services/* packages/*` | 无任何发布记录 |
| F3 | 业务 agent 有**稳定调用面** | `agent.controller.ts:12 @Controller('agent')`；`POST /api/agent/message`（:92）、`GET /api/agent/me`（:27）… | 外部可 POST 调用 |
| F4 | **路由已支持每用户**，但表**无 key 列** | `009_agent.sql:50 CREATE TABLE agent.llm_routes`（route_key/provider/model/multimodal_model/base_url/enabled）**无 api_key**；`model-router.js:9` routeKey 约定含 `entity=<entityId>` | 路由缝已在，**密钥存储缝缺失** |
| F5 | **无任何密钥库表** | `grep CREATE TABLE.*(secret\|vault\|keystore\|credential) migrate/*.sql` → 空 | 需新建 |
| F6 | 无流式对外面 | agent 模块无 `@Sse`/websocket | 长任务只能轮询 |
| F7 | 迁移号到 `031` | `migrate/031_knowledge_branch.sql` | 下一个 `032` |
| F8 | 外部 agent CLI 已就位 | `claude 2.1.251`、`codex 0.162.1`；契约见 `EXTERNAL_AGENT_HARNESS.md` | 应用 agent 有轮子 |
| F9 | 底座被本仓 4 处消费 | `agent.service.ts`、`taxonomy/command.service.ts`、`tuition/agents/llm.service.ts`（+spec） | 拆包影响面小 |

**四道产品缺口**（`AGENT_LAYERING.md` 未回答的）：① 发布边界（F1/F2）；② 外部入口（F3）；③ 每租户配置存储（F4/F5，**是存储+隔离缺口，不是路由缺口**）；④ 二阶 agent（F8 有轮子，但未接）。

**三层产品定位（先固定名词，后面对齐）**：

| 层 | 名字 | 职责 | 对外？ |
|---|---|---|---|
| 底座 | **Base/Engine Agent** | 推理环 + 模型/凭据路由 + 工具/技能/记忆端口 | ✅ 产品 |
| 业务 | **Business Agent** | 领域工具/技能；把用户需求 → 解决方案蓝图 → 开发提示词 | ✅ 产品 |
| 应用 | **Application Agent** | CLI 驱动工人；按提示词 + 项目原则 → 应用/技术/数据/安全架构实现 | ❌ 内部 |

**交接链（三种方案共用）**：
```
用户需求 →[业务 agent 设计]→ 提示词 →[应用 agent 执行]→ 架构/代码
                ↑                                   ↑
            调用底座能力                        调用本地 claude/codex
```

---

## 一、方案 A：**同仓封口**（最小产品化）

**做法**：留在 monorepo，只"封口"——不行搬迁。

1. 底座：`packages/agent-core` 补 `files`/`exports`/`publishConfig`，发到**私有 registry**（或直接从 git 安装）。
2. 业务 agent：把 `POST /api/agent/message` 固化为**版本化公开契约**（`/api/v1/agent/*`），出 `@gri/agent-sdk`（薄 HTTP 客户端）供外部项目调。
3. 凭据：新增 `032_agent_credentials.sql`（加密存储）+ 底座 `CredentialStore` 端口；`ModelRouter.resolve` 合并 key。
4. 应用 agent：落 `CliBackendRegistry` + `agent.delegate`，先做只读。

| | |
|---|---|
| **利** | 周期最短（1–2 波）；不动现有构建/部署；凭据缝与应用 agent 独立可插；风险最低 |
| **弊** | "独立产品"成色**最弱**——外部项目仍要连 GRI 的库/registry；业务 agent 仍是**教育专用**，别人只能整体 fork；底座与业务仍同仓生命周期 |
| **效果** | 别的项目能**调用**，但不等于能**用**（拿不去、配不了自己的领域插件） |

---

## 二、方案 B：**引擎独立 + 业务 agent 模板化**（推荐基线）

**做法**：A 的全部 + 把"独立"坐实。

1. 底座：`@gri/agent-core` **抽为独立仓库/包**（自有 CI、语义化版本、独立测试），GRI 降为**下游消费者**（依赖版本号）。
2. 业务 agent：**重构成通用"业务 agent 运行时"**——把教育工具/技能降为**插件包**（`agent.skill`，见 `AGENT_SKILL_PLUGIN_CONTRACT.md`）。其他项目装自己的插件即可造自己的业务 agent；**GRI 教育栈 = 第一组插件**。
3. 凭据 + 应用 agent：同 A，但凭据端口进**底座**（满足"底座提供这种能力"）。
4. 应用 agent 升级为**可配置**：`plugin.json` 声明用哪个 CLI 后端（claude-code/codex），策略（只读/改工作树）由配置给。

| | |
|---|---|
| **利** | 真正"可被其他项目直接调用/使用"：底座是通用引擎产品，业务 agent 是**可配置产品**（装插件即用）；满足"每用户独立模型/key"由底座承载；应用 agent 可切换本地 CLI；GRI 仍能自用（降为实例） |
| **弊** | 周期中（约 4–6 波）；需拆包 + 拆插件（正是 P-0…P-4）；一度双线维护（迁移期） |
| **效果** | 对外两个**真产品**（引擎 + 业务 agent 运行时），GRI 是第一个租户；AI 贯通"设计期"成立（业务→应用 agent 链打通） |

---

## 三、方案 C：**双产品线 + 全周期平台**（完整愿景，最重）

**做法**：B 的全部 + 把"运行期贯通"也平台化。

1. 底座 + 业务 agent 运行时 = 两产品（同 B）。
2. **再加一层"项目编排器"**：把业务 agent→应用 agent 的交接做成**持久化流水线**（需求→蓝图→提示词→代码→验收→回归），带状态机、审计、人工闸门（对应你"里程碑后亲自测试"）。
3. 运行期贯通：业务 agent 在**运行期**也能驱动应用 agent 改/扩功能（不只是设计期）。
4. 三位架构（应用/技术/数据/安全）做成**应用 agent 的强制输出契约**（schema 校验，缺项不通过）。

| | |
|---|---|
| **利** | 完整实现"AI 贯穿项目实施周期 + 运行周期"；交接可审计、可回放；架构四视图强制 |
| **弊** | 周期最长（8+ 波）；编排器本身是**新产品**，需自建状态机/存储/闸门；过早平台化风险（协议未稳先建流水线） |
| **效果** | 最强愿景，但**依赖 B 先成**——没 B 的稳定契约，C 的流水线是在沙上盖楼 |

---

## 四、三方案对比（一表定夺）

| 维度 | A 同仓封口 | **B 引擎独立+业务模板化** | C 双产品+全周期平台 |
|---|---|---|---|
| 底座是否独立产品 | 半（同仓发） | ✅ 真 | ✅ 真 |
| 业务 agent 是否可被他人**用** | ❌ 仅能调 GRI 的 | ✅ 装插件即用 | ✅ |
| 每用户模型/key（底座能力） | ✅ | ✅ | ✅ |
| 应用 agent | 有（只读起步） | ✅ 可配置 | ✅ +运行期 |
| 设计期贯通 | 部分 | ✅ | ✅ |
| **运行期**贯通 | ❌ | 部分 | ✅ |
| 周期（波） | 1–2 | 4–6 | 8+ |
| 风险 | 低 | 中 | 高 |
| 是否可逆 | 高 | 中 | 低 |

---

## 五、我的建议（及理由）

**推荐：先 B，B 落地后再评估是否上 C。**

理由：
1. 你的三个硬需求（独立产品 / 每用户 key / 应用 agent）**全在 B 内闭环**，C 只是把 B 的交接"持久化+运行期"，属**增量**而非前置。
2. C 的编排器需要 B 的稳定契约作地基（否则协议一改，流水线全废）——**B 是 C 的必要前置**。
3. A 满足不了"别人能用"——业务 agent 仍教育专用，会逼所有外部项目 fork。
4. 我在 `AGENT_SKILL_PLUGIN_CONTRACT.md` 已把"业务能力→插件"的迁移表写好，B 的路径**已经铺好**，额外成本低于看起来。

**B 的首批三卡（裁决后即派）**：
- **B-1 凭据缝**：`032_agent_credentials.sql`（加密存储、按 routeKey/tenant 隔离、永不回明文）+ 底座 `CredentialStore` 端口 + `ModelRouter` 合并 key。
- **B-2 对外契约**：`/api/v1/agent/*` 版本化 + `@gri/agent-sdk` + 发布配置（`files`/`publishConfig`）。
- **B-3 应用 agent**：`CliBackendRegistry` + `agent.delegate`（先只读，claude-code/codex 可配）。

---

## 六、待你裁决

1. **选哪个方案**：A / **B（我荐）** / C？还是"A 先试水、再决定 B"？
2. **底座发布去向**：私有 registry / 公开 npm / 仅 git 依赖？
3. **业务 agent 运行时的形态**：独立 NPM 包 / 独立服务镜像 / 两者都要？
4. **应用 agent 权限档**（承接上一轮）：只读 / 改工作树 / 沙箱内跑命令？
5. 若选 B/C：**实施顺序**是否按我列的 B-1→B-2→B-3？

---

## 七、裁决记录（2026-10-22，架构师）

用户口径：**"需要我裁决的按最优建议执行即可；最终目标=按产品能发布。除应用 agent 可接本地 claude code/codex 外，业务 agent 也要能接本地 openclaw/hermes，是否使用由用户按配置选择。"**

据此裁决：

1. **方案**：**B**（引擎独立 + 业务 agent 模板化）；C 作为 B 之后增量。
2. **底座发布去向**（B-2 补发布面）：**私有 registry（npmmirror/verdaccio）+ git 依赖兜底**；不推公开 npm（用户已定"暂不发布，仅自用"，故只补发布面把"独立产品"语义坐实，不发远端）。
3. **业务 agent 运行时形态**：**独立 NPM 包**（薄 HTTP SDK）+ 既有 Nest 服务；镜像可选。
4. **应用 agent 权限档**：**默认全只读**；改工作树仅 E-3 之后、cwd 白名单、可配置。
5. **实施顺序（本裁决微调）**：因用户新增"外部 agent 后端"要求，且 B-2 的 `/api/v1` 版本化宜**最后统一扫**，故顺序改为
   **B-3（外部 agent 后端 E-0..E-4）→ B-2（对外契约 + 发布面）**；
   其中 B-3 再分 **B-3a（registry + 四后端，只读）→ B-3b（`provider='cli'` 路由 + 按用户开关）→ B-3c（`agent.delegate` 委派工具）**。
6. **四后端**：claude-code / codex / openclaw / hermes **全做**；应用 agent 约定用 claude-code/codex，业务 agent 约定用 openclaw/hermes，但**只作配置约定，不写死底座**。
