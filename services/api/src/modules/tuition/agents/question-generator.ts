import { Injectable } from '@nestjs/common';
import { LlmClient } from '@gri/agent-core';
import { llmTimeoutMs } from './llm-provider';

/**
 * QuestionGeneratorAgent（移植旧 QuestionGeneratorAgent.js）。
 * 动态出题（不依赖预置题库）；无 key → 明确返回示意题（不再是 pending 占位）。
 */
@Injectable()
export class QuestionGeneratorAgent {
  constructor(private readonly llm: LlmClient) {}

  async generateQuestions(params: {
    subject?: string;
    gradeLevel?: string;
    textbookVersion?: string;
    knowledgePoint?: string | null;
    difficulty?: number;
    questionType?: string;
    count?: number;
  }) {
    const {
      subject = 'math',
      gradeLevel = 'K8',
      textbookVersion = '人教版',
      knowledgePoint = null,
      difficulty = 0.5,
      questionType = 'all',
      count = 1,
    } = params;

    try {
      const questions = [];
      for (let i = 0; i < count; i++) {
        questions.push(
          await this._generateSingleQuestion({ subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, questionType }),
        );
      }
      return {
        success: true,
        questions,
        metadata: { subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, count: questions.length },
      };
    } catch (error) {
      return { success: false, error: (error as Error)?.message };
    }
  }

  private async _generateSingleQuestion(params: {
    subject: string;
    gradeLevel: string;
    textbookVersion: string;
    knowledgePoint: string | null;
    difficulty: number;
    questionType: string;
  }): Promise<any> {
    if (!(await this.llm.isRealKey())) return this._getMockQuestion(params.subject, params.knowledgePoint ?? '');

    const { subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, questionType } = params;
    const prompt = this._buildPrompt({ subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, questionType });

    try {
      const result = await this.llm.chat(
        [
          { role: 'system', content: '你是资深 K12 教育专家，负责生成高质量的学科题目。' },
          { role: 'user', content: prompt },
        ],
        'default',
        { timeoutMs: llmTimeoutMs() },
      );
      const parsed = this._parseQuestionJSON(result.content);
      if (parsed) {
        parsed.subject = subject;
        return parsed;
      }
      return this._fallbackFetchQuestion(subject);
    } catch {
      return this._getMockQuestion(subject, knowledgePoint || '');
    }
  }

  private _buildPrompt(params: {
    subject: string;
    gradeLevel: string;
    textbookVersion: string;
    knowledgePoint: string | null;
    difficulty: number;
    questionType: string;
  }) {
    const { subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, questionType } = params;
    const subjectName = this._getSubjectName(subject);
    const difficultyText = this._getDifficultyText(difficulty);
    return `请生成一道${subjectName}题目，要求如下：

适用年级：${gradeLevel}
教材版本：${textbookVersion}
知识点：${knowledgePoint || '根据年级自动生成'}
难度等级：${difficultyText}
题型要求：${questionType === 'all' ? '选择题或填空题' : questionType}

请以 JSON 格式返回：
{
  "id": "auto_q1",
  "type": "choice|fill|solution",
  "content": "题目内容",
  "options": ["选项 A", "选项 B", "选项 C", "选项 D"],
  "answer": "正确答案",
  "explanation": "详细解析",
  "knowledgePoint": "知识点名称",
  "difficulty": 0.5
}

注意：
- 选择题必须有 4 个选项
- 填空题答案简洁明确
- 解析要详细易懂
- 公式使用 LaTeX 格式`;
  }

  private _parseQuestionJSON(content: string): any | null {
    const m = content?.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const parsed = JSON.parse(m[0]);
      return {
        id: `auto_${Date.now()}`,
        type: parsed.type || 'fill',
        content: parsed.content || content,
        options: parsed.options || [],
        answer: parsed.answer || '',
        explanation: parsed.explanation || '',
        knowledgePoint: parsed.knowledgePoint || '',
        difficulty: parsed.difficulty || 0.5,
      };
    } catch {
      return null;
    }
  }

  private _fallbackFetchQuestion(subject: string) {
    // LLM 返回但 JSON 解析失败 → 结构化内容兜底
    return { id: `auto_${Date.now()}`, type: 'fill', content: '', options: [], answer: '', explanation: '', knowledgePoint: '', difficulty: 0.5, subject };
  }

  private _getSubjectName(subject: string): string {
    const names: Record<string, string> = { math: '数学', chn: '语文', eng: '英语', phys: '物理', chem: '化学', bio: '生物', hist: '历史', geo: '地理', pol: '政治' };
    return names[subject] || '学科';
  }

  private _getDifficultyText(difficulty: number): string {
    if (difficulty <= 0.3) return '基础';
    if (difficulty <= 0.7) return '提高';
    return '冲刺/竞赛';
  }

  private _getMockQuestion(subject: string, knowledgePoint: string): any {
    const mock: Record<string, any> = {
      math: { content: '已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。', answer: '5', type: 'fill', explanation: '根据勾股定理：a² + b² = c²，代入得 3² + 4² = 9 + 16 = 25，所以 c = 5' },
      chn: { content: '"床前明月光"是哪位诗人的诗句？', answer: '李白', type: 'fill', explanation: '出自李白《静夜思》' },
      eng: { content: 'What is the past tense of "go"?', answer: 'went', type: 'fill', explanation: 'go 的过去式是 went' },
      phys: { content: '物体自由落体的加速度约为多少 m/s²？', answer: '9.8', type: 'fill', explanation: '重力加速度 g≈9.8m/s²' },
    };
    const base = mock[subject] || mock.math;
    return { id: `auto_${Date.now()}`, ...base, knowledgePoint: knowledgePoint || '基础知识', difficulty: 0.5, options: [], subject };
  }

  /** 专项练习（针对薄弱知识点，难度递进）。 */
  async generatePracticeSet(params: {
    subject?: string;
    gradeLevel?: string;
    textbookVersion?: string;
    knowledgePoint?: string | null;
    targetCount?: number;
    difficultyProgression?: boolean;
  }) {
    const { subject = 'math', gradeLevel = 'K8', textbookVersion = '人教版', knowledgePoint = null, targetCount = 5, difficultyProgression = true } = params;
    const questions = [];
    let currentDifficulty = 0.3;
    for (let i = 0; i < targetCount; i++) {
      if (difficultyProgression && i > 0) currentDifficulty = Math.min(0.9, currentDifficulty + 0.15);
      questions.push(
        await this._generateSingleQuestion({ subject, gradeLevel, textbookVersion, knowledgePoint, difficulty: currentDifficulty, questionType: 'all' }),
      );
    }
    return { success: true, knowledgePoint, questions, metadata: { subject, gradeLevel, textbookVersion, count: questions.length, difficultyRange: [0.3, currentDifficulty] } };
  }
}