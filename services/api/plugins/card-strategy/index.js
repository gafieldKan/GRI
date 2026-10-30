/**
 * card-strategy —— 教学卡片态状态机（W2.4b：自 `modules/tuition/agents/teaching-card-fsm.ts` 迁出）。
 *
 * 内容：`card.strategy` 能力 —— 卡片态五态流转（Question/Hint/Scaffold/Solution/Reflection）、
 * 三条 Guard（Hint 上限 / Scaffold 前置 / Solution 直达）、转移表真值表、`advance` 便捷包。
 * 逻辑**逐字**自原 `TeachingCardFsm` 迁入；改为**自包含**（不 import 任何业务模块，契约 §一红线）。
 *
 * 与原类的对应（逐字，仅去 TS 注解）：
 *   - `MAX_HINTS` / `INITIAL` / `TRANSITIONS` → 同名静态字段（挂单例上，另同名常量导出）
 *   - `can` / `transition` / `advance` → 同名方法
 *   - `initialCardState()` / `IllegalCardTransitionError` → 同名导出
 *
 * 跨边界判错（W2.4b 与 socratic 同一条真等价点）：错误类**自带 `name`**（'IllegalCardTransitionError'）——
 * 消费方（宿主 controller）在**插件边界外**，`instanceof` 因类身份不同会失效，故按 `error.name` 判；
 * 宿主已同步改判。
 *
 * 纯函数、无可变单例状态：`transition` 接收旧态、返回新态（不可变推进）→ 可被并发会话复用（同原设计）。
 */

/** 卡片运行态（不可变；每次 transition 返回全新对象，无副作用）。 */

/** 非法卡片态转移（转移不在表内，或 Guard 不满足）。`name` 供跨边界判错。 */
class IllegalCardTransitionError extends Error {
  constructor(from, to, reason) {
    super(`非法卡片态转移：${from} → ${to}${reason ? `（${reason}）` : ''}`);
    this.name = 'IllegalCardTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** 初态：卡片一律起于 `Question`。 */
function initialCardState() {
  return { stage: 'Question', hintCount: 0, attemptCount: 0 };
}

class TeachingCardFsm {
  /** Hint 上限：达上限后不再给第 3 条提示，强制进入 `Scaffold`（Guard 1）。 */
  static MAX_HINTS = 2;
  /** 初态（acceptance 硬性：初态 = Question）。 */
  static INITIAL = 'Question';

  /**
   * 5 态转移表（from → 允许到达的 to 集合）。自转移（stage → stage）表示
   * `ASK_CLARIFICATION`/`OFF_TOPIC` 等不改态的意图；出表即非法。
   */
  static TRANSITIONS = {
    Question: ['Question', 'Hint', 'Scaffold', 'Solution', 'Reflection'],
    Hint: ['Hint', 'Scaffold', 'Solution', 'Reflection'],
    Scaffold: ['Scaffold', 'Solution', 'Reflection'],
    Solution: ['Solution', 'Reflection', 'Question'],
    Reflection: ['Reflection', 'Question'],
  };

  /** 该转移是否在表内。 */
  can(from, to) {
    return (TeachingCardFsm.TRANSITIONS[from] ?? []).includes(to);
  }

  /** 意图 → 目标态（纯决策，不含 Guard 校验）。 */
  _resolveTarget(state, intent, ctx) {
    switch (intent) {
      case 'ASK_HINT':
        // Guard 1：Hint 超上限 → 强制 Scaffold（不再给提示）
        return state.hintCount >= TeachingCardFsm.MAX_HINTS ? 'Scaffold' : 'Hint';
      case 'ASK_SOLUTION': // Guard 3：ASK_SOLUTION 可直达 Solution（含从 Question 直达）
      case 'GIVE_UP':
        return 'Solution';
      case 'ATTEMPT_ANSWER':
        if (ctx.correct) return 'Reflection';
        return state.hintCount >= TeachingCardFsm.MAX_HINTS ? 'Scaffold' : 'Hint';
      case 'NEXT_QUESTION':
        return 'Question';
      case 'ASK_CLARIFICATION':
      case 'OFF_TOPIC':
        return state.stage; // 自转移：澄清/闲聊不改卡片态
      default:
        return state.stage;
    }
  }

  /**
   * 推进一次卡片态。非法转移 / Guard 不满足 → 抛 `IllegalCardTransitionError`。
   *
   * Guards：
   *   1. `hintCount <= MAX_HINTS`：超限的 ASK_HINT 强制落到 `Scaffold`；
   *   2. 进 `Scaffold` 需先尝试作答（`attemptCount >= 1`）；
   *   3. `Solution` 可由 `ASK_SOLUTION` 直达。
   */
  transition(state, intent, ctx = {}) {
    const next = { ...state };
    if (intent === 'ATTEMPT_ANSWER') next.attemptCount = state.attemptCount + 1;

    const target = this._resolveTarget(state, intent, ctx);

    // Guard 2：进 Scaffold 需先尝试作答过
    if (target === 'Scaffold' && next.attemptCount === 0) {
      throw new IllegalCardTransitionError(
        state.stage,
        target,
        'Scaffold 需先尝试作答（attemptCount≥1）',
      );
    }
    // 转移必须在表内
    if (!this.can(state.stage, target)) {
      throw new IllegalCardTransitionError(state.stage, target, '转移不在转移表中');
    }

    if (target === 'Hint') next.hintCount = state.hintCount + 1;
    if (intent === 'NEXT_QUESTION') {
      next.hintCount = 0;
      next.attemptCount = 0;
    }
    next.stage = target;
    return next;
  }

  /** 便捷：推进并返回「新态 + 可交付前端的更新」。 */
  advance(state, intent, ctx = {}) {
    const next = this.transition(state, intent, ctx);
    return {
      state: next,
      update: {
        stage: next.stage,
        intent,
        hintCount: next.hintCount,
        attemptCount: next.attemptCount,
      },
    };
  }
}

// 单例（与迁移前 Nest provider 的进程级单例同语义）；宿主解析 `card.strategy` 即拿此实例。
module.exports = new TeachingCardFsm();
module.exports.TeachingCardFsm = TeachingCardFsm;
module.exports.IllegalCardTransitionError = IllegalCardTransitionError;
module.exports.initialCardState = initialCardState;
module.exports.MAX_HINTS = TeachingCardFsm.MAX_HINTS;
module.exports.INITIAL = TeachingCardFsm.INITIAL;
module.exports.TRANSITIONS = TeachingCardFsm.TRANSITIONS;
