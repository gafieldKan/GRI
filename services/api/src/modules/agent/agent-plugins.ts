/**
 * 出厂插件装载面（W2.3）—— 宿主把「AI 教师能做什么」的一部分交给**插件**。
 *
 * 为什么单独成件：`teaching-tools.ts` 保持**同步、纯内建**；「从目录发现并装配插件」是宿主的活，
 * 落在这一处缝里，将来换装载位置/加 kind 只动这里。
 *
 * 三条要点：
 * 1. **同步 + memo**：插件的工具定义要在**同步**路径（`_teachingToolDefs()`）里就位，
 *    故走 `loadPlugins` 的同步装配（`assembleSync`）；且是**进程级一次性**资产，不每消息扫盘。
 * 2. **不阻断启动（P5）**：目录缺失 / 清单非法 / 入口抛错 / 撞名 —— 全部只记 `diagnostics.errors`，
 *    宿主照常启动；缺的工具**在诊断里可见**（`onModuleInit` 打日志），绝不静默。
 * 3. **可拔**：把 `plugins/memory` 目录删掉，教师即少三个记忆工具而宿主不崩 —— 这就是「卸一插件不退化」。
 */
import { resolve } from 'node:path';

import { loadPlugins, type LoadPluginsResult } from '@gri/plugin-host';
import { sanitizeToolName } from '@gri/agent-core';

import { HOST_RESERVED_TOOL_NAMES } from './teaching-tools';

/**
 * 出厂插件目录：`AGENT_PLUGINS_DIR` 可覆盖（容器/自定义部署）。
 * 缺省 `../../../plugins` —— `src/modules/agent` 与 `dist/modules/agent` 同深度，故开发与生产同一相对路径。
 */
export function agentPluginsDir(): string {
  return process.env.AGENT_PLUGINS_DIR || resolve(__dirname, '../../../plugins');
}

let cache: LoadPluginsResult | null = null;

/**
 * 进程内一次性装载（memo）。插件是启动期资产：不每消息扫盘、不每 entity 重装。
 *
 * `reservedTools` 传宿主**自有**工具名（`HOST_RESERVED_TOOL_NAMES`）——插件撞名即被拒绝并诊断，
 * 因为宿主工具与插件工具同进一个 ToolRegistry（后写覆盖），不设防就会被**无声顶替**。
 * `nameKey` 传**清洗名**规则（`sanitizeToolName`）——模型看到的 function 名是多对一的
 * （`answer.grade` 与 `answer-grade` 同键），只按原样比，插件就能用清洗名顶替宿主工具。
 */
export function agentPlugins(): LoadPluginsResult {
  if (!cache) {
    cache = loadPlugins({
      dir: agentPluginsDir(),
      reservedTools: HOST_RESERVED_TOOL_NAMES,
      nameKey: sanitizeToolName,
    });
  }
  return cache;
}

/** 测试用：清空 memo（切换 env/目录后重新装载）。 */
export function resetAgentPlugins(): void {
  cache = null;
}
