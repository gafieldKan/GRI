import { MockOcrEngine, OcrProcessor, MOCK_OCR_TEXT, extractLatex, buildBlocks } from './ocr-processor';
import type { LlmClient } from '@gri/agent-core';
// 值引入被测类会传递加载 ESM 包 @gri/agent-core —— 按既有范式 mock（同其它 tuition spec）
jest.mock("@gri/agent-core", () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q, LlmClient: class {} }));

/**
 * OCR 适配层单测（P2-T7）。
 * 覆盖：Mock 引擎确定性、无 key → Mock、空图不发外部请求、有 key → 多模态引擎、
 * LLM 失败兜底 Mock、文本透传、引擎接口契约。
 */

function makeLlm(opts: { real?: boolean; multimodal?: jest.Mock } = {}) {
  const chatMultimodal = opts.multimodal ?? jest.fn();
  const isRealKey = jest.fn().mockReturnValue(!!opts.real);
  return {
    llm: { isRealKey, chatMultimodal } as unknown as LlmClient,
    isRealKey,
    chatMultimodal,
  };
}

describe('MockOcrEngine —— 确定性', () => {
  it('同输入同输出（不同图片入参也返回同一样卷）', async () => {
    const e = new MockOcrEngine();
    const a = await e.process('data:image/png;base64,AAA');
    const b = await e.process('data:image/png;base64,BBB');
    expect(a).toEqual(b);
    expect(a.engine).toBe('mock');
  });

  it('样卷含单选/填空/解答各一题，且 blocks/latex 非空', async () => {
    const r = await new MockOcrEngine().process('x');
    expect(r.text).toBe(MOCK_OCR_TEXT);
    expect(r.text).toContain('A. 5'); // 含选项行
    expect(r.text).toContain('解方程'); // 含解答题
    expect(r.blocks.length).toBeGreaterThan(0);
    expect(r.latex.length).toBeGreaterThan(0);
    expect(r.blocks.some((b) => b.type === 'formula')).toBe(true);
  });
});

describe('OcrProcessor —— 引擎选型', () => {
  it('无真实 key → Mock 引擎，且不发多模态请求', async () => {
    const { llm, chatMultimodal } = makeLlm({ real: false });
    const r = await new OcrProcessor(llm).process('data:image/png;base64,AAA');
    expect(r.engine).toBe('mock');
    expect(chatMultimodal).not.toHaveBeenCalled();
  });

  it('空图（有 key）→ 仍走 Mock，避免空图请求挂死端点', async () => {
    const { llm, chatMultimodal } = makeLlm({ real: true });
    const r = await new OcrProcessor(llm).process('');
    expect(r.engine).toBe('mock');
    expect(chatMultimodal).not.toHaveBeenCalled();
  });

  it('有真实 key → 默认多模态 LLM 引擎（解析 JSON 出参）', async () => {
    const multimodal = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        text: '识别文本',
        latex: 'x = 1',
        blocks: [{ type: 'formula', text: 'x = 1', latex: 'x = 1' }],
      }),
    });
    const { llm } = makeLlm({ real: true, multimodal });
    const r = await new OcrProcessor(llm).process('data:image/png;base64,AAA');
    expect(r.engine).toBe('multimodal-llm');
    expect(r.text).toBe('识别文本');
    expect(r.blocks[0]).toMatchObject({ type: 'formula' });
    expect(multimodal).toHaveBeenCalledTimes(1);
  });

  it('多模态失败（异常）→ Mock 兜底，绝不抛未捕获异常', async () => {
    const multimodal = jest.fn().mockRejectedValue(new Error('NO_LLM_KEY'));
    const { llm } = makeLlm({ real: true, multimodal });
    const r = await new OcrProcessor(llm).process('data:image/png;base64,AAA');
    expect(r.engine).toBe('mock');
    expect(r.text).toBe(MOCK_OCR_TEXT);
  });

  it('多模态返回非 JSON → 退化为纯文本（不抛错）', async () => {
    const multimodal = jest.fn().mockResolvedValue({ content: '这是一段纯文本识别结果' });
    const { llm } = makeLlm({ real: true, multimodal });
    const r = await new OcrProcessor(llm).process('data:image/png;base64,AAA');
    expect(r.engine).toBe('multimodal-llm');
    expect(r.text).toContain('纯文本');
  });
});

describe('OcrProcessor —— 接口契约', () => {
  it('engines 列出可用引擎名', () => {
    const { llm } = makeLlm();
    expect(new OcrProcessor(llm).engines).toEqual(expect.arrayContaining(['multimodal-llm', 'mock']));
  });

  it('passthrough 直接透传文本，engine=passthrough', () => {
    const { llm } = makeLlm({ real: true });
    const r = new OcrProcessor(llm).passthrough('解方程：2x + 5 = 15');
    expect(r.engine).toBe('passthrough');
    expect(r.text).toBe('解方程：2x + 5 = 15');
    expect(r.latex).toContain('2x + 5 = 15');
  });

  it('纯函数助手：extractLatex 去重、buildBlocks 分块跳过空行', () => {
    expect(extractLatex('a = 1，a = 1')).toBe('a = 1'); // 去重
    const lx = extractLatex('y = kx + b\n又 2x + 5 = 15');
    expect(lx).toContain('y = kx + b');
    expect(lx).toContain('2x + 5 = 15');
    const blocks = buildBlocks('第一行文本\nx = 1\n\n');
    expect(blocks).toHaveLength(2);
    expect(blocks[1].type).toBe('formula');
  });
});
