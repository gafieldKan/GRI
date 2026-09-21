/**
 * PlanAgent - 学习计划 Agent
 *
 * 功能:
 * 1. 根据学情分析结果生成学习计划
 * 2. 支持日计划/周计划/月计划
 * 3. 计划粒度到具体题目和知识点
 * 4. 包含推荐练习题、讲解视频/文章链接
 * 5. 复习提醒机制
 * 6. 家长端报告生成
 */

import { AIService } from '../modules/ai/AIService.js';
import { QuestionGeneratorAgent } from './QuestionGeneratorAgent.js';

export class PlanAgent {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.aiService = new AIService();
    this.questionGenerator = new QuestionGeneratorAgent(dbPool);
  }

  /**
   * 生成学习计划（主入口）
   * @param {Object} params - 参数
   * @param {string} params.studentId - 学生 ID
   * @param {string} params.planType - 计划类型 (daily/weekly/monthly)
   * @param {Object} params.analysisReport - 学情分析报告（可选）
   * @param {string} params.startDate - 开始日期
   * @param {string} params.endDate - 结束日期
   * @returns {Promise<Object>} 学习计划
   */
  async generatePlan(params) {
    const {
      studentId,
      planType = 'daily',
      analysisReport = null,
      startDate,
      endDate
    } = params;

    try {
      // Step 1: 获取学情数据（如果没有传入）
      let report = analysisReport;
      if (!report) {
        report = await this._getLatestReport(studentId);
      }

      // Step 2: 根据计划类型生成计划
      let planData;
      if (planType === 'daily') {
        planData = await this._generateDailyPlan(report, startDate);
      } else if (planType === 'weekly') {
        planData = await this._generateWeeklyPlan(report, startDate);
      } else if (planType === 'monthly') {
        planData = await this._generateMonthlyPlan(report, startDate);
      }

      // Step 3: 持久化计划
      const planId = await this._savePlan({
        studentId,
        planType,
        planData,
        startDate,
        endDate
      });

      return {
        success: true,
        planId,
        plan: {
          id: planId,
          type: planType,
          ...planData
        }
      };
    } catch (error) {
      console.error('[PlanAgent] 生成计划失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 生成日计划
   */
  async _generateDailyPlan(report, date) {
    const weakPoints = report?.weakPoints || [];
    const suggestions = report?.aiSuggestions || [];

    // 针对薄弱点生成练习题
    const tasks = [];

    // 任务 1: 薄弱知识点练习
    if (weakPoints.length > 0) {
      const practiceTask = {
        id: `task_practice_${Date.now()}`,
        type: 'practice',
        title: '薄弱知识点专项练习',
        description: `针对 ${weakPoints.join(', ')} 进行专项练习`,
        knowledgePoints: weakPoints,
        questionCount: 5,
        estimatedTime: 20, // 分钟
        priority: 'high',
        completed: false
      };
      tasks.push(practiceTask);
    }

    // 任务 2: 错题复习
    const reviewTask = {
      id: `task_review_${Date.now()}`,
      type: 'review',
      title: '错题本复习',
      description: '复习之前的错题，确保掌握',
      estimatedTime: 15,
      priority: 'medium',
      completed: false
    };
    tasks.push(reviewTask);

    // 任务 3: AI 建议
    if (suggestions.length > 0) {
      const suggestionTask = {
        id: `task_suggestion_${Date.now()}`,
        type: 'suggestion',
        title: '今日学习建议',
        description: suggestions[0],
        estimatedTime: 10,
        priority: 'low',
        completed: false
      };
      tasks.push(suggestionTask);
    }

    // 生成具体练习题目
    const practiceQuestions = await this._generatePracticeQuestions(weakPoints);

    return {
      date,
      tasks,
      practiceQuestions,
      totalEstimatedTime: tasks.reduce((sum, t) => sum + (t.estimatedTime || 0), 0),
      aiMessage: '今天也要加油哦！完成计划后记得休息～'
    };
  }

  /**
   * 生成周计划
   */
  async _generateWeeklyPlan(report, startDate) {
    const weakPoints = report?.weakPoints || [];
    const strongPoints = report?.strongPoints || [];

    // 生成 7 天的任务分配
    const weeklyTasks = [];
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    for (let i = 0; i < 7; i++) {
      const dayPlan = {
        day: days[i],
        date: new Date(startDate).toISOString(),
        tasks: []
      };

      // 周一至周五：每天针对一个知识点
      if (i < 5) {
        const kp = weakPoints[i % (weakPoints.length || 1)] || '综合复习';
        dayPlan.tasks.push({
          type: 'practice',
          title: `${kp} 专项练习`,
          questionCount: 5,
          estimatedTime: 25
        });

        dayPlan.tasks.push({
          type: 'review',
          title: '错题复习',
          estimatedTime: 15
        });
      }

      // 周六：综合测试
      if (i === 5) {
        dayPlan.tasks.push({
          type: 'test',
          title: '本周综合测试',
          questionCount: 10,
          estimatedTime: 45
        });
      }

      // 周日：复习与休息
      if (i === 6) {
        dayPlan.tasks.push({
          type: 'review',
          title: '本周错题总复习',
          estimatedTime: 30
        });
      }

      weeklyTasks.push(dayPlan);
    }

    return {
      startDate,
      endDate: new Date(new Date(startDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      weeklyTasks,
      focusPoints: weakPoints,
      totalTasks: weeklyTasks.reduce((sum, d) => sum + d.tasks.length, 0)
    };
  }

  /**
   * 生成月计划
   */
  async _generateMonthlyPlan(report, startDate) {
    const weakPoints = report?.weakPoints || [];

    // 按周分配知识点
    const weeklyFocus = [];
    const weeks = ['第 1 周', '第 2 周', '第 3 周', '第 4 周'];

    weeks.forEach((week, i) => {
      weeklyFocus.push({
        week,
        focusPoint: weakPoints[i % (weakPoints.length || 1)] || '综合复习',
        goals: [
          `掌握 ${weakPoints[i % (weakPoints.length || 1)]} 核心概念`,
          '完成配套练习题 20 道',
          '整理错题本'
        ]
      });
    });

    return {
      startDate,
      monthlyGoals: [
        '掌握本月所有知识点',
        '正确率达到 80% 以上',
        '建立完整的知识体系'
      ],
      weeklyFocus,
      milestoneTests: [
        { week: '第 2 周', type: '中期检测' },
        { week: '第 4 周', type: '月末综合测试' }
      ]
    };
  }

  /**
   * 生成练习题（调用出题 Agent）
   */
  async _generatePracticeQuestions(knowledgePoints, count = 5) {
    if (!knowledgePoints || knowledgePoints.length === 0) {
      knowledgePoints = ['基础知识'];
    }

    const questions = [];

    for (const kp of knowledgePoints.slice(0, 2)) {
      const result = await this.questionGenerator.generateQuestions({
        knowledgePoint: kp,
        count: Math.ceil(count / knowledgePoints.length),
        difficulty: 0.5
      });

      if (result.success) {
        questions.push(...result.questions);
      }
    }

    return questions;
  }

  /**
   * 获取最新学情报告
   */
  async _getLatestReport(studentId) {
    try {
      const result = await this.dbPool.query(
        `SELECT knowledge_points, ability_dims, error_attribution, ai_suggestions, weak_points, strong_points
         FROM analysis_reports
         WHERE student_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [studentId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          knowledgePoints: row.knowledge_points,
          abilityDims: row.ability_dims,
          errorAttribution: row.error_attribution,
          aiSuggestions: row.ai_suggestions,
          weakPoints: row.weak_points,
          strongPoints: row.strong_points
        };
      }

      return null;
    } catch (error) {
      console.error('[PlanAgent] 获取学情报告失败:', error);
      return null;
    }
  }

  /**
   * 保存计划到数据库
   */
  async _savePlan(params) {
    const { studentId, planType, planData, startDate, endDate } = params;

    try {
      const planId = `plan_${Date.now()}_${studentId}`;
      const planPeriod = planType === 'daily' ? startDate :
                       planType === 'weekly' ? startDate?.substring(0, 10) :
                       startDate?.substring(0, 7);

      await this.dbPool.query(
        `INSERT INTO learning_plans
         (id, student_id, plan_type, plan_period, plan_data, start_date, end_date, progress, total_tasks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)`,
        [
          planId,
          studentId,
          planType,
          planPeriod,
          JSON.stringify(planData),
          startDate,
          endDate,
          planData?.tasks?.length || planData?.weeklyTasks?.reduce((s, d) => s + d.tasks.length, 0) || 0
        ]
      );

      return planId;
    } catch (error) {
      console.error('[PlanAgent] 保存计划失败:', error);
      throw error;
    }
  }

  /**
   * 更新计划进度
   */
  async updateProgress(planId, completedTaskIds) {
    try {
      const completedCount = Array.isArray(completedTaskIds) ? completedTaskIds.length : 0;
      const result = await this.dbPool.query(
        `UPDATE learning_plans
         SET completed_tasks = $2,
             progress = CASE WHEN total_tasks > 0
                        THEN ($2::float / total_tasks) * 100
                        ELSE 0 END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [planId, completedCount]
      );

      return result.rows[0];
    } catch (error) {
      console.error('[PlanAgent] 更新进度失败:', error);
      throw error;
    }
  }

  /**
   * 生成家长端报告
   */
  async generateParentReport(studentId, planType = 'weekly') {
    try {
      // 查询学生学习数据
      const studentResult = await this.dbPool.query(
        `SELECT s.name, s.grade
         FROM students s
         WHERE s.id = $1`,
        [studentId]
      );

      if (studentResult.rows.length === 0) {
        return { success: false, error: '学生不存在' };
      }

      const student = studentResult.rows[0];

      // 查询学习计划完成情况
      const planResult = await this.dbPool.query(
        `SELECT plan_type, plan_data, progress, start_date, end_date
         FROM learning_plans
         WHERE student_id = $1 AND plan_type = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [studentId, planType]
      );

      const plan = planResult.rows[0];

      return {
        success: true,
        report: {
          studentName: student.name,
          grade: student.grade,
          planType,
          progress: plan?.progress || 0,
          planData: plan?.plan_data,
          period: {
            start: plan?.start_date,
            end: plan?.end_date
          }
        }
      };
    } catch (error) {
      console.error('[PlanAgent] 生成家长报告失败:', error);
      return { success: false, error: error.message };
    }
  }
}
