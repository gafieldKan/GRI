import { Injectable } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * ExamScannerAgent（移植旧 ExamScannerAgent.js）：OCR 识别试卷图片 → 结构化题目。
 * 图片以 base64 data-URL 传入（新架构无 /uploads 静态目录）。
 * 无 key → 明确回退 Mock OCR 文本（不再是 pending 占位），收方据此降级分析。
 */
@Injectable()
export class ExamScannerAgent {
  constructor(private readonly llm: LlmService) {}

  async scanExam(params: { imageDataUrl: string; subject?: string; gradeLevel?: string }) {
    const { imageDataUrl, subject = 'math', gradeLevel = '8' } = params;
    try {
      // Step1: 多模态 OCR 识别（无 key 抛「NO_LLM_KEY」→ 回退 Mock 文本）
      let ocr: { rawText: string; questions: any[] };
      try {
        ocr = await this._performOCR(imageDataUrl);
      } catch (e) {
        if ((e as Error)?.message === 'NO_LLM_KEY') ocr = this._getMockOCRResult();
        else throw e;
      }
      // Step2: 文本 → 结构化题目（LLM 或 mock）
      const parsedQuestions = await this._parseQuestions(ocr.rawText, subject, gradeLevel);
      return {
        success: true,
        ocr,
        parsedQuestions,
        metadata: { subject, gradeLevel, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return { success: false, error: (error as Error)?.message };
    }
  }

  private async _performOCR(imageDataUrl: string): Promise<{ rawText: string; questions: any[] }> {
    const text = `请识别这张试卷图片中的所有题目内容，按以下 JSON 格式返回：
{
  "raw_text": "完整识别的文本内容",
  "questions": [
    { "id": "q1", "type": "choice|fill|solution", "content": "题目内容", "options": ["A 选项", "B 选项"], "answer": "答案" }
  ]
}`;
    const response = await this.llm.chatCompletionMultimodal(imageDataUrl, text);
    const parsed = this._parseJsonObject(response.content);
    if (parsed) {
      return { rawText: parsed.raw_text || response.content, questions: parsed.questions || [] };
    }
    return { rawText: response.content, questions: [] };
  }

  private _getMockOCRResult(): { rawText: string; questions: any[] } {
    return {
      rawText: `1. 已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。
A. 5  B. 6  C. 7  D. 8

2. 若一次函数 y = kx + b 的图像经过点 (1, 2) 和 (3, 6)，求 k 和 b 的值。

3. 解方程：2x + 5 = 15`,
      questions: [],
    };
  }

  private async _parseQuestions(rawText: string, subject: string, gradeLevel: string): Promise<any[]> {
    const prompt = `请分析以下试卷内容，识别出每道题目的类型和内容：

试卷内容：
${rawText}

学科：${subject}
年级：${gradeLevel}

请按以下 JSON 格式返回分析结果：
[
  { "id": "q1", "type": "choice|fill|solution", "content": "题目完整内容", "options": ["选项 A", "选项 B", "选项 C", "选项 D"], "answer": "正确答案", "knowledgePoint": "知识点名称", "difficulty": 0.5 }
]

如果没有选项，options 返回空数组。`;
    const systemPrompt = '你是一个专业的 K12 试卷分析助手，负责识别和结构化试卷题目。';
    try {
      const result = await this.llm.chatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ]);
      return this._parseJsonArray(result.content) ?? [];
    } catch {
      return [];
    }
  }

  private _parseJsonObject(content: string): any | null {
    const m = content?.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }

  private _parseJsonArray(content: string): any[] | null {
    const m = content?.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}