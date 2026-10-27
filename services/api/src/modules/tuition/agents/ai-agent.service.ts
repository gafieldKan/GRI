import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { LlmClient } from '@gri/agent-core';
import { eduQuery, insertExamBasic, updateExamOcr, updateExamParsed, markExamAnalyzed } from '../../edu-core/repository';
import { ExamScannerAgent } from './exam-scanner';
import { TutorAgent } from './tutor-agent';
import { QuestionGeneratorAgent } from './question-generator';
import { PlanAgent } from './plan-agent';

/**
 * AI 智能体编排门面（替换 M3 占位）—— 真实流水线：
 *   ExamScanner(OCR) → TutorAgent.analyzeExam(结构化报告) → QuestionGenerator.generatePracticeSet(薄弱点)
 *   → PlanAgent.generatePlan(学习计划)，结果全部落库，exam.status='analyzed'。
 *
 * 无 LLM key → 各 agent 走本地 mock gate（同形结构化输出），status='mock'；
 * **绝不返回旧的 pending_ai_integration 占位**。
 */
@Injectable()
export class AiAgentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly llm: LlmClient,
    private readonly scanner: ExamScannerAgent,
    private readonly tutor: TutorAgent,
    private readonly generator: QuestionGeneratorAgent,
    private readonly plan: PlanAgent,
  ) {}

  /**
   * 试卷 → 学情流水线。
   * @param input.text 试卷文本（exam/analyze 文本链路）
   * @param input.imageDataUrl base64 图片（exam/upload 拍照链路）
   */
  async pipeline(
    userId: string,
    input: { text?: string; imageDataUrl?: string; subject?: string; gradeLevel?: string; answers?: string[]; meta?: any } = {},
  ): Promise<any> {
    const subject = input.subject || 'math';
    const gradeLevel = input.gradeLevel || '8';
    const useReal = await this.llm.isRealKey();

    // Step 1: 识别 —— 建 exam 行（pending），存 OCR/图像
    const examId = (await insertExamBasic(eduQuery(this.db), {
      userId,
      subject,
      gradeLevel,
      rawImages: input.imageDataUrl ? JSON.stringify([input.imageDataUrl]) : null,
    })) as string;

    let rawText = input.text || '';
    let parsedQuestions: any[] = [];

    if (input.imageDataUrl) {
      // 拍照链路：多模态 OCR → 结构化题目
      const scan = await this.scanner.scanExam({ imageDataUrl: input.imageDataUrl, subject, gradeLevel });
      if (scan.success) {
        rawText = scan.ocr?.rawText || rawText;
        parsedQuestions = scan.parsedQuestions || [];
      }
      await updateExamOcr(
        eduQuery(this.db),
        examId,
        rawText ? JSON.stringify({ raw_text: rawText }) : null,
        parsedQuestions.length ? JSON.stringify(parsedQuestions) : null,
      );
    } else if (rawText) {
      // 文本链路：跳过多模态 OCR（空图请求会让多模态端点挂死），直接结构化 rawText
      const scan = await this.scanner.scanExam({ imageDataUrl: '', subject, gradeLevel, rawText }).catch(() => null);
      if (scan?.success) parsedQuestions = scan.parsedQuestions || [];
      if (!parsedQuestions.length) {
        parsedQuestions = [{ id: 'q1', type: 'solution', content: rawText, options: [], answer: '', knowledgePoint: '综合' }];
      }
      await updateExamParsed(eduQuery(this.db), examId, JSON.stringify(parsedQuestions));
    }

    // Step 2: 学情分析 → 结构化报告（TutorAgent 内部落库 analysis_reports）
    const questions = parsedQuestions.map((q: any, i: number) => ({
      id: q.id || `q${i + 1}`,
      content: q.content || rawText,
      answer: q.answer || '',
      type: q.type || 'fill',
      options: q.options || [],
      knowledgePoint: q.knowledgePoint || '综合',
    }));
    const studentAnswers = input.answers && input.answers.length ? input.answers : questions.map(() => '');

    const analysis = await this.tutor.analyzeExam({ userId, examId, questions, studentAnswers, subject, gradeLevel });
    if (!analysis.success) {
      return { status: 'failed', message: analysis.error || '学情分析失败' };
    }
    const reportId = analysis.reportId;

    // Step 3: exam 标记 analyzed
    await markExamAnalyzed(eduQuery(this.db), examId);

    // Step 4: 薄弱点 → 专项练习 + 学习计划
    const report = analysis.report ?? { weakPoints: [], answerAnalysis: [] };
    const weakPoints = (report.weakPoints || []) as string[];
    const practiceSet = await this.generator.generatePracticeSet({ knowledgePoint: weakPoints[0] ?? null, subject, gradeLevel, targetCount: 5 });

    const plan = await this.plan.generatePlan({ userId, planType: 'daily', analysisReport: report });

    return {
      status: useReal ? 'analyzed' : 'mock',
      result: 'analyzed',
      examId,
      reportId,
      report,
      practiceSet: practiceSet.questions ?? [],
      plan: plan.plan ?? null,
    };
  }
}