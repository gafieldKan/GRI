import { agentPlugins } from '../../agent/agent-plugins';
import type { CardStrategy } from './teaching-card-fsm';

/**
 * `card.strategy` 能力装配（W2.4b）—— 从**进程级插件宿主**（`@gri/plugin-host`，与 agent 同一台）
 * 解析该能力实现；宿主只认 `plugin.json`（`provides: ["card.strategy"]`），**不 pin 具体件**。
 *
 * P5：目录缺失 / 清单非法 / 入口抛错 / 未声明该能力 → 返回 `null`（**不抛**），端点据 `null` 报可诊断错误，
 * 宿主照常启动（「卸一插件不退化」）。
 */
export const CARD_STRATEGY = 'CARD_STRATEGY';

export function resolveCardStrategy(): CardStrategy | null {
  try {
    const entries = agentPlugins().host?.resolve('card.strategy');
    const impl = entries?.[0]?.impl as unknown as CardStrategy | undefined;
    return impl && typeof impl.advance === 'function' ? impl : null;
  } catch {
    return null;
  }
}
