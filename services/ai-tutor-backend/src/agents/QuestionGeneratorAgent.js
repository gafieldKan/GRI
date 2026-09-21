/**
 * QuestionGeneratorAgent - 动态出题 Agent
 *
 * 功能:
 * 1. 按年级/学科/教材版本出题
 * 2. 按难度分级 (基础/提高/冲刺)
 * 3. 按知识点出题
 * 4. 支持题型控制 (选择/填空/解答)
 * 5. 实时生成，不依赖预置题库
 */

import { AIService } from '../modules/ai/AIService.js';

// 教材版本常量
export const TEXTBOOK_VERSIONS = {
  RENJIAO: '人教版',
  BEISHIDA: '北师大版',
  SUJIAO: '苏教版',
  YUEJIAO: '粤教版',
  LUJIAO: '鲁教版'
};

// 学科常量
export const SUBJECTS = {
  MATH: 'math',
  CHINESE: 'chn',
  ENGLISH: 'eng',
  PHYSICS: 'phys',
  CHEMISTRY: 'chem',
  BIOLOGY: 'bio',
  HISTORY: 'hist',
  GEOGRAPHY: 'geo',
  POLITICS: 'pol'
};

// 年级常量 (K1-K12)
export const GRADE_LEVELS = {
  PRIMARY: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'],
  JUNIOR: ['K7', 'K8', 'K9'],
  SENIOR: ['K10', 'K11', 'K12']
};

export class QuestionGeneratorAgent {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.aiService = new AIService();
  }

  /**
   * 生成题目（主入口）
   * @param {Object} params - 参数
   * @param {string} params.subject - 学科
   * @param {string} params.gradeLevel - 年级 (K1-K12)
   * @param {string} params.textbookVersion - 教材版本
   * @param {string} params.knowledgePoint - 知识点
   * @param {number} params.difficulty - 难度 (0.1-1.0)
   * @param {string} params.questionType - 题型 (choice/fill/solution)
   * @param {number} params.count - 题目数量
   * @returns {Promise<Object>} 生成的题目
   */
  async generateQuestions(params) {
    const {
      subject = 'math',
      gradeLevel = 'K8',
      textbookVersion = '人教版',
      knowledgePoint = null,
      difficulty = 0.5,
      questionType = 'all',
      count = 1
    } = params;

    try {
      const questions = [];

      for (let i = 0; i < count; i++) {
        const question = await this._generateSingleQuestion({
          subject,
          gradeLevel,
          textbookVersion,
          knowledgePoint,
          difficulty,
          questionType
        });
        questions.push(question);
      }

      return {
        success: true,
        questions,
        metadata: {
          subject,
          gradeLevel,
          textbookVersion,
          knowledgePoint,
          difficulty,
          count: questions.length
        }
      };
    } catch (error) {
      console.error('[QuestionGenerator] 出题失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 生成单道题目
   */
  async _generateSingleQuestion(params) {
    const {
      subject,
      gradeLevel,
      textbookVersion,
      knowledgePoint,
      difficulty,
      questionType
    } = params;

    // 构建 Prompt
    const prompt = this._buildPrompt({
      subject,
      gradeLevel,
      textbookVersion,
      knowledgePoint,
      difficulty,
      questionType
    });

    const messages = [
      { role: 'system', content: '你是资深 K12 教育专家，负责生成高质量的学科题目。' },
      { role: 'user', content: prompt }
    ];

    try {
      const result = await this.aiService._callLLM(messages, 'WAIT_START');
      const content = result.content;

      // 解析 JSON
      const question = this._parseQuestionJSON(content, subject);
      return question;
    } catch (error) {
      console.error('[QuestionGenerator] 单题生成失败:', error);
      return this._getMockQuestion(subject, knowledgePoint);
    }
  }

  /**
   * 构建出题 Prompt
   */
  _buildPrompt(params) {
    const {
      subject,
      gradeLevel,
      textbookVersion,
      knowledgePoint,
      difficulty,
      questionType
    } = params;

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

  /**
   * 解析生成的题目 JSON
   */
  _parseQuestionJSON(content, subject) {
    try {
      // 提取 JSON
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          id: `auto_${Date.now()}`,
          type: parsed.type || 'fill',
          content: parsed.content || content,
          options: parsed.options || [],
          answer: parsed.answer || '',
          explanation: parsed.explanation || '',
          knowledgePoint: parsed.knowledgePoint || '',
          difficulty: parsed.difficulty || 0.5,
          subject
        };
      }

      // 解析失败时返回结构化内容
      return {
        id: `auto_${Date.now()}`,
        type: 'fill',
        content: content,
        options: [],
        answer: '',
        explanation: '',
        knowledgePoint: '',
        difficulty: 0.5,
        subject
      };
    } catch {
      return this._getMockQuestion(subject, '');
    }
  }

  /**
   * 获取学科名称
   */
  _getSubjectName(subject) {
    const names = {
      math: '数学',
      chn: '语文',
      eng: '英语',
      phys: '物理',
      chem: '化学',
      bio: '生物',
      hist: '历史',
      geo: '地理',
      pol: '政治'
    };
    return names[subject] || '学科';
  }

  /**
   * 难度文本转换
   */
  _getDifficultyText(difficulty) {
    if (difficulty <= 0.3) return '基础';
    if (difficulty <= 0.7) return '提高';
    return '冲刺/竞赛';
  }

  /**
   * Mock 题目（备用）
   */
  _getMockQuestion(subject, knowledgePoint) {
    const mockQuestions = {
      math: {
        content: '已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。',
        answer: '5',
        type: 'fill',
        explanation: '根据勾股定理：a² + b² = c²，代入得 3² + 4² = 9 + 16 = 25，所以 c = 5'
      },
      chn: {
        content: '"床前明月光"是哪位诗人的诗句？',
        answer: '李白',
        type: 'fill',
        explanation: '出自李白《静夜思》'
      },
      eng: {
        content: 'What is the past tense of "go"?',
        answer: 'went',
        type: 'fill',
        explanation: 'go 的过去式是 went'
      },
      phys: {
        content: '物体自由落体的加速度约为多少 m/s²？',
        answer: '9.8',
        type: 'fill',
        explanation: '重力加速度 g≈9.8m/s²'
      }
    };

    const base = mockQuestions[subject] || mockQuestions.math;
    return {
      id: `auto_${Date.now()}`,
      ...base,
      knowledgePoint: knowledgePoint || '基础知识',
      difficulty: 0.5,
      options: []
    };
  }

  /**
   * 生成变式题（基于原题生成相似题）
   */
  async generateVariant(originalQuestion, params = {}) {
    const { subject, difficultyChange = 0 } = params;

    const prompt = `请根据以下题目生成一道变式题（改变数值或场景，但考察相同的知识点）：

原题：
${originalQuestion.content}

答案：${originalQuestion.answer}
解析：${originalQuestion.explanation}

要求：
- 保持知识点相同
- 改变题目数值或场景
- 难度${difficultyChange > 0 ? '提高' : '保持相当'}

返回 JSON 格式：
{
  "content": "新题目内容",
  "answer": "新答案",
  "explanation": "新解析"
}`;

    try {
      const messages = [
        { role: 'system', content: '你是教育专家，擅长生成变式题目。' },
        { role: 'user', content: prompt }
      ];

      const result = await this.aiService._callLLM(messages, 'WAIT_START');
      const content = result.content;

      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        const variant = JSON.parse(jsonMatch[0]);
        return {
          id: `variant_${Date.now()}`,
          type: originalQuestion.type,
          subject: subject || 'math',
          knowledgePoint: originalQuestion.knowledgePoint,
          ...variant,
          difficulty: originalQuestion.difficulty + difficultyChange * 0.1
        };
      }

      return this._getMockQuestion(subject, originalQuestion.knowledgePoint);
    } catch {
      return this._getMockQuestion(subject, originalQuestion.knowledgePoint);
    }
  }

  /**
   * 生成专项练习题组（针对薄弱知识点）
   */
  async generatePracticeSet(params) {
    const {
      subject,
      gradeLevel,
      textbookVersion,
      knowledgePoint,
      targetCount = 5,
      difficultyProgression = true
    } = params;

    const questions = [];
    let currentDifficulty = 0.3; // 从基础开始

    for (let i = 0; i < targetCount; i++) {
      // 难度递进
      if (difficultyProgression && i > 0) {
        currentDifficulty = Math.min(0.9, currentDifficulty + 0.15);
      }

      const question = await this._generateSingleQuestion({
        subject,
        gradeLevel,
        textbookVersion,
        knowledgePoint,
        difficulty: currentDifficulty,
        questionType: 'all'
      });

      questions.push(question);
    }

    return {
      success: true,
      knowledgePoint,
      questions,
      metadata: {
        subject,
        gradeLevel,
        textbookVersion,
        count: questions.length,
        difficultyRange: [0.3, currentDifficulty]
      }
    };
  }
}
