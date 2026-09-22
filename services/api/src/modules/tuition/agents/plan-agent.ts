import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { QuestionGeneratorAgent } from './question-generator';

/**
 * PlanAgent（移植旧 PlanAgent.js）：按学情生成日/周/月学习计划并持久化。
 * 无 key → 出题部分由 QuestionGeneratorAgent mock 兜底（不再有 pending 占位）。
 * 所有写入/读取用 user_id 定位（edu.learning_plans / edu.analysis_reports / edu.students），杜绝越权。
 */
@Injectable()
export class PlanAgent {
  constructor(
    private readonly db: DatabaseService,
    private readonly questionGenerator: QuestionGeneratorAgent,
  ) {}

  async generatePlan(params: {
    userId: string;
    planType?: string;
    analysisReport?: any;
    startDate?: string;
    endDate?: string;
  }) {
    const userId = params.userId;
    const planType = params.planType || 'daily';
    let report = params.analysisReport;
    if (!report) report = await this._getLatestReport(userId);

    let planData;
    if (planType === 'daily') planData = await this._generateDailyPlan(report);
    else if (planType === 'weekly') planData = await this._generateWeeklyPlan(report);
    else planData = await this._generateMonthlyPlan(report);

    const planId = await this._savePlan({ userId, planType, planData, startDate: params.startDate, endDate: params.endDate });
    return { success: true, planId, plan: { id: planId, type: planType, ...planData } };
  }

  private async _generateDailyPlan(report: any): Promise<any> {
    const weakPoints = report?.weakPoints || [];
    const suggestions = report?.aiSuggestions || [];
    const tasks: any[] = [];

    if (weakPoints.length > 0) {
      tasks.push({ id: `task_practice_${Date.now()}`, type: 'practice', title: '薄弱知识点专项练习', description: `针对 ${weakPoints.join(', ')} 进行专项练习`, knowledgePoints: weakPoints, questionCount: 5, estimatedTime: 20, priority: 'high', completed: false });
    }
    tasks.push({ id: `task_review_${Date.now()}`, type: 'review', title: '错题本复习', description: '复习之前的错题，确保掌握', estimatedTime: 15, priority: 'medium', completed: false });
    if (suggestions.length > 0) {
      tasks.push({ id: `task_suggestion_${Date.now()}`, type: 'suggestion', title: '今日学习建议', description: suggestions[0], estimatedTime: 10, priority: 'low', completed: false });
    }

    const practiceQuestions = await this.questionGenerator.generatePracticeSet({
      knowledgePoint: weakPoints[0] ?? null,
      targetCount: 5,
    });

    return {
      tasks,
      practiceQuestions: practiceQuestions.questions ?? [],
      totalEstimatedTime: tasks.reduce((sum: number, t: any) => sum + (t.estimatedTime || 0), 0),
      aiMessage: '今天也要加油哦！完成计划后记得休息～',
    };
  }

  private async _generateWeeklyPlan(report: any): Promise<any> {
    const weakPoints = report?.weakPoints || [];
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const weeklyTasks = [];
    for (let i = 0; i < 7; i++) {
      const dayPlan: any = { day: days[i], tasks: [] };
      if (i < 5) {
        const kp = weakPoints[i % (weakPoints.length || 1)] || '综合复习';
        dayPlan.tasks.push({ type: 'practice', title: `${kp} 专项练习`, questionCount: 5, estimatedTime: 25 });
        dayPlan.tasks.push({ type: 'review', title: '错题复习', estimatedTime: 15 });
      }
      if (i === 5) dayPlan.tasks.push({ type: 'test', title: '本周综合测试', questionCount: 10, estimatedTime: 45 });
      if (i === 6) dayPlan.tasks.push({ type: 'review', title: '本周错题总复习', estimatedTime: 30 });
      weeklyTasks.push(dayPlan);
    }
    return {
      weeklyTasks,
      focusPoints: weakPoints,
      totalTasks: weeklyTasks.reduce((sum: number, d: any) => sum + d.tasks.length, 0),
    };
  }

  private async _generateMonthlyPlan(report: any): Promise<any> {
    const weakPoints = report?.weakPoints || [];
    const weeklyFocus: { week: string; focusPoint: string; goals: string[] }[] = [];
    const weeks = ['第 1 周', '第 2 周', '第 3 周', '第 4 周'];
    weeks.forEach((week, i) => {
      const focus = weakPoints[i % (weakPoints.length || 1)] || '综合复习';
      weeklyFocus.push({ week, focusPoint: focus, goals: [`掌握 ${focus} 核心概念`, '完成配套练习题 20 道', '整理错题本'] });
    });
    return {
      monthlyGoals: ['掌握本月所有知识点', '正确率达到 80% 以上', '建立完整的知识体系'],
      weeklyFocus,
      milestoneTests: [{ week: '第 2 周', type: '中期检测' }, { week: '第 4 周', type: '月末综合测试' }],
    };
  }

  /** 取最新学情报告（user_id 定位）。 */
  async _getLatestReport(userId: string): Promise<any | null> {
    try {
      const result = await this.db.query(
        `SELECT knowledge_points, ability_dims, error_attribution, ai_suggestions, weak_points, strong_points
         FROM edu.analysis_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      if (result.rows.length > 0) {
        const r = result.rows[0];
        return { knowledgePoints: r.knowledge_points, abilityDims: r.ability_dims, errorAttribution: r.error_attribution, aiSuggestions: r.ai_suggestions, weakPoints: r.weak_points, strongPoints: r.strong_points };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 保存计划（edu.learning_plans，user_id 定位）。 */
  private async _savePlan(params: { userId: string; planType: string; planData: any; startDate?: string; endDate?: string }): Promise<string> {
    const { userId, planType, planData, startDate, endDate } = params;
    const planPeriod = planType === 'daily' ? startDate : planType === 'weekly' ? startDate?.substring(0, 10) : startDate?.substring(0, 7);
    const totalTasks =
      planData?.tasks?.length ||
      planData?.weeklyTasks?.reduce((sum: number, d: any) => sum + d.tasks.length, 0) ||
      0;
    const res = await this.db.query(
      `INSERT INTO edu.learning_plans (user_id, title, plan_type, plan_period, plan_data, progress, total_tasks, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, 'active')
       RETURNING id`,
      [userId, `${planType}学习计划`, planType, planPeriod, JSON.stringify(planData), totalTasks, startDate ?? new Date().toISOString(), endDate ?? null],
    );
    return res.rows[0]?.id;
  }

  /** 更新计划进度（owner 必须匹配用户，杜绝改他人计划）。 */
  async updateProgress(userId: string, planId: string, completedTaskIds: string[]) {
    const completedCount = Array.isArray(completedTaskIds) ? completedTaskIds.length : 0;
    // 同参数双处引用必须各显式同型 cast（pg variable_coerce_param_hook 会因推断冲突拒绝，
    // 先例见 session-fsm.ts flush 的 $3::varchar）。此处拆 $3::int（写列）与 $4::float（算比例，
    // 避免 int/int 整除归零）双参数，各单一类型零歧义。
    const result = await this.db.query(
      `UPDATE edu.learning_plans
       SET completed_tasks = $3::int,
           progress = CASE WHEN total_tasks > 0 THEN ($4::float / total_tasks) * 100 ELSE 0 END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [planId, userId, completedCount, completedCount],
    );
    if (result.rows.length === 0) return { success: false, error: '计划不存在或无权访问' };
    return { success: true, plan: result.rows[0] };
  }
}