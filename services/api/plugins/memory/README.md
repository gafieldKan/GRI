# memory —— 长期记忆（出厂插件样例）

每生独立 AI 教师的**长期记忆三件套**：`memory.recall` / `memory.remember` / `memory.forget`。
跨会话陪伴的底座：学生说过的偏好、纠正过的错因，下次课还在。

本插件是 W2.3 的**第一个出厂插件**（契约 P-3.1 的「低风险工具显性化」样本），
原先硬编码在 `services/api/src/modules/agent/teaching-tools.ts`。

## 为什么选它当样例

它是当时唯一**不碰 SQL、不碰业务包**的一组工具 —— 只用宿主经工具 `ctx` 注入的 `ctx.memory`
（一个 `@gri/agent-core` 的 `MemoryStore`），因此是「插件只描述能力」这条红线的干净样本：
**没有一行 `edu.*` / 没有一次 `db.query`**，搬出去不需要先做领域端口（W2.1 已把这件事做完，
但这一组本就干净）。

## 清单（`plugin.json`）

| 字段 | 值 | 说明 |
|---|---|---|
| `id` | `memory` | 全局唯一；撞名由宿主拒绝 |
| `kind` | `agent.skill` | 装配优先级 30（见 `@gri/plugin-host` 的 `DEFAULT_KINDS`） |
| `apiVersion` | `1` | 与宿主不一致 → 拒绝加载 |
| `entry` | `./index.js` | 入口（CommonJS） |
| `provides` | `agent.memory` | 声明的能力；宿主 `host.resolve('agent.memory')` 可找到它 |
| `trust` | `in-process` / 无网络 / 无文件系统 | 信任边界**描述**（非沙箱，见 plugin-host README §信任边界） |

## 契约（三条硬约束）

1. **只描述能力**：不 import `@gri/*` 业务模块（只用工具原语 `makeTool`），不读 `apiKey`/`baseUrl`。
2. **工具名全局唯一**：撞名 → 宿主拒绝加载并诊断，不留孤儿工具。
3. **不自行 load 模型/DB**：`ctx.memory` / `ctx.entityId` 由宿主在工具调用时注入。

## 工具

| 工具 | 入参 | 作用 |
|---|---|---|
| `memory.recall` | — | 读回该生已存记忆（最多 20 条），供个性化 |
| `memory.remember` | `key`, `value` | 存一条长期记忆（跨会话） |
| `memory.forget` | `key` | 删一条（过时/记错/学生明确说「忘掉」时用） |

`memory.forget` 另被面板复用（`AgentPanelService.forgetMemory` 按名从工具表取用），
即面板与模型走**同一份**实现 —— 插件化后这条同源性仍成立（见 `agent-plugins.spec.ts`）。

## 卸载 / 停用

把本目录整体移除（或改 `AGENT_PLUGINS_DIR` 指到别处），宿主**照常启动**，
教师少三个记忆工具而已；启动日志按 `diagnostics.errors` 报出缺口，绝不静默（P5）。

## 测试

`services/api` 侧：`npx jest agent-plugins`（装载/原位拼回/P5 降级）。
装载器与宿主语义：`npm test --workspace=@gri/plugin-host`。
