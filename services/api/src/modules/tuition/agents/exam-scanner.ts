import { Injectable } from '@nestjs/common';
import { OcrProcessor } from './ocr-processor';
import { QuestionParser } from './question-parser';
import { VariantGenerator } from './variant-generator';
import type { ExamScanResult, OcrResult } from '../tuition.types';

/**
 * ExamScannerAgent（P2-T7 下钻拆分后的**编排层**）——拍照解题链路主入口：
 * OCR 识别 → 结构化题目 →（可选）变式题。
 *
 * 职责下沉：OCR 交 `OcrProcessor`（多引擎可切换，显式 rawText 透传 / 无 key → Mock）、
 * 结构化交 `QuestionParser`（规则优先，LLM 兜底）、变式交 `VariantGenerator`（生成后经 parser 反向校验）。
 *
 * `scanExam` 出参**向后兼容**：`success` / `error` / `ocr.rawText` / `ocr.questions` /
 * `parsedQuestions` / `metadata` 原样保留；新增 `ocr.text|latex|blocks` 与可选 `variants[]`。
 * 无 key 时全链路 Mock 且可重复。
 */
@Injectable()
export class ExamScannerAgent {
  constructor(
    private readonly ocr: OcrProcessor,
    private readonly parser: QuestionParser,
    private readonly variants: VariantGenerator,
  ) {}

  async scanExam(params: {
    imageDataUrl: string;
    subject?: string;
    gradeLevel?: string;
    rawText?: string;
    /** 增量：true 时附首题变式（默认 false，不破坏既有调用）。 */
    withVariants?: boolean;
  }): Promise<ExamScanResult> {
    const { imageDataUrl, subject = 'math', gradeLevel = '8', rawText } = params;
    try {
      // Step1: 题面来源 —— 显式 rawText（文本链路）透传；否则多引擎 OCR（无 key/空图 → Mock）
      const ocr: OcrResult = rawText
        ? this.ocr.passthrough(rawText)
        : await this.ocr.process(imageDataUrl, { subject, gradeLevel });

      // Step2: 文本 → 结构化题目（规则优先，LLM 兜底）
      const parsedQuestions = await this.parser.parse(ocr.text, { subject, gradeLevel });

      const result: ExamScanResult = {
        success: true,
        ocr: { ...ocr, rawText: ocr.text, questions: [] },
        parsedQuestions,
        metadata: { subject, gradeLevel, timestamp: new Date().toISOString() },
      };

      // Step3（可选）：首题变式（增量字段，不影响既有消费方）
      if (params.withVariants && parsedQuestions.length > 0) {
        result.variants = await this.variants.generate(parsedQuestions[0], {
          count: 3,
          subject,
          gradeLevel,
        });
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: (error as Error)?.message,
        ocr: { text: '', latex: '', blocks: [], rawText: '', questions: [], engine: 'none' },
        parsedQuestions: [],
      };
    }
  }
}
