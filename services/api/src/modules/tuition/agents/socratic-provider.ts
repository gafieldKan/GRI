import { agentPlugins } from '../../agent/agent-plugins';
import type { SocraticRender } from './socratic-templates';

/**
 * `socratic.render` 能力装配（W2.4b）—— 从**进程级插件宿主**（`@gri/plugin-host`，与 agent 同一台）
 * 解析该能力实现；宿主只认 `plugin.json`（`provides: ["socratic.render"]`），**不 pin 具体件**。
 *
 * P5：目录缺失 / 清单非法 / 入口抛错 / 未声明该能力 → 返回 `null`（**不抛**），端点据 `null` 报可诊断错误，
 * 宿主照常启动（「卸一插件不退化」）。
 */
export const SOCRATIC_RENDER = 'SOCRATIC_RENDER';

export function resolveSocraticRender(): SocraticRender | null {
  try {
    const entries = agentPlugins().host?.resolve('socratic.render');
    const impl = entries?.[0]?.impl as unknown as SocraticRender | undefined;
    return impl && typeof impl.render === 'function' ? impl : null;
  } catch {
    return null;
  }
}
