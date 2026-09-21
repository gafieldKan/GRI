/**
 * 题目服务层
 *
 * 负责:
 * - 题目管理 (CRUD)
 * - 题目与知识点关联
 * - 难度分级
 * - 变式题生成
 * - 支持诊断题、教学题、测验题
 */

// 数据库连接 (可选)
let dbPool = null;

export class QuestionService {
  constructor(dbPoolInstance = null) {
    // 模拟题库 (实际应该从数据库读取)
    this.questions = new Map();
    this._initMockQuestions();

    // 数据库连接池
    dbPool = dbPoolInstance;
    console.log('[QuestionService] 初始化，数据库连接:', !!dbPool);
  }

  /**
   * 初始化模拟题库
   */
  _initMockQuestions() {
    const pythagoreanQuestions = [
      {
        id: 'q1',
        knowledgePointId: 'pythagorean',
        content: '直角三角形的两条直角边分别是 3 和 4，斜边长是多少？',
        answer: '5',
        type: 'fill',
        difficulty: 1,
        options: null,
        explanation: '根据勾股定理：$a^2 + b^2 = c^2$，所以 $c = \\sqrt{3^2 + 4^2} = \\sqrt{9 + 16} = \\sqrt{25} = 5$'
      },
      {
        id: 'q2',
        knowledgePointId: 'pythagorean',
        content: '以下哪组数可以构成直角三角形的三边？',
        answer: 'A',
        type: 'choice',
        difficulty: 2,
        options: ['3, 4, 5', '2, 3, 4', '5, 6, 7', '4, 5, 6'],
        explanation: '只有 3, 4, 5 满足勾股定理：$3^2 + 4^2 = 9 + 16 = 25 = 5^2$'
      },
      {
        id: 'q3',
        knowledgePointId: 'pythagorean',
        content: '直角三角形的斜边长为 13，一条直角边长为 5，另一条直角边长是多少？',
        answer: '12',
        type: 'fill',
        difficulty: 2,
        options: null,
        explanation: '设另一条直角边为 x，则 $x^2 + 5^2 = 13^2$，$x^2 = 169 - 25 = 144$，$x = 12$'
      }
    ];

    for (const q of pythagoreanQuestions) {
      this.questions.set(q.id, q);
    }
  }

  /**
   * 根据知识点 ID 和类型获取题目 (支持数据库查询)
   */
  async getQuestionsByType(knowledgePointId, type = 'diagnosis', count = 3) {
    // 如果有数据库连接，优先使用数据库
    if (dbPool) {
      try {
        const client = await dbPool.connect();
        const res = await client.query(
          'SELECT id, content, answer, type, difficulty, options, explanation FROM questions WHERE knowledge_point_id = $1 AND variant_of = $2 LIMIT $3',
          [knowledgePointId, type, count]
        );
        client.release();

        // 输出查询结果
        console.log(`[QuestionService] 查询 ${knowledgePointId} ${type}: ${res.rows?.length || 0}道题`);

        // 返回格式化数据
        return (res.rows || []).map(row => ({
          id: row.id,
          content: row.content,
          answer: row.answer,
          type: row.type || 'fill',
          difficulty: parseInt(row.difficulty) || 1,
          options: row.options ? (Array.isArray(row.options) ? row.options : JSON.parse(row.options || '[]')) : null,
          explanation: row.explanation
        }));
      } catch (e) {
        console.error('[QuestionService] 数据库查询失败:', e);
      }
    }

    // 否则使用内置题库
    const questions = this._getQuestionsByKnowledgePoint(knowledgePointId, count);
    return questions.map(q => ({
      id: q.id,
      content: q.content,
      answer: q.answer,
      type: q.type,
      difficulty: q.difficulty,
      options: q.options,
      explanation: q.explanation
    }));
  }

  /**
   * 根据知识点 ID 获取诊断题目
   */
  async getDiagnosisQuestions(knowledgePointId) {
    return await this.getQuestionsByType(knowledgePointId, 'diagnosis', 3);
  }

  /**
   * 根据知识点 ID 获取测验题目
   */
  async getQuizQuestions(knowledgePointId, count = 3) {
    return await this.getQuestionsByType(knowledgePointId, 'quiz', count);
  }

  /**
   * 根据知识点 ID 获取教学题目
   */
  async getTeachingQuestions(knowledgePointId) {
    return await this.getQuestionsByType(knowledgePointId, 'teaching', 2);
  }

  /**
   * 根据知识点 ID 获取题目
   */
  _getQuestionsByKnowledgePoint(knowledgePointId, count) {
    const result = [];
    for (const q of this.questions.values()) {
      if (q.knowledgePointId === knowledgePointId) {
        result.push(q);
        if (result.length >= count) break;
      }
    }
    return result;
  }

  /**
   * 验证答案
   */
  async verifyAnswer(questionId, answer) {
    const question = this.questions.get(questionId);
    if (!question) {
      return { correct: false, error: '题目不存在' };
    }

    const isCorrect = answer.trim().toLowerCase() === question.answer.toLowerCase();

    return {
      correct: isCorrect,
      correctAnswer: question.answer,
      explanation: question.explanation,
      knowledgePointId: question.knowledgePointId
    };
  }

  /**
   * 添加题目
   */
  async addQuestion(questionData) {
    const question = {
      id: `q_${Date.now()}`,
      ...questionData
    };
    this.questions.set(question.id, question);
    return question;
  }

  /**
   * 删除题目
   */
  async deleteQuestion(questionId) {
    return this.questions.delete(questionId);
  }

  /**
   * 更新题目
   */
  async updateQuestion(questionId, updates) {
    const question = this.questions.get(questionId);
    if (!question) {
      return null;
    }
    const updated = { ...question, ...updates };
    this.questions.set(questionId, updated);
    return updated;
  }
}
