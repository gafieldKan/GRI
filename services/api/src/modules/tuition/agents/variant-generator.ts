import { Injectable } from '@nestjs/common';
// LlmClient / QuestionParser 必须值导入（emitDecoratorMetadata 依赖运行期引用）；`import type` 会使 Nest 无法注入。
import { LlmClient } from '@gri/agent-core';
import { QuestionParser } from './question-parser';
import { llmTimeoutMs } from './llm-provider';
import type { ParsedQuestion, QuestionSeed, VariantGenerationOptions } from '../tuition.types';

/**
 * 变式生成（P2-T7）—— 由「种子题」派生同知识点的变式题。
 *
 * 策略（离线纯逻辑，确定性）：
 *   - `numeric`：对题干/选项/答案中的数值统一施一个 **±20% 内非零** 因子（同一因子 ⇒ 选择题
 *     正确项的"位置语义"不变；变换后必与原值不同）。
 *   - `swap`：把「已知 X，求 Y」互换为「已知 Y，求 X」（仅对非选择题生效，避免选项语义错配）。
 *   - `auto`：交替使用（偶数次 numeric、奇数次 swap，swap 不适用时退化为 numeric）。
 *
 * **反向自校验（N5）**：每个变式渲染回文本后交给 `QuestionParser` 重新解析，题型一致、选项数/
 * 空位数不变者方被采纳；不合法者丢弃并换因子重试。有 key 时可选 LLM 改写（失败即回退纯逻辑）。
 *
 * 已知边界：纯数值缩放保证「结构合法 + 数值有别 + 同 KP」，**不保证数学自洽**（如勾股 3-4-5
 * 缩放后三边不再满足勾股关系）——数学自洽需领域求解器，超出本卡范围。
 */

/** 数值替换因子池（均落在 ±20% 内且 ≠1，确定性循环取用，足够产生互异变式）。 */
export const NUMERIC_FACTORS = [1.2, 0.8, 1.1, 0.9, 1.15, 0.85, 1.05, 0.95];

@Injectable()
export class VariantGenerator {
  constructor(
    private readonly parser: QuestionParser,
    private readonly llm: LlmClient,
  ) {}

  /**
   * 生成 `options.count`（默认 3）个变式；每个变式经 `QuestionParser` 反向校验。
   * 空种子 / count≤0 → `[]`；非法变式被丢弃后自动换因子重试（有界，确定性）。
   */
  async generate(seed: QuestionSeed, options: VariantGenerationOptions = {}): Promise<ParsedQuestion[]> {
    const count = Math.max(0, options.count ?? 3);
    if (!seed || !seed.content || !seed.content.trim() || count <= 0) return [];

    const strategy = options.strategy ?? 'auto';
    const out: ParsedQuestion[] = [];
    const seen = new Set<string>([this._norm(seed.content)]);
    const maxAttempts = count * 4;

    for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
      let candidate = this._makeCandidate(seed, attempt, strategy);
      // 可选 LLM 改写（仅在有真实 key 时；失败即回退纯逻辑候选）
      if (await this.llm.isRealKey()) candidate = await this._maybeLlmRewrite(candidate);
      if (seen.has(this._norm(candidate.content))) continue;
      const valid = await this._selfCheck(candidate, seed, options);
      if (valid) {
        out.push(valid);
        seen.add(this._norm(valid.content));
      }
    }
    return out;
  }

  // --- 候选构造 --------------------------------------------------------------

  private _makeCandidate(seed: QuestionSeed, attempt: number, strategy: string): ParsedQuestion {
    const useSwap =
      strategy === 'swap' || (strategy === 'auto' && attempt % 2 === 1);
    return useSwap ? this._swapVariant(seed, attempt) : this._numericVariant(seed, attempt);
  }

  /** 数值 ±20% 非零替换：同一因子作用于题干/选项/答案。 */
  private _numericVariant(seed: QuestionSeed, attempt: number): ParsedQuestion {
    const factor = NUMERIC_FACTORS[attempt % NUMERIC_FACTORS.length];
    return {
      id: `${seed.id ?? 'seed'}_v${attempt + 1}`,
      type: seed.type,
      content: this._scaleNumbers(seed.content, factor),
      options: (seed.options ?? []).map((o) => this._scaleNumbers(o, factor)),
      blanks: seed.blanks ?? [],
      answer: seed.answer ? this._scaleNumbers(seed.answer, factor) : '',
      knowledgePoint: seed.knowledgePoint ?? '综合',
      difficulty: seed.difficulty ?? 'medium',
      subject: seed.subject,
    };
  }

  /** 已知/未知互换（选择题退化为数值替换，避免选项与题干错配）。 */
  private _swapVariant(seed: QuestionSeed, attempt: number): ParsedQuestion {
    const base = this._numericVariant(seed, attempt);
    if (seed.type === 'single_choice' || seed.type === 'multiple_choice') return base;
    const m = seed.content.match(/已知(.+?)[，,]\s*求(.+?)([。.？?]|$)/);
    if (!m) return base;
    return {
      ...base,
      id: `${seed.id ?? 'seed'}_s${attempt + 1}`,
      content: `已知${m[2].trim()}，求${m[1].trim()}${m[3] || '。'}`,
    };
  }

  /**
   * 对文本中所有整数/小数施因子；结果去零、且与原文值不同。
   * 保留**十分位**精度（整数结果仍输出整数）——避免取整把不同因子塌缩成同一变式。
   */
  private _scaleNumbers(text: string, factor: number): string {
    return (text ?? '').replace(/-?\d+(?:\.\d+)?/g, (raw) => {
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return raw;
      let scaled = Math.round(n * factor * 10) / 10;
      if (scaled === 0) scaled = n > 0 ? 1 : -1;
      if (scaled === n) scaled = Math.round((n + (factor >= 1 ? 1 : -1)) * 10) / 10;
      if (scaled === 0) scaled = 1;
      return String(scaled);
    });
  }

  // --- 反向自校验（N5）-------------------------------------------------------

  private async _selfCheck(
    variant: ParsedQuestion,
    seed: QuestionSeed,
    options: VariantGenerationOptions,
  ): Promise<ParsedQuestion | null> {
    try {
      const parsed = await this.parser.parse(this._renderToText(variant), {
        subject: options.subject ?? seed.subject,
        gradeLevel: options.gradeLevel,
      });
      const first = parsed[0];
      if (!first) return null;
      if (first.type !== seed.type) return null; // 题型须不变
      const wantOpts = variant.options.length;
      if (wantOpts && first.options.length !== wantOpts) return null; // 选项数须不变
      const wantBlanks = variant.blanks.length;
      if (wantBlanks && first.blanks.length !== wantBlanks) return null; // 空位数须不变
      return {
        ...variant,
        type: first.type,
        content: first.content, // 以解析回读为准（确保"可被 parser 还原"）
        options: first.options.length ? first.options : variant.options,
        blanks: first.blanks.length ? first.blanks : variant.blanks,
      };
    } catch {
      return null;
    }
  }

  /** 变式 → 单题文本（加题号使 parser 视为一题；选项独立成行）。 */
  private _renderToText(q: ParsedQuestion): string {
    const stem = (q.content ?? '').trim();
    if (!q.options.length) return `1. ${stem}`;
    const opts = q.options.map((o, i) => `${'ABCD'[i] ?? 'A'}. ${o}`).join('\n');
    return `1. ${stem}\n${opts}`;
  }

  private _norm(s: string): string {
    return (s ?? '').replace(/\s+/g, '').trim();
  }

  /** 可选 LLM 改写：换语文但保留数值/题型；返回非法或异常 → 原候选（纯逻辑兜底）。 */
  private async _maybeLlmRewrite(q: ParsedQuestion): Promise<ParsedQuestion> {
    try {
      const prompt = `请在不改变数值与题型的前提下，改写下面这道题的表述（只返回 JSON {"content":"改写后的题干"}）：
${q.content}`;
      const res = await this.llm.chat([{ role: 'user', content: prompt }], 'default', { timeoutMs: llmTimeoutMs() });
      const parsed = this._parseJsonObject(res?.content ?? '');
      const content = parsed && typeof parsed.content === 'string' ? parsed.content.trim() : '';
      return content ? { ...q, content } : q;
    } catch {
      return q;
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
