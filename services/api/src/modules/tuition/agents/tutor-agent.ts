import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { LlmClient } from '@gri/agent-core';
import { llmTimeoutMs } from './llm-provider';
import { eduQuery, avgPlanScore, avgPeerScore, insertAnalysisReport } from '../../edu-core/repository';

export type TutorQuestionType = 'choice' | 'fill' | 'solution';

/**
 * parser 产出 `single_choice` / `multiple_choice` / `fill_blank` / `solution`，
 * TutorAgent 的分析分桶使用 `choice` / `fill` / `solution`。在消费边界统一归一，
 * 避免未知题型被 byType 静默跳过。
 */
export function normalizeTutorQuestionType(type: unknown): TutorQuestionType | null {
  if (typeof type !== 'string') return null;
  switch (type.trim().toLowerCase()) {
    case 'choice':
    case 'single_choice':
    case 'multiple_choice':
    case 'multiple-choice':
      return 'choice';
    case 'fill':
    case 'fill_blank':
    case 'text':
      return 'fill';
    case 'solution':
    case 'short-answer':
    case 'short_answer':
    case 'essay':
      return 'solution';
    default:
      return null;
  }
}

/**
 * TutorAgent（移植旧 TutorAgent.js）：学情分析。
 * 答案校验/知识点掌握度/Bloom 能力维/错误归因/同龄对比/AI 建议，
 * 结果持久化到 edu.analysis_reports（user_id 定位，杜绝越权）。
 * 无 LLM key → 能力维/错误归因/AI 建议走本地规则（同形，不再是 pending 占位）。
 */
@Injectable()
export class TutorAgent {
  constructor(
    private readonly db: DatabaseService,
    private readonly llm: LlmClient,
  ) {}

  async analyzeExam(params: {
    userId: string;
    examId: string;
    questions: any[];
    studentAnswers: string[];
    subject?: string;
    gradeLevel?: string;
  }) {
    const { userId, examId, questions = [], studentAnswers = [], subject = 'math', gradeLevel = '8' } = params;

    try {
      const answerAnalysis = this._analyzeAnswers(questions, studentAnswers);
      const knowledgePoints = await this._analyzeKnowledgePoints(questions, studentAnswers, gradeLevel);
      const abilityDims = await this._analyzeAbilityDimensions(questions, studentAnswers, gradeLevel);
      const errorAttribution = await this._analyzeErrorAttribution(questions, studentAnswers);
      const peerComparison = await this._getPeerComparison(userId, gradeLevel, subject);
      const aiSuggestions = await this._generateSuggestions({ knowledgePoints, abilityDims, errorAttribution, peerComparison });
      const weakPoints = knowledgePoints.filter((kp: any) => kp.level === '薄弱').map((kp: any) => kp.name);
      const strongPoints = knowledgePoints.filter((kp: any) => kp.level === '熟练').map((kp: any) => kp.name);

      const reportId = await this._saveReport({
        userId,
        examId,
        knowledgePoints,
        abilityDims,
        errorAttribution,
        peerComparison,
        aiSuggestions,
        weakPoints,
        strongPoints,
      });

      return {
        success: true,
        reportId,
        report: {
          answerAnalysis,
          knowledgePoints,
          abilityDims,
          errorAttribution,
          peerComparison,
          aiSuggestions,
          weakPoints,
          strongPoints,
        },
      };
    } catch (error) {
      return { success: false, error: (error as Error)?.message };
    }
  }

  _checkAnswer(question: any, studentAnswer: any): boolean {
    if (!studentAnswer) return false;
    const correct = question?.answer?.toString().toLowerCase().trim();
    const student = studentAnswer.toString().toLowerCase().trim();
    const type = normalizeTutorQuestionType(question?.type);

    if (type === 'choice') {
      if (!correct) return student === '';
      return student.toUpperCase() === correct.toUpperCase() || (correct && student.includes(correct)) || (student && correct.includes(student));
    }
    if (type === 'fill') {
      const correctNum = parseFloat(correct);
      const studentNum = parseFloat(student);
      if (!isNaN(correctNum) && !isNaN(studentNum)) {
        return Math.abs(correctNum - studentNum) / (Math.abs(correctNum) + 0.001) < 0.01;
      }
    }
    if (!correct) return student === '';
    return student === correct || (correct && student.includes(correct)) || (student && correct.includes(student));
  }

  private _analyzeAnswers(questions: any[], studentAnswers: string[]) {
    const analysis: any = {
      total: questions.length,
      correct: 0,
      incorrect: 0,
      byType: { choice: { correct: 0, total: 0 }, fill: { correct: 0, total: 0 }, solution: { correct: 0, total: 0 } },
      details: [],
    };
    questions.forEach((q, index) => {
      const answer = studentAnswers[index];
      const isCorrect = this._checkAnswer(q, answer);
      if (isCorrect) analysis.correct++;
      else analysis.incorrect++;
      const type = normalizeTutorQuestionType(q.type);
      if (type && analysis.byType[type]) {
        analysis.byType[type].total++;
        if (isCorrect) analysis.byType[type].correct++;
      }
      analysis.details.push({ questionId: q.id, isCorrect, studentAnswer: answer, correctAnswer: q.answer, knowledgePoint: q.knowledgePoint });
    });
    analysis.accuracy = analysis.total > 0 ? Math.round((analysis.correct / analysis.total) * 100) : 0;
    return analysis;
  }

  private async _analyzeKnowledgePoints(questions: any[], studentAnswers: string[], gradeLevel: string) {
    const map = new Map<string, any>();
    questions.forEach((q, index) => {
      const kp = q.knowledgePoint || 'unknown';
      const isCorrect = this._checkAnswer(q, studentAnswers[index]);
      if (!map.has(kp)) map.set(kp, { name: kp, total: 0, correct: 0, questions: [] });
      const data = map.get(kp);
      data.total++;
      if (isCorrect) data.correct++;
      data.questions.push({ questionId: q.id, isCorrect, content: q.content?.substring(0, 50) });
    });

    const gradeNum = parseInt(gradeLevel, 10) || 8;
    const thresholds =
      gradeNum <= 4 ? { 熟练: 0.7, 了解: 0.4 } : gradeNum <= 6 ? { 熟练: 0.75, 了解: 0.45 } : gradeNum <= 9 ? { 熟练: 0.8, 了解: 0.5 } : { 熟练: 0.85, 了解: 0.55 };

    return Array.from(map.values()).map((kp: any) => {
      const rate = kp.total > 0 ? kp.correct / kp.total : 0;
      let level = '薄弱';
      if (rate >= thresholds['熟练']) level = '熟练';
      else if (rate >= thresholds['了解']) level = '了解';
      return { id: kp.name, name: kp.name, mastery: parseFloat(rate.toFixed(2)), level, totalQuestions: kp.total, correctCount: kp.correct };
    });
  }

  private async _analyzeAbilityDimensions(questions: any[], studentAnswers: string[], _gradeLevel: string): Promise<any> {
    const prompt = `请分析以下题目所考察的能力维度（Bloom 分类法）：

${questions
  .map((q, i) => `
题目${i + 1}: ${q.content?.substring(0, 100)}
答案：${q.answer}
学生答案：${studentAnswers[i] || '未作答'}
答对：${this._checkAnswer(q, studentAnswers[i]) ? '是' : '否'}
`)
  .join('\n')}

请以 JSON 格式返回各维度得分（0-1）：
{"memory": 0.8, "understanding": 0.7, "application": 0.6, "analysis": 0.5, "synthesis": 0.4}`;
    const fallback = { memory: 0.5, understanding: 0.5, application: 0.5, analysis: 0.5, synthesis: 0.5 };
    if (!(await this.llm.isRealKey())) return fallback;
    try {
      const result = await this.llm.chat(
        [
          { role: 'system', content: '你是教育测量专家，负责分析学生的能力维度。' },
          { role: 'user', content: prompt },
        ],
        'default',
        { timeoutMs: llmTimeoutMs() },
      );
      const parsed = this._parseJsonObject(result.content);
      return parsed || fallback;
    } catch {
      return fallback;
    }
  }

  private async _analyzeErrorAttribution(questions: any[], studentAnswers: string[]) {
    const errorTypes: Record<string, number> = { '概念不清': 0, '计算错误': 0, '审题失误': 0, '粗心大意': 0 };
    const errorQuestions = questions.filter((q, i) => !this._checkAnswer(q, studentAnswers[i]));
    if (errorQuestions.length === 0) return { ...errorTypes, total: 0 };

    if (!(await this.llm.isRealKey())) return { ...errorTypes, total: errorQuestions.length };

    const prompt = `请分析以下错误答案的原因类型：
${errorQuestions
  .map((q, i) => `
题目：${q.content?.substring(0, 100)}
正确答案：${q.answer}
学生答案：${studentAnswers[i]}
`)
  .join('\n')}
错误类型：概念不清/计算错误/审题失误/粗心大意
请统计各类型的数量，返回 JSON：{"概念不清": 1, "计算错误": 2, "审题失误": 0, "粗心大意": 1}`;

    return this._attributionFromLlm(prompt, errorTypes, errorQuestions.length);
  }

  private async _attributionFromLlm(prompt: string, errorTypes: Record<string, number>, total: number) {
    try {
      const result = await this.llm.chat(
        [
          { role: 'system', content: '你是教育心理学家，擅长分析学生的错误原因。' },
          { role: 'user', content: prompt },
        ],
        'default',
        { timeoutMs: llmTimeoutMs() },
      );
      const parsed = this._parseJsonObject(result.content);
      if (parsed) return { ...errorTypes, ...parsed, total };
    } catch {
      /* fall to default attribution */
    }
    return { ...errorTypes, total };
  }

  private async _getPeerComparison(userId: string, gradeLevel: string, subject: string) {
    try {
      const studentResult = await avgPlanScore(eduQuery(this.db), userId);
      const peerResult = await avgPeerScore(eduQuery(this.db), gradeLevel, subject, userId);
      const peerAvg = peerResult?.avg_score || 0.65;
      const studentAvg = studentResult?.avg_score || 0.6;
      return { percentile: this._calculatePercentile(studentAvg, peerAvg), studentAvg: parseFloat(studentAvg.toFixed(2)), peerAvg: parseFloat(peerAvg.toFixed(2)), gradeLevel };
    } catch {
      return { percentile: 50, studentAvg: 0.6, peerAvg: 0.6, gradeLevel };
    }
  }

  private _calculatePercentile(studentScore: number, peerAvg: number): number {
    const diff = studentScore - peerAvg;
    return Math.max(0, Math.min(100, Math.round(50 + diff * 100)));
  }

  private async _generateSuggestions(context: {
    knowledgePoints: any[];
    abilityDims: any;
    errorAttribution: Record<string, number>;
    peerComparison: any;
  }): Promise<string[]> {
    const fallback = ['加强基础知识点复习', '多做题提高熟练度', '整理错题本定期复习'];
    if (!(await this.llm.isRealKey())) return fallback;

    const { knowledgePoints, abilityDims, errorAttribution, peerComparison } = context;
    const prompt = `请根据以下学情分析结果，给出学习建议：

知识点掌握情况：
${knowledgePoints.map((kp) => `- ${kp.name}: ${kp.level} (${kp.mastery * 100}%)`).join('\n')}

能力维度：
- 记忆：${abilityDims.memory?.toFixed(2) || 0}
- 理解：${abilityDims.understanding?.toFixed(2) || 0}
- 应用：${abilityDims.application?.toFixed(2) || 0}
- 分析：${abilityDims.analysis?.toFixed(2) || 0}
- 综合：${abilityDims.synthesis?.toFixed(2) || 0}

错误归因：
${Object.entries(errorAttribution).filter(([k]) => k !== 'total').map(([k, v]) => `- ${k}: ${v}次`).join('\n')}

同龄人对比：百分位 ${peerComparison.percentile}

请给出 3 条具体建议，每条不超过 50 字。返回 JSON 数组：["建议 1", "建议 2", "建议 3"]`;
    try {
      const result = await this.llm.chat(
        [
          { role: 'system', content: '你是资深教育专家，擅长根据学情给出针对性建议。' },
          { role: 'user', content: prompt },
        ],
        'default',
        { timeoutMs: llmTimeoutMs() },
      );
      const m = result.content?.match(/\[[\s\S]*\]/);
      if (m) return JSON.parse(m[0]);
      return fallback;
    } catch {
      return fallback;
    }
  }

  private async _saveReport(params: {
    userId: string;
    examId: string;
    knowledgePoints: any[];
    abilityDims: any;
    errorAttribution: any;
    peerComparison: any;
    aiSuggestions: string[];
    weakPoints: string[];
    strongPoints: string[];
  }) {
    const { userId, examId, knowledgePoints, abilityDims, errorAttribution, peerComparison, aiSuggestions, weakPoints, strongPoints } = params;
    return (await insertAnalysisReport(eduQuery(this.db), {
      examId,
      userId,
      knowledgePoints,
      abilityDims,
      errorAttribution,
      peerPercentile: peerComparison.percentile,
      peerAvgScore: peerComparison.peerAvg,
      studentScore: peerComparison.studentAvg,
      aiSuggestions,
      weakPoints,
      strongPoints,
    })) ?? undefined;
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
}
