import { Injectable } from '@nestjs/common';
// LlmService 必须值导入（emitDecoratorMetadata 依赖运行期引用）；`import type` 会使 Nest 无法注入。
import { LlmService } from './llm.service';
import type { BlankSpec, OcrBlock, ParsedQuestion, QuestionType } from '../tuition.types';

/**
 * 结构化题目解析（P2-T7）—— OCR 文本 → `ParsedQuestion[]`（题型/选项/空位/KP/难度）。
 *
 * 判别策略：**规则优先**（题型特征、选项标记、下划线空位、知识点名称/关键词匹配），
 * 有真实 key 时再用既有 `LlmService` 对**已定结构**做兜底微调（不改题型）。**不引入**向量检索/
 * embedding 依赖 —— 知识点映射靠 `edu.knowledge_points` 名录 + 内置关键词表做名称匹配（N2）。
 */

export interface ParseContext {
  subject?: string;
  gradeLevel?: string;
  /** 已知知识点名录（来自 `edu.knowledge_points`）；优先按名称子串匹配。 */
  knowledgePoints?: string[];
}

/** 内置知识点关键词表：名称/关键词匹配（无向量依赖）。 */
export const KP_KEYWORDS: Array<{ kp: string; keywords: string[] }> = [
  { kp: '勾股定理', keywords: ['直角三角形', '斜边', '直角边', '勾股'] },
  { kp: '一次函数', keywords: ['一次函数', 'kx + b', 'kx+b', '图像经过点'] },
  { kp: '一元一次方程', keywords: ['解方程', '一元一次方程', '移项', '解一元一次'] },
  { kp: '二次函数', keywords: ['二次函数', '抛物线'] },
  { kp: '分式方程', keywords: ['分式方程'] },
  { kp: '全等三角形', keywords: ['全等'] },
  { kp: '相似三角形', keywords: ['相似'] },
  { kp: '圆', keywords: ['半径', '直径', '圆心角', '圆周角'] },
  { kp: '实数', keywords: ['平方根', '立方根', '绝对值'] },
  { kp: '概率', keywords: ['随机', '概率'] },
];

/** 知识点兜底（无法匹配任何关键词时，保证非空——下游契约要求 KP 必填）。 */
export const DEFAULT_KNOWLEDGE_POINT = '综合';

@Injectable()
export class QuestionParser {
  constructor(private readonly llm: LlmService) {}

  /**
   * 解析入口：`text` 或 OCR 版面块 → 结构化题目。
   * 空输入 → `[]`（绝不抛错）；题型/空位由规则判定，LLM（有 key 时）仅做兜底微调。
   */
  async parse(input: string | OcrBlock[], ctx: ParseContext = {}): Promise<ParsedQuestion[]> {
    const text = Array.isArray(input) ? this._blocksToText(input) : input ?? '';
    if (!text.trim()) return [];

    const out: ParsedQuestion[] = [];
    for (const segment of this._splitQuestions(text)) {
      const q = this._parseOne(segment, out.length, ctx);
      if (q) out.push(q);
    }

    // 有真实 key 时，逐题做类型/KP 兜底（规则已定的结构不变）
    if (out.length && this.llm.isRealKey()) {
      for (const q of out) await this._enrichWithLlm(q, ctx);
    }
    return out;
  }

  // --- 切分 ------------------------------------------------------------------

  /** 以「行首 数字[.、)）]」为界切分题块；无标记则整体视为一题。 */
  private _splitQuestions(text: string): string[] {
    const normalized = (text ?? '').replace(/\r\n?/g, '\n');
    return normalized
      .split(/\n(?=\s*\d+\s*[.、)）])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private _blocksToText(blocks: OcrBlock[]): string {
    return (blocks ?? [])
      .map((b) => (b.text ?? b.latex ?? '').trim())
      .filter((s) => s.length > 0)
      .join('\n');
  }

  // --- 单题解析 --------------------------------------------------------------

  private _parseOne(segment: string, idx: number, ctx: ParseContext): ParsedQuestion | null {
    const trimmed = segment.trim();
    if (!trimmed) return null;

    // 去掉题号标记（1. / 2、 / 3) …），保留其余题干与选项
    const body = trimmed.replace(/^\s*\d+\s*[.、)）]\s*/, '');
    const options = this._extractOptions(body);
    const blanks = this._extractBlanks(body);
    const type = this._detectType(body, options, blanks);
    const knowledgePoint = this._mapKnowledgePoint(body, ctx);
    const difficulty = this._estimateDifficulty(body, options, blanks, type);
    const stem = this._stripOptions(body);

    return {
      id: `q${idx + 1}`,
      type,
      content: stem || body,
      options,
      blanks,
      answer: '',
      knowledgePoint,
      difficulty,
      subject: ctx.subject,
    };
  }

  /** 选项抽取：识别连续的 `A. B. C. D.` 标签（支持同行或分行），标签须自 A 起连续。 */
  private _extractOptions(content: string): string[] {
    const markerRe = /(?:^|[\s\n])[A-D][.、)）]\s*/g;
    const marks: Array<{ label: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(content)) !== null) {
      marks.push({ label: m[0].replace(/[\s]/g, '').charAt(0), start: m.index, end: m.index + m[0].length });
    }
    if (marks.length < 2) return [];

    const labels = marks.map((x) => x.label).join('');
    if (labels !== 'ABCD'.slice(0, marks.length)) return []; // 标签非 A/B/C/D 连续 → 非选项

    const options: string[] = [];
    for (let i = 0; i < marks.length; i++) {
      const from = marks[i].end;
      const to = i + 1 < marks.length ? marks[i + 1].start : content.length;
      const text = content.slice(from, to).replace(/\s*\n\s*/g, ' ').trim();
      if (text) options.push(text);
    }
    return options;
  }

  /** 空位抽取：`______`（≥2 下划线）或空括号/全角括号，按出现顺序编号。 */
  private _extractBlanks(content: string): BlankSpec[] {
    const re = /_{2,}|（\s*）|\(\s*\)/g;
    const blanks: BlankSpec[] = [];
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(content)) !== null) blanks.push({ index: i++ });
    return blanks;
  }

  /** 题型判别：有选项 → 单选/多选；有空位 → 填空；否则解答。 */
  private _detectType(content: string, options: string[], blanks: BlankSpec[]): QuestionType {
    if (options.length >= 2) {
      return /多选|至少|所有正确|选出所有|错误的是|不正确的是/.test(content) ? 'multiple_choice' : 'single_choice';
    }
    if (blanks.length >= 1) return 'fill_blank';
    return 'solution';
  }

  /** 从题干中剔除选项片段，得到纯题干。 */
  private _stripOptions(content: string): string {
    return content
      .replace(/(?:^|[\s\n])[A-D][.、)）][^\n]*/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
  }

  /** 知识点映射：先匹配已知名录（子串），再退回内置关键词表；保证非空。 */
  private _mapKnowledgePoint(content: string, ctx: ParseContext): string {
    const text = content ?? '';
    const known = ctx.knowledgePoints ?? [];
    // 1) 名录优先（更长的名称优先，避免 "函数" 抢占 "一次函数"）
    const byName = known
      .filter((kp) => kp && text.includes(kp))
      .sort((a, b) => b.length - a.length)[0];
    if (byName) return byName;
    // 2) 内置关键词表
    for (const { kp, keywords } of KP_KEYWORDS) {
      if (keywords.some((k) => text.includes(k))) return kp;
    }
    // 3) 名录次优（名录中任一作为泛化所属，仍优于"综合"）
    return known.find((kp) => !!kp) ?? DEFAULT_KNOWLEDGE_POINT;
  }

  /** 难度估算（启发式）：结构复杂度 + 文本长度。 */
  private _estimateDifficulty(
    content: string,
    options: string[],
    blanks: BlankSpec[],
    type: QuestionType,
  ): 'easy' | 'medium' | 'hard' {
    let score = 0;
    if (type === 'solution') score += 1;
    if (type === 'multiple_choice') score += 2;
    if (type === 'fill_blank') score += 1;
    if (blanks.length >= 2) score += 1;
    if (options.length >= 4) score += 1;
    if (content.length > 60) score += 1;
    if (/证明|求证|讨论|取值范围|最大值|最小值/.test(content)) score += 2;
    if (score <= 1) return 'easy';
    if (score <= 3) return 'medium';
    return 'hard';
  }

  // --- LLM 兜底（有 key 时）---------------------------------------------------

  private async _enrichWithLlm(q: ParsedQuestion, ctx: ParseContext): Promise<void> {
    try {
      const prompt = `你是数学题分类器。请判断本题的知识点与难度，只返回 JSON：
{"knowledgePoint": "知识点名称", "difficulty": "easy|medium|hard"}
学科：${ctx.subject ?? 'math'}；年级：${ctx.gradeLevel ?? 'unknown'}。
题目：${q.content}`;
      const res = await this.llm.chatCompletion([{ role: 'user', content: prompt }]);
      const parsed = this._parseJsonObject(res?.content ?? '');
      if (parsed) {
        if (typeof parsed.knowledgePoint === 'string' && parsed.knowledgePoint.trim()) {
          q.knowledgePoint = parsed.knowledgePoint.trim();
        }
        if (parsed.difficulty === 'easy' || parsed.difficulty === 'medium' || parsed.difficulty === 'hard') {
          q.difficulty = parsed.difficulty;
        }
      }
    } catch {
      // 兜底失败 → 保留规则结果（绝不抛错）
    }
  }

  private _parseJsonObject(content: string): any | null {
    if (!content) return null;
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
