# @gri/plugin-host

GRI 插件宿主：**manifest-first、能力注册、生命周期钩子、显式装配顺序**。
「一切皆插件」原则（`docs/PLUGIN_ARCHITECTURE.md`）的落地基座——宿主只认清单与契约，不认实现。

## 一句话

**核心保持小而稳；能力在外围以插件插拔。** 装/卸/换实现**不改宿主**。

## 用法

```js
import { PluginHost } from '@gri/plugin-host';

const host = new PluginHost({ context: { tools, store, logger } });
host.register(manifestJson, impl);           // 或 host.registerAll([[m1, i1], ...])
await host.assemble();                        // 按 kind 优先级装配；policy 恒最后

host.resolve('world.scene');                  // → 提供该能力的已激活插件
await host.authorize(ctx, { tool: 'x' });     // 授权闸门（见下）
```

### 从目录装载（宿主启动期，同步）

宿主不必自己 `import` 插件：`loadPlugins({ dir })` 扫 `plugins/<id>/plugin.json` → 载入口 →
注册 → **同步**装配（`assembleSync`），返回 `{ host, tools, diagnostics }`：

```js
import { loadPlugins } from '@gri/plugin-host';

const { tools, diagnostics } = loadPlugins({ dir: resolve(__dirname, '../../../plugins') });
// tools → 交给 AgentCore；diagnostics.errors → 记日志/运维面
```

- **同步**装配（`assembleSync`）：入口须是 CJS 或无顶层 await 的 ESM。确需**异步**生命周期的插件
  请改用 `await host.assemble()`（异步钩子返回 Promise 时，同步装配会拒绝该插件并记
  `ASYNC_LIFECYCLE_UNSUPPORTED`，**绝不半装配**）。
- **不升错（P5）**：目录缺失 / 清单非法 / 入口抛错 / 工具撞名——一律只记入 `diagnostics.errors`
  并跳过该插件，**宿主照常启动**。缺的工具在诊断里可见，绝不静默。
- **确定性**：按目录名排序发现，装配序由 `assemblyOrder` 的 kind 优先级 + 注册序决定。

## 清单（`plugin.json`）

| 字段 | 必填 | 含义 |
|---|---|---|
| `id` | ✅ | 唯一，kebab/dotted 小写；撞名 → 拒绝加载 |
| `kind` | ✅ | 类别，决定装配优先级（见下） |
| `apiVersion` | ✅ | 与宿主不一致 → 拒绝（`INCOMPATIBLE_API_VERSION`） |
| `version` | | 插件自身版本 |
| `entry` / `skill` | | 入口 / SKILL.md 路径（本包不负责 import） |
| `tools` | | 本插件**依赖**的工具名（由 host 解析后提供） |
| `provides` / `requires` | | 声明的能力 / 依赖的能力（能力依赖，非路径依赖） |
| `hooks` | | 订阅的生命周期钩子 |
| `config` | | `{ schema, secretRefs }`——`secretRefs` 只写**引用名**，值走 Secrets |
| `trust` | | 信任边界描述符 `{ boundary, network, filesystem }` |

## 装配顺序与「权限组件后组装」

`DEFAULT_KINDS` 给了优先级；**`policy`（鉴权/授权）优先级 900，恒最后装**：

```
knowledge.content(10) · knowledge.taxonomy(10) → world.scene(20) → agent.skill(30)
  → agent.engine(40) → auth.identity(50)/integration(50) → policy(900，最后)
```

理由：鉴权/授权是**横切关注点**。把它实现为可缺省的策略装饰器、装配清单末位装载后：

- **组件测试免搭权限**：`assemble({ skipKinds: ['policy'] })` 时不装策略插件，`host.authorize()`
  直接放行 → 测其他组件的组装不必每次先造角色/JWT，**提升测试效率**。
- **生产约束（fail-closed，代码闸门）**：生产装配清单**恒含** policy 插件。这不是文档约定——
  生产档必须以 `assemble({ requirePolicy: true })` 装配，任一条件不满足即**拒绝装配**：
  - `POLICY_REQUIRED`：没有未被跳过的 `kind='policy'` 插件（**跑任何生命周期之前**抛出，不半途生效）；
  - `POLICY_NOT_IMPLEMENTED`：有 policy 插件但均未实现 `authorize(ctx, action)`（空壳 policy 不能蒙混）；
  - `POLICY_INACTIVE`：policy 的 `activate` 失败 → 授权闸门不可用 → **回滚本次已激活插件**后抛出（不留半装配状态）。
  `diagnostics().policyAssembled` 可供运维断言之。「后组装」≠「可缺省上线」。
  > 默认 `requirePolicy: false`（放行）只为**测试档**便利；生产装配**必须**显式置真。
  > 同步档同理：`assembleSync({ requirePolicy: true })`（`loadPlugins` 经 `assemble` 选项透传）。

策略插件契约：实现 `authorize(ctx, action) → { allowed: boolean, reason?: string }`。

## 硬约束（红线，承 `PLUGIN_ARCHITECTURE.md`）

- **P1 核心零插件依赖**：宿主只 import 契约，不 import 具体插件。
- **重名拒绝**：插件 id / 工具名撞名 → 拒绝加载 + 诊断（不留孤儿工具）。
- **P5 可卸载**：`uninstall(id)` 后宿主其余功能不退化。
- **P6 AI 可读**：每个插件有机器可读清单 + 人/agent 可读 README。

## 信任边界

manifest 的 `trust` 只作**描述**（如 `boundary: 'in-process'`），不构成本包的强制沙箱。
真正的隔离（进程/容器/OS 用户）由宿主部署决定——见 `docs/EXTERNAL_AGENT_HARNESS.md` §六。

## 测试

```sh
npm test --workspace=@gri/plugin-host
```
