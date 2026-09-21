/**
 * TutorAgent - 学情分析 Agent
 *
 * 功能：
 * 1. 知识点掌握度分析（熟练/了解/薄弱）
 * 2. 能力维度分析（Bloom 分类法）
 * 3. 错误类型归因（概念不清/计算错误/审题失误）
 * 4. 同年级对比分析
 * 5. 历史趋势分析
 * 6. 生成学习建议
 */

import { AIService } from '../modules/ai/AIService.js';

export class TutorAgent {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.aiService = new AIService();
  }

  /**
   * 生成学情分析报告（主入口）
   */
  async analyzeExam(params) {
    const {
      studentId,
      examId,
      questions = [],
      studentAnswers = [],
      subject = 'math',
      gradeLevel = '8'
    } = params;

    try {
      // Step 1: 答案校验与分类
      const answerAnalysis = this._analyzeAnswers(questions, studentAnswers);

      // Step 2: 知识点掌握度分析
      const knowledgePoints = await this._analyzeKnowledgePoints(questions, studentAnswers, gradeLevel);

      // Step 3: 能力维度分析（Bloom 分类法）
      const abilityDims = await this._analyzeAbilityDimensions(questions, studentAnswers, gradeLevel);

      // Step 4: 错误类型归因
      const errorAttribution = await this._analyzeErrorAttribution(questions, studentAnswers);

      // Step 5: 同年级对比（需要历史数据）
      const peerComparison = await this._getPeerComparison(studentId, gradeLevel, subject);

      // Step 6: 生成 AI 建议
      const aiSuggestions = await this._generateSuggestions({
        knowledgePoints,
        abilityDims,
        errorAttribution,
        peerComparison,
        studentAnswers
      });

      // Step 7: 识别薄弱点和优势点
      const weakPoints = knowledgePoints.filter(kp => kp.level === '薄弱').map(kp => kp.name);
      const strongPoints = knowledgePoints.filter(kp => kp.level === '熟练').map(kp => kp.name);

      // Step 8: 持久化报告
      const reportId = await this._saveReport({
        studentId,
        examId,
        knowledgePoints,
        abilityDims,
        errorAttribution,
        peerComparison,
        aiSuggestions,
        weakPoints,
        strongPoints
      });

      return {
        success: true,
        reportId,
        report: {
          knowledgePoints,
          abilityDims,
          errorAttribution,
          peerComparison,
          aiSuggestions,
          weakPoints,
          strongPoints
        }
      };
    } catch (error) {
      console.error('[TutorAgent] 学情分析失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 答案校验与分类
   */
  _analyzeAnswers(questions, studentAnswers) {
    const analysis = {
      total: questions.length,
      correct: 0,
      incorrect: 0,
      byType: {
        choice: { correct: 0, total: 0 },
        fill: { correct: 0, total: 0 },
        solution: { correct: 0, total: 0 }
      },
      details: []
    };

    questions.forEach((q, index) => {
      const answer = studentAnswers[index];
      const isCorrect = this._checkAnswer(q, answer);

      if (isCorrect) {
        analysis.correct++;
      } else {
        analysis.incorrect++;
      }

      if (q.type) {
        analysis.byType[q.type].total++;
        if (isCorrect) {
          analysis.byType[q.type].correct++;
        }
      }

      analysis.details.push({
        questionId: q.id,
        isCorrect,
        studentAnswer: answer,
        correctAnswer: q.answer,
        knowledgePoint: q.knowledgePoint
      });
    });

    analysis.accuracy = analysis.total > 0
      ? Math.round((analysis.correct / analysis.total) * 100)
      : 0;

    return analysis;
  }

  /**
   * 校验答案（兼容多种格式）
   */
  _checkAnswer(question, studentAnswer) {
    if (!studentAnswer) return false;

    const correct = question.answer?.toString().toLowerCase().trim();
    const student = studentAnswer.toString().toLowerCase().trim();

    // 选择题
    if (question.type === 'choice') {
      if (!correct) return student === '';
      return student.toUpperCase() === correct.toUpperCase() ||
             (correct && student.includes(correct)) ||
             (student && correct.includes(student));
    }

    // 填空题 - 数值比较（允许误差）
    if (question.type === 'fill') {
      const correctNum = parseFloat(correct);
      const studentNum = parseFloat(student);

      if (!isNaN(correctNum) && !isNaN(studentNum)) {
        return Math.abs(correctNum - studentNum) / (Math.abs(correctNum) + 0.001) < 0.01;
      }
    }

    // 文本比较
    if (!correct) return student === '';
    return student === correct ||
           (correct && student.includes(correct)) ||
           (student && correct.includes(student));
  }

  /**
   * 知识点掌握度分析
   */
  async _analyzeKnowledgePoints(questions, studentAnswers, gradeLevel) {
    const knowledgePointMap = new Map();

    // 按知识点分组统计
    questions.forEach((q, index) => {
      const kp = q.knowledgePoint || 'unknown';
      const isCorrect = this._checkAnswer(q, studentAnswers[index]);

      if (!knowledgePointMap.has(kp)) {
        knowledgePointMap.set(kp, { name: kp, total: 0, correct: 0, questions: [] });
      }

      const kpData = knowledgePointMap.get(kp);
      kpData.total++;
      if (isCorrect) kpData.correct++;
      kpData.questions.push({
        questionId: q.id,
        isCorrect,
        content: q.content?.substring(0, 50)
      });
    });

    // 计算掌握度（年级差异化阈值）
    const gradeNum = parseInt(gradeLevel) || 8;
    const thresholds = gradeNum <= 4
      ? { 熟练: 0.70, 了解: 0.40 }
      : gradeNum <= 6
      ? { 熟练: 0.75, 了解: 0.45 }
      : gradeNum <= 9
      ? { 熟练: 0.80, 了解: 0.50 }
      : { 熟练: 0.85, 了解: 0.55 };

    const result = Array.from(knowledgePointMap.values()).map(kp => {
      const rate = kp.total > 0 ? kp.correct / kp.total : 0;
      let level = '薄弱';
      if (rate >= thresholds['熟练']) level = '熟练';
      else if (rate >= thresholds['了解']) level = '了解';

      return {
        id: kp.name,
        name: kp.name,
        mastery: parseFloat(rate.toFixed(2)),
        level,
        totalQuestions: kp.total,
        correctCount: kp.correct
      };
    });

    return result;
  }

  /**
   * 能力维度分析（Bloom 分类法）
   */
  async _analyzeAbilityDimensions(questions, studentAnswers, gradeLevel) {
    const prompt = `请分析以下题目所考察的能力维度（Bloom 分类法）：

${questions.map((q, i) => `
题目${i + 1}: ${q.content?.substring(0, 100)}
答案：${q.answer}
学生答案：${studentAnswers[i] || '未作答'}
答对：${this._checkAnswer(q, studentAnswers[i]) ? '是' : '否'}
`).join('\n')}

请以 JSON 格式返回各维度得分（0-1）：
{
  "memory": 0.8,
  "understanding": 0.7,
  "application": 0.6,
  "analysis": 0.5,
  "synthesis": 0.4
}`;

    try {
      const messages = [
        { role: 'system', content: '你是教育测量专家，负责分析学生的能力维度。' },
        { role: 'user', content: prompt }
      ];

      const result = await this.aiService._callLLM(messages, 'WAIT_START');
      const content = result.content;

      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        memory: 0.5,
        understanding: 0.5,
        application: 0.5,
        analysis: 0.5,
        synthesis: 0.5
      };
    } catch (error) {
      console.error('[TutorAgent] 能力维度分析失败:', error);
      return {
        memory: 0.5,
        understanding: 0.5,
        application: 0.5,
        analysis: 0.5,
        synthesis: 0.5
      };
    }
  }

  /**
   * 错误类型归因
   */
  async _analyzeErrorAttribution(questions, studentAnswers) {
    const errorTypes = {
      '概念不清': 0,
      '计算错误': 0,
      '审题失误': 0,
      '粗心大意': 0
    };

    const errorQuestions = questions.filter((q, i) => !this._checkAnswer(q, studentAnswers[i]));

    if (errorQuestions.length === 0) {
      return { ...errorTypes, total: 0 };
    }

    const prompt = `请分析以下错误答案的原因类型：

${errorQuestions.map((q, i) => `
题目：${q.content?.substring(0, 100)}
正确答案：${q.answer}
学生答案：${studentAnswers[i]}
`).join('\n')}

错误类型：概念不清/计算错误/审题失误/粗心大意
请统计各类型的数量，返回 JSON：{"概念不清": 1, "计算错误": 2, "审题失误": 0, "粗心大意": 1}`;

    try {
      const messages = [
        { role: 'system', content: '你是教育心理学家，擅长分析学生的错误原因。' },
        { role: 'user', content: prompt }
      ];

      const result = await this.aiService._callLLM(messages, 'WAIT_START');
      const content = result.content;

      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...errorTypes,
          ...parsed,
          total: errorQuestions.length
        };
      }

      return { ...errorTypes, total: errorQuestions.length };
    } catch {
      return { ...errorTypes, total: errorQuestions.length };
    }
  }

  /**
   * 同年级对比
   */
  async _getPeerComparison(studentId, gradeLevel, subject) {
    try {
      const studentResult = await this.dbPool.query(
        `SELECT AVG((plan_data->>'score')::float) as avg_score
         FROM learning_plans
         WHERE student_id = $1`,
        [studentId]
      );

      // 查询同年级同科目其他学生的实际平均分
      const peerResult = await this.dbPool.query(
        `SELECT AVG(ar.student_score) as avg_score
         FROM analysis_reports ar
         JOIN exams e ON ar.exam_id = e.id
         WHERE e.grade_level = $1 AND e.subject = $2 AND ar.student_id != $3`,
        [gradeLevel, subject, studentId]
      );

      const peerAvg = peerResult.rows[0]?.avg_score || 0.65;
      const studentAvg = studentResult.rows[0]?.avg_score || 0.6;
      const percentile = this._calculatePercentile(studentAvg, peerAvg);

      return {
        percentile,
        studentAvg: parseFloat(studentAvg.toFixed(2)),
        peerAvg: parseFloat(peerAvg.toFixed(2)),
        gradeLevel
      };
    } catch (error) {
      console.error('[TutorAgent] 获取同龄人对比失败:', error);
      return {
        percentile: 50,
        studentAvg: 0.6,
        peerAvg: 0.6,
        gradeLevel
      };
    }
  }

  /**
   * 计算百分位
   */
  _calculatePercentile(studentScore, peerAvg) {
    const diff = studentScore - peerAvg;
    const percentile = Math.round(50 + (diff * 100));
    return Math.max(0, Math.min(100, percentile));
  }

  /**
   * 生成 AI 学习建议
   */
  async _generateSuggestions(context) {
    const { knowledgePoints, abilityDims, errorAttribution, peerComparison } = context;

    const prompt = `请根据以下学情分析结果，给出学习建议：

知识点掌握情况：
${knowledgePoints.map(kp => `- ${kp.name}: ${kp.level} (${kp.mastery * 100}%)`).join('\n')}

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
      const messages = [
        { role: 'system', content: '你是资深教育专家，擅长根据学情给出针对性建议。' },
        { role: 'user', content: prompt }
      ];

      const result = await this.aiService._callLLM(messages, 'WAIT_START');
      const content = result.content;

      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return ['加强基础知识点复习', '多做题提高熟练度', '整理错题本定期复习'];
    } catch {
      return ['加强基础知识点复习', '多做题提高熟练度', '整理错题本定期复习'];
    }
  }

  /**
   * 保存报告到数据库
   */
  async _saveReport(params) {
    const {
      studentId,
      examId,
      knowledgePoints,
      abilityDims,
      errorAttribution,
      peerComparison,
      aiSuggestions,
      weakPoints,
      strongPoints
    } = params;

    try {
      const result = await this.dbPool.query(
        `INSERT INTO analysis_reports
         (exam_id, student_id, knowledge_points, ability_dims, error_attribution,
          peer_percentile, peer_avg_score, student_score, ai_suggestions, weak_points, strong_points)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          examId,
          studentId,
          JSON.stringify(knowledgePoints),
          JSON.stringify(abilityDims),
          JSON.stringify(errorAttribution),
          peerComparison.percentile,
          peerComparison.peerAvg,
          peerComparison.studentAvg,
          JSON.stringify(aiSuggestions),
          JSON.stringify(weakPoints),
          JSON.stringify(strongPoints)
        ]
      );

      return result.rows[0]?.id;
    } catch (error) {
      console.error('[TutorAgent] 保存报告失败:', error);
      throw error;
    }
  }
}
