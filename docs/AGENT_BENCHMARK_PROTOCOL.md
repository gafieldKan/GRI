# AI Agent 对标与更新协议（OpenClaw / Hermes）

> 目的：**定期**用 OpenClaw 与 Hermes 的最新开源实现，更新并完善 GRI 的 AI 底座（`packages/agent-core`）与业务 agent。
> 这是"机制文件"——规定了**对标什么、怎么取源、多久一次、产出什么、谁复验**。

---

## 一、对标对象与取源（实况核对）

| 对象 | 本地是否有源 | 取源方式 | 权威度 |
|---|---|---|---|
| **OpenClaw** | ✅ 有：`~/.npm-global/lib/node_modules/openclaw`（v**2026.10.5**） | `npm view openclaw version` 取最新；源码在 `dist/*.mjs`（打包产物）；**文档在 `docs/`（22M，权威）**；`api.github.com` 可达（`200`）可拉 release/changelog | 文档 + dist 双源 |
| **Hermes** | ✅ **有源码**：`~/refs/hermes-agent`（commit `275c211c`，Python，MIT，255k★，2026-10-21 pushed） | `bash scripts/fetch-references.sh`（浅克隆 depth 1 仅 main，359M **不进 git**） | **完整源码对标** |
| OpenClaw 官方仓库 | ✅ `github.com/openclaw/openclaw`（`api.github.com` 200 可达） | `curl api.github.com` 取 release/changelog | 补充源 |
| Hermes 官方仓库 | ✅ `github.com/NousResearch/hermes-agent`（`git ls-remote` 通） | 同 `fetch-references.sh` | 权威 |

> 🔎 **取源结论（2026-10-22 更新）**：**OpenClaw 与 Hermes 均为完整对标基准**。
> - OpenClaw = 权威 docs(22M) + dist 打包源 + GitHub；本地 v**2026.10.5**。
> - Hermes = 全量 Python 源码（`agent/` 331 文件、`tools/` 292 文件、`acp_adapter/` 22 文件、`agent/transports/` provider 传输层）。
> - 取源脚本：`scripts/fetch-references.sh`（落 `~/refs/`，**不进 git**）。

---

## 二、对标维度（14 项，源自 OpenClaw 能力模型 + 底座六域）

| # | 维度 | OpenClaw 对标锚点 | GRI 现状 |
|---|---|---|---|
| 1 | **推理环** | Agent runtime（`docs/agent-runtime-architecture.md`） | `AgentCore.run()` ✅ |
| 2 | **工具契约** | `defineToolPlugin`（typebox `parameters`/`outputSchema`/`optional`） | `makeTool`（JSON Schema）⚠️ 无 outputSchema/optional |
| 3 | **技能（Skills）** | `SKILL.md` frontmatter + 预览 | `parseSkillMarkdown` ✅（W2.3d：SKILL.md 经插件装载）无预览 |
| 4 | **插件清单** | `openclaw.plugin.json` manifest（15+ 字段、catalog 分类、schema 校验） | ✅ `plugin.json` + `parseManifest`（W2.3a，`packages/plugin-host`；schema 基线见 `AGENT_SKILL_PLUGIN_CONTRACT.md` §五#3） |
| 5 | **能力注册** | `api.registerProvider/Channel/…`（16 类能力） | ✅ `CapabilityRegistry` + `PluginHost`（W2.3a） |
| 6 | **契约与强制** | `OpenClawPluginApi` + 重名拒绝 + 契约测试 | ✅ 撞名拒绝（`parseManifest`/host）+ `assertEnginePortConformance` |
| 7 | **钩子（Hooks）** | tool-call policy / prompt / session / delivery / lifecycle 五类 | ⚠️ host **机制在**（`manifest.hooks` + `impl[name]`，`plugin-host/src/host.js`），**尚无内置 hook 用例** |
| 8 | **记忆** | `memory-lancedb` / `memory-wiki` 插件 | `MemoryStore`（内存+DB）⚠️ 无向量/检索 |
| 9 | **MCP** | MCP 服务桥 | `McpClient/McpPool/bridgeMcpTools` ✅ |
| 10 | **ACP** | SDK entrypoints / harness | `AcpAdapter` ✅ |
| 11 | **模型路由** | provider catalog + 前台切模型 | `ModelRouter` ✅ |
| 12 | **沙箱/信任边界** | 原生插件 **in-process、非沙箱**（明示） | `trust` 描述符（W3：boundary/network/filesystem；**仅解析未强制沙箱**，见 `docs/AGENT_SECURITY.md` §三）⚠️ |
| 13 | **多模态** | 语音/图像/视频生成、媒体理解（16 类能力含） | `multimodalModel`（neva-22b）⚠️ 仅调用 |
| 14 | **观测/审计** | `openclaw doctor` / `plugins inspect` / 兼容信号 | `agent.tool_runs`/`external_runs`/`external_events` 审计 + 保留清理端点（W3）⚠️ 无体检命令 |
| 15 | **外部 agent 后端** | CLI backend（`api.registerCliBackend`）+ Hermes `delegate_tool`/`agent/transports/*`（7 终端后端：local/Docker/SSH/Modal…） | ✅ `CliBackendRegistry` + 四后端（B-3a/b `40ea83c`/`b426070`）+ `agent.delegate` 委派（B-3c `194a72a`）；默认只读 + cwd 白名单 + 父只拿摘要；**隔离弱于对方**（我们 OS 用户级，Hermes 有容器级终端） |

> 每条对标都须落到 **"有/无/弱"** 三级判定，禁止模糊描述。

> **GRI 现状复核 2026-10-28**（P-0/W2.3/W3 后，逐维对回源码）：维度 **4/5/6 由 ❌ → ✅**（`packages/plugin-host`：`parseManifest`/`CapabilityRegistry`/撞名拒绝）；**3** 补 SKILL.md 插件装载；**7** 机制在但无内置 hook 用例（仍 ⚠️）；**12** 有 `trust` 描述符（仅解析未强制，仍 ⚠️）；**14** 补审计保留端点。**2**（`makeTool` 无 `outputSchema`/`optional`）维持 ⚠️ —— 真差距未消。

---

## 三、节奏与动作

| 触发 | 动作 | 产出 |
|---|---|---|
| **每月一次**（或 OpenClaw 发新版） | 跑「对标脚本」→ 填 14 维度表 → 记差距 | `docs/benchmarks/AGENT_BENCHMARK_YYYY-MM.md` |
| 发现**底座级**差距（维度 1/2/4/5/6/7） | 立"底座更新"卡 → Claude 实现 → **我独立复验** | 提交 + 复验报告 |
| 发现**业务级**差距 | 并入 P-3 插件化波次 | P-3 卡 |
| **Hermes 有源码后** | 补跑 Hermes 专列对标 | 同表增列 |

**新增拟建脚本**（P0，只读）：`scripts/agent-benchmark.sh`
- 打印 OpenClaw 版本（本地 + npm 最新）；存在性核对 `docs/`、`dist/plugins`、能力表。
- 输出 GRI 底座导出面（`grep` `packages/agent-core/src/index.js`）。
- 生成 14 维度空表骨架 → 人填判定。

---

## 四、对标纪律（与全局一致）

1. **不采信自述**：差距判定以源码/文档证据为准，不以"注释声称支持"为准。
2. **不盲目追新**：只吸收**能被 `AGENT_LAYERING.md` 五判据接纳**的能力（底座通用 → 底座；否则 → 插件）。
3. **改动必复验**：底座更新的验收 = 我的独立复验脚本 + `build:h5` + 既有 E2E 不回归。
4. **降级声明**：Hermes 无源码期间，涉 Hermes 的结论一律标注"**非源码，仅兼容面/摘要**"。

---

## 五、待用户确认

1. ~~**Hermes 仓库地址**~~ ✅ 已给：`github.com/NousResearch/hermes-agent`，已纳入完整双源对标。
2. **对标节奏**：月度 / 季度 / 仅"OpenClaw 发版时"？
3. **底座更新的授权级别**：发现底座级差距时，是"直接立卡派发"还是"先报你裁决"？

## 六、Hermes 首轮对标要点（2026-10-22 已取源）

| Hermes 能力 | 位置 | 对 GRI 的意义 |
|---|---|---|
| `delegate_tool`（子 agent 委派） | `tools/delegate_tool*.py`（10+ 文件） | **正是"调外部 agent"的同族能力**——见 `EXTERNAL_AGENT_HARNESS.md` |
| `agent/transports/*`（provider 传输层） | `anthropic.py`/`codex.py`/`bedrock.py`/`chat_completions.py` | GRI `LlmClient` 可借鉴其"传输只管格式转换"的单一职责 |
| `acp_adapter/`（把自己暴露为 ACP agent） | 22 文件 | 与 GRI `AcpAdapter` 对标 |
| 插件面 | `tools/` 292 文件、`skills/` 14 | 体量大，按 14 维度逐项比 |
