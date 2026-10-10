import {
  TeachingCardFsm,
  TeachingCardState,
  IllegalCardTransitionError,
  initialCardState,
} from './teaching-card-fsm';

/**
 * 教学卡片状态机单测（P2-T6）。
 * 覆盖：初态、五态全路径、三条 Guard（Hint 上限 / Scaffold 前置 / Solution 直达）、
 * 非法转移抛错、自转移、NEXT_QUESTION 重置、转移表真值表。
 */

const fsm = new TeachingCardFsm();

function st(over: Partial<TeachingCardState> = {}): TeachingCardState {
  return { ...initialCardState(), ...over };
}

describe('TeachingCardFsm —— 初态与转移表', () => {
  it('初态恒为 Question，且转移表覆盖五态', () => {
    expect(initialCardState()).toEqual({ stage: 'Question', hintCount: 0, attemptCount: 0 });
    expect(TeachingCardFsm.INITIAL).toBe('Question');
    expect(Object.keys(TeachingCardFsm.TRANSITIONS).sort()).toEqual(
      ['Hint', 'Question', 'Reflection', 'Scaffold', 'Solution'].sort(),
    );
  });

  it('can() 真值表：表内为真、出表为假', () => {
    expect(fsm.can('Question', 'Hint')).toBe(true);
    expect(fsm.can('Question', 'Solution')).toBe(true); // Guard3：ASK_SOLUTION 可直达
    expect(fsm.can('Reflection', 'Solution')).toBe(false); // 已反思不再回退要答案
    expect(fsm.can('Solution', 'Hint')).toBe(false);
    expect(fsm.can('Scaffold', 'Question')).toBe(false);
  });
});

describe('TeachingCardFsm —— 提示路径与 Hint 上限 Guard', () => {
  it('ASK_HINT：Question → Hint，hintCount 递增', () => {
    let s = st();
    s = fsm.transition(s, 'ASK_HINT');
    expect(s).toMatchObject({ stage: 'Hint', hintCount: 1 });
    s = fsm.transition(s, 'ASK_HINT');
    expect(s).toMatchObject({ stage: 'Hint', hintCount: 2 });
  });

  it('第 3 次 ASK_HINT（已尝试过）被强制落到 Scaffold（Guard1 上限）', () => {
    let s = st();
    s = fsm.transition(s, 'ATTEMPT_ANSWER', { correct: false }); // 先尝试 → Hint, attemptCount=1
    expect(s.attemptCount).toBe(1);
    s = fsm.transition(s, 'ASK_HINT'); // hint #1
    s = fsm.transition(s, 'ASK_HINT'); // hint #2（达上限）
    expect(s.hintCount).toBe(2);
    s = fsm.transition(s, 'ASK_HINT'); // 超限 → 强制 Scaffold
    expect(s.stage).toBe('Scaffold');
    expect(s.hintCount).toBe(2); // 不再发第 3 条提示
  });

  it('Guard2：未尝试作答即被强制 Scaffold → 抛 IllegalCardTransitionError', () => {
    let s = st();
    s = fsm.transition(s, 'ASK_HINT');
    s = fsm.transition(s, 'ASK_HINT'); // hintCount=2，仍为 Question 但 attemptCount=0
    expect(s.attemptCount).toBe(0);
    expect(() => fsm.transition(s, 'ASK_HINT')).toThrow(IllegalCardTransitionError);
  });
});

describe('TeachingCardFsm —— 作答路径', () => {
  it('ATTEMPT_ANSWER 正确 → Reflection（attemptCount 累加）', () => {
    const s = fsm.transition(st(), 'ATTEMPT_ANSWER', { correct: true });
    expect(s).toMatchObject({ stage: 'Reflection', attemptCount: 1 });
  });

  it('ATTEMPT_ANSWER 错误 → Hint（给出提示）', () => {
    const s = fsm.transition(st(), 'ATTEMPT_ANSWER', { correct: false });
    expect(s).toMatchObject({ stage: 'Hint', attemptCount: 1, hintCount: 1 });
  });

  it('答错且已达 Hint 上限 → Scaffold（跳过第 3 条提示）', () => {
    let s = st();
    s = fsm.transition(s, 'ASK_HINT');
    s = fsm.transition(s, 'ASK_HINT'); // hintCount=2
    s = fsm.transition(s, 'ATTEMPT_ANSWER', { correct: false }); // attemptCount=1 → Scaffold
    expect(s).toMatchObject({ stage: 'Scaffold', attemptCount: 1 });
  });
});

describe('TeachingCardFsm —— Solution 直达与非法转移', () => {
  it('Guard3：ASK_SOLUTION 由 Question 直达 Solution', () => {
    const s = fsm.transition(st(), 'ASK_SOLUTION');
    expect(s.stage).toBe('Solution');
  });

  it('GIVE_UP 直接给答案 → Solution', () => {
    const s = fsm.transition(st(), 'GIVE_UP');
    expect(s.stage).toBe('Solution');
  });

  it('非法转移：Reflection 态再要答案 → 抛 IllegalCardTransitionError', () => {
    const s = fsm.transition(st(), 'ATTEMPT_ANSWER', { correct: true }); // Reflection
    expect(() => fsm.transition(s, 'ASK_SOLUTION')).toThrow(IllegalCardTransitionError);
  });

  it('非法转移：Solution 态回退要提示 → 抛 IllegalCardTransitionError', () => {
    const s = fsm.transition(st(), 'ASK_SOLUTION'); // Solution
    expect(() => fsm.transition(s, 'ASK_HINT')).toThrow(IllegalCardTransitionError);
  });
});

describe('TeachingCardFsm —— 自转移与重置', () => {
  it('ASK_CLARIFICATION / OFF_TOPIC 为自转移，不改态也不改计数', () => {
    const s0 = st({ hintCount: 1, attemptCount: 1 });
    expect(fsm.transition(s0, 'ASK_CLARIFICATION').stage).toBe('Question');
    const off = fsm.transition(s0, 'OFF_TOPIC');
    expect(off).toMatchObject({ stage: 'Question', hintCount: 1, attemptCount: 1 });
  });

  it('NEXT_QUESTION 由 Reflection → Question 并重置计数', () => {
    const s = fsm.transition(st(), 'ATTEMPT_ANSWER', { correct: true }); // Reflection, attemptCount=1
    const next = fsm.transition(s, 'NEXT_QUESTION');
    expect(next).toEqual({ stage: 'Question', hintCount: 0, attemptCount: 0 });
  });

  it('advance() 返回新态 + 可交付前端的 update', () => {
    const { state, update } = fsm.advance(st(), 'ASK_SOLUTION');
    expect(state.stage).toBe('Solution');
    expect(update).toMatchObject({ stage: 'Solution', intent: 'ASK_SOLUTION' });
  });
});
