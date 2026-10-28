import type { TemplateKey } from './socratic-templates';

// W2.4b：实现已迁为插件 `plugins/socratic` —— 本 spec 即「插件面**等价证明**」：同一批断言（全不变）
// 驱动**插件 impl**。用插件导出的**类**（非单例）→ 每例新实例，避免 register 污染后续用例。
const plugin = require('../../../../plugins/socratic') as {
  SocraticTemplates: new () => {
    render: (k: TemplateKey, c: unknown) => string;
    has: (k: TemplateKey) => boolean;
    size: number;
    register: (k: TemplateKey, fn: (c: any) => string) => unknown;
  };
  MissingTemplateError: new (...a: any[]) => Error;
  MissingTemplateVariableError: new (...a: any[]) => Error;
};
const { SocraticTemplates, MissingTemplateError, MissingTemplateVariableError } = plugin;

/**
 * 苏格拉底模板库单测（P2-T6）。
 * 覆盖：变量插值、缺失变量报错、缺模板报错、精确键覆盖、4×3×3 槽位全覆盖、
 * 动态 TemplateFn、attemptCount=0 非缺失、跨学科回退。
 */

const FULL_CTX = { knowledgePoint: '勾股定理', studentLevel: '初二', attemptCount: 2 };
const TYPES: TemplateKey['type'][] = ['single-choice', 'multiple-choice', 'fill', 'solution'];
const DIFFS: TemplateKey['difficulty'][] = ['easy', 'medium', 'hard'];
const STAGES: TemplateKey['stage'][] = ['hint', 'scaffold', 'solution'];

function key(over: Partial<TemplateKey> = {}): TemplateKey {
  return { subject: 'math', type: 'multiple-choice', difficulty: 'easy', stage: 'hint', ...over };
}

describe('SocraticTemplates —— 插值与报错', () => {
  it('render 完整插值 {knowledgePoint} 与 {attemptCount}（基模板回退链命中）', () => {
    const t = new SocraticTemplates();
    const out = t.render(key(), FULL_CTX);
    expect(out).toContain('勾股定理');
    expect(out).toContain('2'); // attemptCount
    expect(out).not.toContain('{');
  });

  it('缺失变量 {studentLevel} → 抛 MissingTemplateVariableError', () => {
    const t = new SocraticTemplates();
    const scaffoldKey = key({ type: 'multiple-choice', stage: 'scaffold' });
    expect(() => t.render(scaffoldKey, { knowledgePoint: '勾股定理', attemptCount: 1 })).toThrow(
      MissingTemplateVariableError,
    );
    try {
      t.render(scaffoldKey, { knowledgePoint: '勾股定理', attemptCount: 1 });
    } catch (e) {
      expect((e as { variable: string }).variable).toBe('studentLevel');
    }
  });

  it('缺失变量 {knowledgePoint} → 报错指向该变量', () => {
    const t = new SocraticTemplates();
    try {
      t.render(key(), { attemptCount: 1 } as never);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingTemplateVariableError);
      expect((e as { variable: string }).variable).toBe('knowledgePoint');
    }
  });

  it('无任何模板（含回退链）→ 抛 MissingTemplateError', () => {
    const t = new SocraticTemplates();
    const bogus = key({ stage: 'nope' as TemplateKey['stage'] });
    expect(() => t.render(bogus, FULL_CTX)).toThrow(MissingTemplateError);
  });

  it('attemptCount=0 不算缺失（合法值）', () => {
    const t = new SocraticTemplates();
    const out = t.render(key(), { knowledgePoint: '勾股定理', attemptCount: 0 });
    expect(out).toContain('0');
    expect(out).not.toContain('{');
  });
});

describe('SocraticTemplates —— 键覆盖与覆盖写', () => {
  it('槽位全覆盖：{单选/多选/填空/解答} × {easy/medium/hard} × {hint/scaffold/solution}', () => {
    const t = new SocraticTemplates();
    for (const type of TYPES) {
      for (const difficulty of DIFFS) {
        for (const stage of STAGES) {
          const out = t.render(key({ type, difficulty, stage }), FULL_CTX);
          expect(out.length).toBeGreaterThan(0);
          expect(out).not.toContain('{');
        }
      }
    }
  });

  it('精确键覆盖通配键（register 后 has 为真且内容替换）', () => {
    const t = new SocraticTemplates();
    const exact = key({ type: 'fill', difficulty: 'easy', stage: 'hint' });
    expect(t.has(exact)).toBe(false); // 默认只登记了 math|fill|*|hint
    t.register(exact, () => 'X{knowledgePoint}X');
    expect(t.has(exact)).toBe(true);
    expect(t.render(exact, FULL_CTX)).toContain('X勾股定理X');
  });

  it('内置题型特化优先于全局基模板（math|fill|*|hint 命中特化）', () => {
    const t = new SocraticTemplates();
    const out = t.render(key({ type: 'fill', difficulty: 'hard', stage: 'hint' }), FULL_CTX);
    expect(out).toContain('填空题');
    expect(out).toContain('勾股定理');
  });

  it('动态 TemplateFn：函数体可用 ctx 生成模板再统一插值', () => {
    const t = new SocraticTemplates();
    const k = key({ subject: 'physics', type: 'solution', difficulty: 'hard', stage: 'hint' });
    t.register(k, (ctx) => `（${ctx.studentLevel}）关于「{knowledgePoint}」先想想。`);
    const out = t.render(k, FULL_CTX);
    expect(out).toBe('（初二）关于「勾股定理」先想想。');
  });

  it('跨学科回退：未特化的学科落到全局 stage 基模板', () => {
    const t = new SocraticTemplates();
    const out = t.render(key({ subject: 'chemistry', type: 'fill', difficulty: 'medium', stage: 'solution' }), FULL_CTX);
    expect(out).toContain('勾股定理');
    expect(out).not.toContain('{');
  });

  it('size 反映已注册模板数（基模板 3 + 特化 3）', () => {
    const t = new SocraticTemplates();
    expect(t.size).toBe(6);
  });
});
