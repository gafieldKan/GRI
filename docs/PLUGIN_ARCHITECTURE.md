# GRI 插件化架构总则（Plugin-First · 松耦合 · 可插拔）

> 状态：**v1 原则（2026-10-21，用户 gateway-owner 提出「一切皆插件」总方向）** ｜ 作者：总负责人（助手）
> 定位：本项目**长期演进的第一原则**。凡新增可复用能力 / 可被 AI agent 单独定制的能力，**一律先落为插件**，再谈集成。
> 关联：`docs/PLUGIN_TAXONOMY.md`（本原则的落地清单，待随阶段一产出）；`GRI_LIFECYCLE_MANAGEMENT.md`（生命周期，本文件受其约束）。

---

## 0. 一句话

**核心保持小而稳定；能力在外围以插件插拔。** 每一块可复用能力都是一枚**有契约的插件**——宿主只认契约，不认实现；装/卸/换实现**不改宿主**。

---

## 1. 三条设计律（为什么）

| # | 律 | 反例（现状实测） |
|---|---|---|
| **L1** | **依赖倒置**：宿主依赖**抽象（契约）**，实现依赖宿主提供的接口。 | 现在 `world.vue` 直接把画法几何写进页面（`world-art` 只被 3 处引用，几何与页面耦合）；知识灌库靠 `scripts/k12-curriculum/import.mjs` 一个 700 行脚本硬编码六表 upsert。 |
| **L2** | **能力即端口**：插件**声明能力（provides）与依赖（requires）**，运行时按能力装配。 | 现在 3 个前端各自内联 auth/token 处理，虽已引 `@gri/auth-client`（34 处）但边界靠约定、不靠契约。 |
| **L3** | **不改宿主即可扩展**：新增能力 = 新增插件目录 + 注册清单，**零侵入**宿主源码。 | 现在新增一个学科 / 一张地图 / 一类知识内容，都要改核心源码或加一次性脚本。 |

> 与已定的**面向对象接口 / 抽象类**一脉相承：**契约 = 抽象类**；**插件 = 实现类**；**注册表 = 依赖注入容器**；**能力（capability）= 接口方法签名**。

---

## 2. 插件模型（统一形态）

每枚插件是一个**自洽目录**，含：

```
plugins/<plugin-id>/
  plugin.json        # 清单：id / kind / version / apiVersion / provides / requires / hooks / enabled
  index.js|ts        # 入口：export default definePlugin({...})
  <实现文件>
  README.md          # 供人 + 供 AI agent 阅读（二次定制入口）
```

### 2.1 清单字段（`plugin.json`）

| 字段 | 含义 |
|---|---|
| `id` | 稳定唯一标识（`kebab.case`，如 `world.map.k12-stair`） |
| `kind` | 插件类别（见 §3）——**决定由谁装载** |
| `apiVersion` | 该类别契约的语义版本；宿主按 `apiVersion` 拒绝不兼容插件 |
| `provides` | 声明的能力（capability）列表——宿主据此装配 |
| `requires` | 依赖的宿主能力 / 其他插件能力（**能力依赖，非模块路径依赖**） |
| `hooks` | 订阅的生命周期钩子（见 §2.3） |
| `config` | 默认配置（可被用户/agent 覆盖，**不改代码**） |

### 2.2 契约（示例：接口即抽象类）

```js
// 契约（宿主定义，永不变；插件只实现它）
export class KnowledgeContentProvider {   // 抽象类
  static id = ''; static apiVersion = '1'
  async fetch(ctx) { throw new Error('not implemented') }   // → 候选内容
  async validate(items, ctx) { throw new Error('not implemented') } // → 合规校验
  async upsert(items, ctx) { throw new Error('not implemented') }  // → 幂等落库
}

export class MapSceneRenderer {           // 抽象类
  static id = ''; static apiVersion = '1'
  supports(scene) { return false }        // 声明能画哪些场景
  render(scene, box) { return [] }        // → 几何原语（零色值）
}
```

### 2.3 生命周期钩子（宿主广播，插件订阅）

`install → activate → (data/event…) → deactivate → uninstall`。数据类插件只实现 `upsert`；表现类插件只实现 `render`；AI 类插件额外实现 `toolSpec()`（供 agent 注册为工具）。

---

## 3. 插件类别（按本项目真实业务面切分）

| kind | 载体 | 契约（抽象） | 用户二次定制示例 | 现状起点 |
|---|---|---|---|---|
| `world.scene` | 地图/世界**画法** | `MapSceneRenderer` | 换一座城的美术风格、加一个维度场景 | `packages/world-art/src/art.js`（**已经是事实上的插件**，只差清单与注册） |
| `knowledge.content` | **知识内容补充** | `KnowledgeContentProvider` | 新增一个学科 / 一批 KP / 一套题库 | `scripts/k12-curriculum/import.mjs`（须拆成 provider） |
| `knowledge.taxonomy` | 分类/维度 | `TaxonomyDimensionProvider` | 加一个行业/地区分类轴 | `scripts/reference-data/import.mjs` + `packages/ontology` |
| `agent.skill` | **AI agent 定制** | `AgentSkill` | 一个学科的自定义辅导策略、一类题的解算 | `packages/agent-core/src/skill.js` + `tool-registry.js`（**已有骨架**） |
| `auth.identity` | 身份/鉴权 | `AuthProvider` | 换 SSO / 加一种登录 | `packages/auth-client` + `jwt-verifier` |
| `integration` | 外部集成 | `IntegrationAdapter` | 接一个新题库/新 LLM | 散落在 `services/api/modules/*` |

> **本体（ontology）是元插件层**：它本身即「用 DSL 描述领域 → codegen 生成迁移」的插件生成器。所有 `knowledge.*` 插件最终**遵本体契约**产出，保证「单一真源」。

---

## 4. 装配与发现（宿主侧）

1. **注册表**：宿主启动时扫 `plugins/*/plugin.json` + 代码内注册清单，建**能力索引**（`capability → [plugin]`）。
2. **按能力装配**：宿主只写 `container.resolve('world.scene')`、`container.resolve('knowledge.content')`，**不 pin 具体实现**。
3. **多实现共存**：同 kind 多插件按 `provides` 匹配（如多个 `world.scene` 负责不同 `scene.kind`）。
4. **AI 友好**：每个 `plugin.json` + `README.md` 是 agent 的**定制入口**——agent 读清单即可「装一个插件、改一份 config」，无需读宿主源码。

---

## 5. 硬约束（红线）

| # | 约束 |
|---|---|
| P1 | **核心零插件依赖**：宿主 `packages/` 与 `services/api` 核心**不得 import 具体插件**，只 import 契约。 |
| P2 | **契约向后兼容**：契约变更走 `apiVersion` 升版 + 适配层，**不得**直接改契约签名。 |
| P3 | **零裸色 / 一份画法**（沿用）：`world.scene` 插件只产几何，颜色走 `--world-*` 令牌。 |
| P4 | **单一真源**（沿用）：`knowledge.*` 插件必须幂等、以 `code` 为锚，产出遵本体。 |
| P5 | **可卸载**：任一插件卸载后，宿主**其余功能不退化**。 |
| P6 | **AI 可读**：每个插件有机器可读清单 + 人/agent 可读 README。 |

---

## 6. 存量迁移路线（不推倒重来）

> **原则：既有的 `packages/*` 已是「隐性插件」，本原则做的是「显性化 + 注册化 + 补清单」，不是重写。**

| 阶段 | 做什么 | 交付 |
|---|---|---|
| **P-0** | 定契约与注册表（本文件的 §2/§4 落为代码骨架） | `packages/plugin-host`（契约 + registry，无具体实现） |
| **P-1** | 把 `world-art` 显性化为 `world.scene` 插件（补 `plugin.json`，接 registry；**画法零改动**） | 世界渲染走插件装配 |

> **进度（2026-10-27）**：`packages/world-art/plugin.json`（kind `world.scene`，`provides: ["world.scene"]`）已落，并经 `@gri/plugin-host` 的 schema 基线（`parseManifest`）校验、在 `CapabilityRegistry` 中解析为 `world.scene` 提供者（`packages/plugin-host/tests/world-scene-manifest.test.js`）。**`art.js` 零改动**（画法未动）。**余步**：前端消费侧由「vite 别名直引 `@gri/world-art`」改为「解析 `world.scene` 能力」——须先有**前端侧**能力注册表（属 Track F 范畴，未做）。
| **P-2** | 把 `k12-curriculum/import.mjs` / `reference-data/import.mjs` 重构为 `knowledge.content` / `knowledge.taxonomy` provider | 新增学科 = 加插件目录 |
| **P-3** | 把 `agent-core/skill + tool-registry` 显性化为 `agent.skill` 插件面 | AI 定制 = 加插件 |
| **P-4** | `auth-client` 归一为 `auth.identity` 插件（三前端统一装配） | 消灭内联 auth 样板 |

**验收（每阶段）**：宿主不 import 具体插件（P1）；卸载插件其余不退化（P5）；真实浏览器 `pageerror=0`；`build:h5` 通过。

---

## 7. 与「项目瘦身」的关系

插件化与瘦身是**同一件事的两面**：瘦身把**死代码 / 冗余数据 / 一次性脚本**清出主干；插件化把**活的能力**从主干**请到外围**。
—> 清理执行见 `docs/PROJECT_SLIMMING_PLAN.md`（含实测数据与风险门禁）。
