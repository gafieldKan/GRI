# P-3 契约：`agent.skill` 插件面

> 目的：把 `modules/agent` 硬编码的 17 个教学工具 + `tuition/agents` 的确定性零件，**归一到插件契约**；并把双 LLM 路径归一。
> 依据：`docs/AGENT_LAYERING.md` 五判据；对标 OpenClaw `defineToolPlugin`（`docs/plugins/tool-plugins.md`）。

---

## 一、契约形状（对标 OpenClaw `defineToolPlugin`，取必需子集）

```js
// plugins/<id>/plugin.json   —— manifest-first（agent 可读清单，不读源码）
{
  "id": "tutor-math",                    // 唯一，小写短横线
  "name": "数学辅导技能",
  "kind": "agent.skill",                 // 插件类（见 PLUGIN_ARCHITECTURE.md 6 类）
  "description": "初中数学：学情诊断→讲解→练习的点拨策略",
  "entry": "./index.js",
  "skill": "./SKILL.md",                 // 正文并入 system prompt
  "tools": ["question.lookup", "answer.grade"],  // 依赖的工具名（由 host 解析后注册）
  "capabilities": { "subjects": ["math"], "grades": [7,8,9] },
  "config": { "schema": "./config.schema.json", "secretRefs": [] }
}
```

```js
// plugins/<id>/index.js —— 只导出工具定义，不自行 load 模型/DB
import { makeTool } from '@gri/agent-core';
export default {
  tools: ({ host }) => [
    makeTool({
      name: 'quiz.drill',
      description: '按掌握度缺口出练习',
      inputSchema: { type:'object', properties:{ kp:{type:'string'} }, required:['kp'] },
      category: 'teaching',
      // host 注入：宿主能力（LLM/DB/记忆），插件不碰 apiKey
      execute: async (ctx, args) => host.tools.call('question.lookup', { kp: args.kp })
    })
  ]
};
```

**三条硬约束**：
1. 插件**只描述能力**，不 import `@gri/*` 业务模块，不读 `apiKey`/`baseUrl`（→ 由 host 注入）。
2. 工具名全局唯一；撞名 → **拒绝加载并诊断**（对标 OpenClaw 重名拒绝）。
3. `config.secretRefs` 只写**引用名**，值走 Secrets。

---

## 二、`tuition/agents` 零件 → 插件化映射表

| 现文件 | 性质 | 插件化后 |
|---|---|---|
| `session-fsm` / `teaching-card-fsm` | 会话状态机 | `agent.skill` 插件，导出**会话策略**（hook: `onTurn`） |
| `intent-classifier` | 意图分类 | `agent.skill` 插件，导出 `intent.classify` 工具或路由 hook |
| `variant-generator` / `question-generator` | 出题器 | `agent.skill` 插件，导出 `question.variant` 工具 |
| `question-parser` | 题干解析 | 同上，`question.parse` 工具 |
| `spaced-repetition.service` | 复习排序 | ✅ 已是算法，包成 `review.sequence`（**已被 agent 工具调用**，只需迁出） |
| `socratic-templates` | 话术模板 | 并入 skill `SKILL.md` 正文（不是工具） |
| `exam-scanner` / `ocr-processor` | 多模态入口 | `integration` 插件（外部能力），非 agent.skill |
| `tutor-agent` / `tutor-session-agent` / `ai-agent.service` | 旧编排 | **废弃**，能力已被 `AgentCore` + 教学技能覆盖 |
| `llm.service` | 重复 LLM | **删除**（→ V1 归一） |

---

## 三、双 LLM 路径归一（V1）

| 现路径 | 使用者 | 处置 |
|---|---|---|
| `@gri/agent-core.LlmClient` | `agent.service`（判题）、`taxonomy/command.service` | **保留为唯一路径** |
| `tuition/agents/LlmService` | tutor-agent、variant-generator、question-parser 等 | **删除**，调用点改注入底座 `ModelRouter` |

**验证**：归一后 `grep -rn "LlmService" services/api/src` 仅剩 0 处（除已迁文件的历史注释）。**✅ 已达成（W2.4a，commit 417fef5）—— `grep = 0`。**

---

## 四、P-3 波次拆分（串行，作者不自验）

| 步 | 内容 | 验收 |
|---|---|---|
| P-3.0 | 落 `packages/plugin-host` 最小契约（`manifest` 解析 + `ToolRegistry` 装配 + 重名拒绝） | 单测：撞名拒绝、正常装载 |
| P-3.1 | 把 `agent.service` 的 17 工具中**1 个低风险工具**（如 `memory.*`）显性化为插件样例 | 端到端：agent 仍能 `memory.remember/recall` |
| P-3.2 | `tuition` 零件按上表迁移（先 `spaced-repetition`、`intent-classifier`） | 行为等价（旧测试迁移后仍绿） |
| P-3.3 | 双 LLM 归一 | `LlmService` 引用清零 |
| P-3.4 | 弃用旧编排（`tutor-agent` 等） | 引用清零 + 构建通过 |

**纪律**：每步独立提交、独立复验；不 commit 前先给用户看；子代理不 push。

---

## 五、裁决（已定 —— 承用户「按你的推荐执行」，作者代为裁决）

1. **P-3 顺序**：**先契约、后样例 —— 二者俱已落地，此问不再开放**。P-3.0（最小契约）落于 W2.3a/b（`packages/plugin-host`）；P-3.1（首个可见样例）落于 W2.3c（`plugins/memory` 出厂 `memory.*` 插件）。后续按 P-3.2（`tuition` 零件迁移）推进。
2. **旧编排（`tutor-agent` / `ai-agent.service`）**：**保留**（不删、不标 deprecated）。核对：`tuition.service.analyzeExam → ai-agent.service.pipeline → tutor-agent.analyzeExam → question-generator/plan-agent` 是**在役**链路（试卷→学情→练习→计划），非死代码——上表「废弃」为**过时设想**。
3. **`plugin.json` 正式 schema 基线**：**是** —— `@gri/plugin-host` 的 `parseManifest`（`packages/plugin-host/src/manifest.js`）即**权威基线**。字段/必填/默认/校验码由 `parseManifest` + `packages/plugin-host/tests/plugin-host.test.js` 锁定（缺 id/kind、未知 kind、`apiVersion` 不兼容、id 非法、数组字段规范化、trust/config 缺省…）；kind 闭集与装配序见 `DEFAULT_KINDS`。**P-1 / P-2 / P-4 一律共用本基线**，不再各立一份 manifest 方言。
