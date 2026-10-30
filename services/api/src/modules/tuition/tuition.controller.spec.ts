import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { TuitionController } from './tuition.controller';
import { TuitionService } from './tuition.service';
import { initialCardState, ILLEGAL_CARD_TRANSITION_ERROR, type CardStrategy } from './agents/teaching-card-fsm';
import { IntentClassifier } from './agents/intent-classifier';
import type { SocraticRender } from './agents/socratic-templates';
import { ExamScannerAgent } from './agents/exam-scanner';
import { VariantGenerator } from './agents/variant-generator';

// 值导入 teaching-card-fsm / intent-classifier 会传递加载 ESM 包 @gri/agent-core。
jest.mock('@gri/agent-core', () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q }));

/** 插件侧真实错误类（W2.4b：卡片态实现已迁 `plugins/card-strategy`）—— 只在本 spec 造「真抛错」用。 */
const { IllegalCardTransitionError } = require('../../../plugins/card-strategy') as {
  IllegalCardTransitionError: new (from: string, to: string, reason?: string) => Error;
};

function makeController(overrides: {
  classify?: jest.Mock;
  advance?: jest.Mock;
  render?: jest.Mock;
  noSocratic?: boolean;
  noCard?: boolean;
  scanExam?: jest.Mock;
  generate?: jest.Mock;
} = {}) {
  const classifier = {
    classify: overrides.classify ?? jest.fn().mockResolvedValue({ intent: 'ASK_HINT', confidence: 0.7 }),
  } as unknown as IntentClassifier;
  const card = overrides.noCard
    ? null // W2.4b：模拟「宿主未解析到 card.strategy 能力」→ 注入 null
    : ({
        advance: overrides.advance ?? jest.fn().mockReturnValue({
          state: { stage: 'Hint', hintCount: 1, attemptCount: 0 },
          update: { stage: 'Hint', intent: 'ASK_HINT', hintCount: 1, attemptCount: 0 },
        }),
      } as unknown as CardStrategy);
  const templates = overrides.noSocratic
    ? null // W2.4b：模拟「宿主未解析到 socratic.render 能力」→ 注入 null
    : ({ render: overrides.render ?? jest.fn().mockReturnValue('先回忆勾股定理。') } as unknown as SocraticRender);
  const scanner = {
    scanExam: overrides.scanExam ?? jest.fn().mockResolvedValue({
      success: true,
      ocr: { text: '题面', latex: '', blocks: [], rawText: '题面', questions: [] },
      parsedQuestions: [],
    }),
  } as unknown as ExamScannerAgent;
  const variants = {
    generate: overrides.generate ?? jest.fn().mockResolvedValue([]),
  } as unknown as VariantGenerator;

  return new TuitionController(
    {} as TuitionService,
    classifier,
    card,
    templates,
    scanner,
    variants,
  );
}

describe('TuitionController —— T6/T7 最小接线', () => {
  it('五个最小接线端点均显式返回 200', () => {
    const endpoints = [
      ['classifyIntent', 'agent/classify-intent'],
      ['advanceCard', 'agent/card/advance'],
      ['renderSocratic', 'agent/socratic/render'],
      ['scanExam', 'exam/scan'],
      ['generateVariants', 'exam/variants'],
    ] as const;

    for (const [method, path] of endpoints) {
      expect(Reflect.getMetadata(PATH_METADATA, TuitionController.prototype[method])).toBe(path);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, TuitionController.prototype[method])).toBe(200);
    }
  });

  it('classify-intent：缺 input → 400；有效 input 委托 IntentClassifier', async () => {
    const classify = jest.fn().mockResolvedValue({ intent: 'ASK_HINT', confidence: 0.7 });
    const controller = makeController({ classify });

    expect(() => controller.classifyIntent({})).toThrow(BadRequestException);
    await expect(controller.classifyIntent({ input: '给我一点提示' })).resolves.toEqual({
      intent: 'ASK_HINT',
      confidence: 0.7,
    });
    expect(classify).toHaveBeenCalledWith('给我一点提示', {});
  });

  it('card/advance：缺 intent → 400；非法转移 → 400', async () => {
    const advance = jest.fn()
      .mockImplementation(() => {
        throw new IllegalCardTransitionError('Question', 'Scaffold', 'attemptCount=0');
      });
    const controller = makeController({ advance });

    expect(() => controller.advanceCard({})).toThrow(BadRequestException);
    // 同一处断言**同时**锁「抛的是 400 类」与「message 从插件错误逐字透传」——
    // 只断一类会让「400 改 503」的变异逃逸，只断文案会让「文案改成固定串」逃逸。
    let thrown: unknown;
    try {
      controller.advanceCard({ state: initialCardState(), intent: 'ASK_HINT' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toBe('非法卡片态转移：Question → Scaffold（attemptCount=0）');
    expect(advance).toHaveBeenCalledWith(initialCardState(), 'ASK_HINT', {
      correct: undefined,
    });
  });

  it('card/advance：非法转移错按 name 判（name=IllegalCardTransitionError）→ 400（跨插件边界非 instanceof）', () => {
    const advance = jest.fn().mockImplementation(() => {
      const e = new Error('非法卡片态转移：Reflection → Solution（转移不在转移表中）');
      (e as { name: string }).name = ILLEGAL_CARD_TRANSITION_ERROR;
      throw e;
    });
    const controller = makeController({ advance });
    expect(() => controller.advanceCard({
      state: { stage: 'Reflection', hintCount: 0, attemptCount: 1 },
      intent: 'ASK_SOLUTION',
    })).toThrow(BadRequestException);
  });

  it('card/advance：能力未装配（宿主解析为 null）→ 503（P5：不崩，可诊断）', () => {
    const controller = makeController({ noCard: true });
    expect(() => controller.advanceCard({
      state: initialCardState(),
      intent: 'ASK_HINT',
    })).toThrow(ServiceUnavailableException);
  });

  it('socratic/render：缺知识上下文字段 → 400；有效请求返回模板消息', async () => {
    const render = jest.fn().mockReturnValue('关于勾股定理的提示');
    const controller = makeController({ render });

    expect(() => controller.renderSocratic({
      key: { subject: 'math', type: 'single-choice', difficulty: 'easy', stage: 'hint' },
      context: {},
    })).toThrow(BadRequestException);

    expect(controller.renderSocratic({
      key: { subject: 'math', type: 'single-choice', difficulty: 'easy', stage: 'hint' },
      context: { knowledgePoint: '勾股定理' },
    })).toEqual({ message: '关于勾股定理的提示' });
    expect(render).toHaveBeenCalledWith(
      { subject: 'math', type: 'single-choice', difficulty: 'easy', stage: 'hint' },
      { knowledgePoint: '勾股定理' },
    );
  });

  it('socratic/render：模板缺件错（name=MissingTemplateError）→ 400（跨插件边界按 name 判，非 instanceof）', () => {
    const render = jest.fn().mockImplementation(() => {
      const e = new Error('无匹配模板：math/fill/easy/nope');
      (e as { name: string }).name = 'MissingTemplateError';
      throw e;
    });
    const controller = makeController({ render });
    expect(() => controller.renderSocratic({
      key: { subject: 'math', type: 'fill', difficulty: 'easy', stage: 'hint' },
      context: { knowledgePoint: '勾股定理' },
    })).toThrow(BadRequestException);
  });

  it('socratic/render：能力未装配（宿主解析为 null）→ 503（P5：不崩，可诊断）', () => {
    const controller = makeController({ noSocratic: true });
    expect(() => controller.renderSocratic({
      key: { subject: 'math', type: 'fill', difficulty: 'easy', stage: 'hint' },
      context: { knowledgePoint: '勾股定理' },
    })).toThrow(ServiceUnavailableException);
  });

  it('exam/scan：缺 rawText 与 imageDataUrl → 400；rawText 请求委托 ExamScannerAgent', async () => {
    const scanExam = jest.fn().mockResolvedValue({
      success: true,
      ocr: { text: '1. 解方程 2x=4', latex: '', blocks: [], rawText: '1. 解方程 2x=4', questions: [] },
      parsedQuestions: [],
    });
    const controller = makeController({ scanExam });

    expect(() => controller.scanExam({})).toThrow(BadRequestException);
    await expect(controller.scanExam({
      rawText: '1. 解方程 2x=4',
      subject: 'math',
      gradeLevel: '7',
      withVariants: true,
    })).resolves.toMatchObject({ success: true });
    expect(scanExam).toHaveBeenCalledWith({
      imageDataUrl: '',
      rawText: '1. 解方程 2x=4',
      subject: 'math',
      gradeLevel: '7',
      withVariants: true,
    });
  });

  it('exam/variants：缺 seed.content → 400；有效种子委托 VariantGenerator', async () => {
    const generate = jest.fn().mockResolvedValue([{ id: 'v1', type: 'solution', content: '2x=6' }]);
    const controller = makeController({ generate });

    expect(() => controller.generateVariants({ seed: {} })).toThrow(BadRequestException);
    await expect(controller.generateVariants({
      seed: { type: 'solution', content: '2x=4', answer: '2' },
      count: 1,
      strategy: 'numeric',
      subject: 'math',
      gradeLevel: '7',
    })).resolves.toEqual({ variants: [{ id: 'v1', type: 'solution', content: '2x=6' }] });
    expect(generate).toHaveBeenCalledWith(
      { type: 'solution', content: '2x=4', answer: '2' },
      { count: 1, strategy: 'numeric', subject: 'math', gradeLevel: '7' },
    );
  });
});
