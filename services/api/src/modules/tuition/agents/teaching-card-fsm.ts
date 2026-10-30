import type { Intent, TeachingCardStage, TeachingCardUpdate } from '../tuition.types';

export type { Intent, TeachingCardStage };

/**
 * 教学卡片策略 —— **类型与能力契约**（W2.4b：实现已迁为插件 `plugins/card-strategy`，本文件只留类型/契约）。
 *
 * 形如「宿主经 `@gri/plugin-host` 解析 `card.strategy` → 得实现」—— 消费者只依赖本契约面（`CardStrategy`），
 * **不 pin 具体件**。实现见 `services/api/plugins/card-strategy/index.js`（`provides: ["card.strategy"]`）。
 *
 * 跨边界判错：实现抛的错误自带 `name`（'IllegalCardTransitionError'），消费者按 `name` 判
 * （**勿用 `instanceof`** —— 跨插件边界类身份不同）。
 */

/** 卡片运行态（不可变；每次 transition 返回全新对象，无副作用）。 */
export interface TeachingCardState {
  stage: TeachingCardStage;
  hintCount: number;
  attemptCount: number;
}

/** 本次流转的补充信息（仅 `ATTEMPT_ANSWER` 需 `correct`）。 */
export interface CardTransitionContext {
  correct?: boolean;
}

/** 插件错误类名（跨边界判错用 `error.name`）。 */
export const ILLEGAL_CARD_TRANSITION_ERROR = 'IllegalCardTransitionError';

/** 初态：卡片一律起于 `Question`。 */
export function initialCardState(): TeachingCardState {
  return { stage: 'Question', hintCount: 0, attemptCount: 0 };
}

/** `card.strategy` 能力面（插件实现须满足）：卡片态五态流转 + 三条 Guard + 转移表真值表。 */
export interface CardStrategy {
  /** 该转移是否在表内。 */
  can(from: TeachingCardStage, to: TeachingCardStage): boolean;
  /** 推进一次卡片态（不可变）。非法转移 / Guard 不满足 → 抛带 `name` 的错误。 */
  transition(state: TeachingCardState, intent: Intent, ctx?: CardTransitionContext): TeachingCardState;
  /** 便捷：推进并返回「新态 + 可交付前端的更新」。 */
  advance(
    state: TeachingCardState,
    intent: Intent,
    ctx?: CardTransitionContext,
  ): { state: TeachingCardState; update: TeachingCardUpdate };
}

/** `card.strategy` 的**构造面**（静态常量随类，不随实例）——插件导出的类须同时满足。 */
export interface CardStrategyClass {
  new (): CardStrategy;
  /** Hint 上限：达上限后不再给第 3 条提示，强制进入 `Scaffold`（Guard 1）。 */
  readonly MAX_HINTS: number;
  /** 初态（acceptance 硬性：初态 = Question）。 */
  readonly INITIAL: TeachingCardStage;
  /** 5 态转移表（from → 允许到达的 to 集合）。 */
  readonly TRANSITIONS: Record<TeachingCardStage, TeachingCardStage[]>;
}
