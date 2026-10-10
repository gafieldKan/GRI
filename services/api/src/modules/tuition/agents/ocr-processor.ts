import { Injectable } from '@nestjs/common';
// 注意：LlmService 必须**值导入**——emitDecoratorMetadata 需其运行期引用以生成 design:paramtypes；
// `import type` 会被擦除，导致 Nest 无法解析构造函数依赖。
import { LlmService } from './llm.service';
import type { OcrBlock, OcrResult } from '../tuition.types';

/**
 * OCR 适配层（P2-T7）—— 统一 `{ text, latex, blocks[] }`，多引擎可切换。
 *
 * 引擎选型（N3 定论）：**默认多模态 LLM**（复用既有 `LlmService.chatCompletionMultimodal`）；
 * `MockOcrEngine` 为**确定性**引擎，用于无 key / 离线 / 测试。**不引入** PaddleOCR/Tesseract/
 * Mistral 等原生依赖——生产若要换引擎，仅需实现 `OcrEngine` 同接口。
 */

export interface OcrProcessOptions {
  subject?: string;
  gradeLevel?: string;
}

/** OCR 引擎统一接口（多引擎可切换）。 */
export interface OcrEngine {
  readonly name: string;
  process(imageDataUrl: string, opts?: OcrProcessOptions): Promise<OcrResult>;
}

/** 确定性样卷文本（含单选/填空/解答各一题）—— 离线与测试的稳定基准。 */
export const MOCK_OCR_TEXT = [
  '1. 已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。',
  'A. 5   B. 6   C. 7   D. 8',
  '',
  '2. 若一次函数 y = kx + b 的图像经过点 (1, 2) 和 (3, 6)，则 k = ______，b = ______。',
  '',
  '3. 解方程：2x + 5 = 15',
].join('\n');

/** 从文本抽取 LaTeX 片段（含 `=` 的算式串，去重保序）。 */
export function extractLatex(text: string): string {
  const matches = (text ?? '').match(/[A-Za-z0-9()²+\-*/=√.\s]*=[^，。；;\n]*/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const s = raw.trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out.join('; ');
}

/** 文本 → 版面块（含 `=` 的行判为公式块，其余为文本块；空行跳过）。 */
export function buildBlocks(text: string): OcrBlock[] {
  const blocks: OcrBlock[] = [];
  for (const line of (text ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.includes('=')) blocks.push({ type: 'formula', text: t, latex: extractLatex(t) || t });
    else blocks.push({ type: 'text', text: t });
  }
  return blocks;
}

/** 确定性 Mock 引擎：任意输入均返回同一样卷（同输入同输出）。 */
export class MockOcrEngine implements OcrEngine {
  readonly name = 'mock';

  async process(_imageDataUrl: string, _opts?: OcrProcessOptions): Promise<OcrResult> {
    void _imageDataUrl;
    void _opts;
    return {
      text: MOCK_OCR_TEXT,
      latex: extractLatex(MOCK_OCR_TEXT),
      blocks: buildBlocks(MOCK_OCR_TEXT),
      engine: this.name,
    };
  }
}

/** 多模态 LLM 引擎：包既有 `chatCompletionMultimodal`（无 key → 抛 `NO_LLM_KEY`）。 */
export class MultimodalLlmEngine implements OcrEngine {
  readonly name = 'multimodal-llm';

  constructor(private readonly llm: LlmService) {}

  async process(imageDataUrl: string, opts: OcrProcessOptions = {}): Promise<OcrResult> {
    const prompt = `请识别这张试卷图片中的所有内容，按以下 JSON 格式返回（只返回 JSON）：
{
  "text": "完整识别的文本内容（含题干、选项、公式）",
  "latex": "文中公式的 LaTeX 片段（分号分隔）",
  "blocks": [{ "type": "text|formula|image|table", "text": "块文本", "latex": "公式 LaTeX（可选）" }]
}
学科：${opts.subject ?? 'unknown'}；年级：${opts.gradeLevel ?? 'unknown'}。`;
    const res = await this.llm.chatCompletionMultimodal(imageDataUrl, prompt);
    const parsed = parseJsonObject(res.content);
    if (!parsed) {
      // 端点返回非 JSON → 退化为纯文本
      return { text: res.content ?? '', latex: extractLatex(res.content ?? ''), blocks: buildBlocks(res.content ?? ''), engine: this.name };
    }
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      latex: typeof parsed.latex === 'string' ? parsed.latex : '',
      blocks: Array.isArray(parsed.blocks) ? (parsed.blocks as OcrBlock[]) : [],
      engine: this.name,
    };
  }
}

function parseJsonObject(content: string): any | null {
  if (!content) return null;
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * OCR 门面：按 key 可用性选引擎（默认多模态 LLM；无 key / 空图 → Mock；LLM 失败 → Mock 兜底）。
 * **绝不抛未捕获异常** —— 保证离线与异常输入下链路可控可重复。
 */
@Injectable()
export class OcrProcessor {
  private readonly mock = new MockOcrEngine();
  private readonly multimodal: MultimodalLlmEngine;

  constructor(private readonly llm: LlmService) {
    this.multimodal = new MultimodalLlmEngine(llm);
  }

  /** 可用引擎名（供诊断/测试断言选型）。 */
  get engines(): string[] {
    return [this.multimodal.name, this.mock.name];
  }

  /** 文本链路：显式文本直接透传（免发空图给多模态端点）。 */
  passthrough(text: string): OcrResult {
    return { text: text ?? '', latex: extractLatex(text ?? ''), blocks: buildBlocks(text ?? ''), engine: 'passthrough' };
  }

  async process(imageDataUrl: string, opts: OcrProcessOptions = {}): Promise<OcrResult> {
    // 空图：不调外部（避免多模态端点挂死），直接走 Mock
    if (!imageDataUrl) return this.mock.process(imageDataUrl, opts);
    // 无真实 key → Mock（N3）
    if (!this.llm.isRealKey()) return this.mock.process(imageDataUrl, opts);
    // 默认多模态 LLM；失败（含 NO_LLM_KEY）→ Mock 兜底
    try {
      return await this.multimodal.process(imageDataUrl, opts);
    } catch {
      return this.mock.process(imageDataUrl, opts);
    }
  }
}
