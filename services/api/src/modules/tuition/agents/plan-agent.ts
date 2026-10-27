import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { eduQuery, findLatestReportForPlan, insertPlanFull, findPlanDataForUser, updatePlanProgressFull } from '../../edu-core/repository';
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
    subjects?: string[];
  }) {
    const userId = params.userId;
    // 仅接受日/周/月三类；非法值（如日历页误传的 'calendar'）一律回落 daily，避免类型错乱。
    const planType = ['daily', 'weekly', 'monthly'].includes(params.planType ?? '') ? params.planType! : 'daily';
    let report = params.analysisReport;
    if (!report) report = await this._getLatestReport(userId);

    let planData;
    if (planType === 'daily') planData = await this._generateDailyPlan(report);
    else if (planType === 'weekly') planData = await this._generateWeeklyPlan(report);
    else planData = await this._generateMonthlyPlan(report);

    const subjects = Array.isArray(params.subjects) ? params.subjects.filter(Boolean) : [];
    if (subjects.length) planData.subjects = subjects;

    const planId = await this._savePlan({ userId, planType, planData, subjects, startDate: params.startDate, endDate: params.endDate });
    return { success: true, planId, plan: { id: planId, type: planType, ...planData } };
  }

  private async _generateDailyPlan(report: any): Promise<any> {
    const weakPoints = report?.weakPoints || [];
    const suggestions = report?.aiSuggestions || [];
    const tasks: any[] = [];

    if (weakPoints.length > 0) {
      tasks.push({ id: 'd0', type: 'practice', title: '薄弱知识点专项练习', description: `针对 ${weakPoints.join(', ')} 进行专项练习`, knowledgePoints: weakPoints, questionCount: 5, estimatedTime: 20, priority: 'high', completed: false });
    }
    tasks.push({ id: `d${tasks.length}`, type: 'review', title: '错题本复习', description: '复习之前的错题，确保掌握', estimatedTime: 15, priority: 'medium', completed: false });
    if (suggestions.length > 0) {
      tasks.push({ id: `d${tasks.length}`, type: 'suggestion', title: '今日学习建议', description: suggestions[0], estimatedTime: 10, priority: 'low', completed: false });
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
      // 每条任务带稳定 id + completed(false)，供前端勾选并写回 plan_data 持久化。
      const add = (t: any) => dayPlan.tasks.push({ id: `w${i}-t${dayPlan.tasks.length}`, completed: false, ...t });
      if (i < 5) {
        const kp = weakPoints[i % (weakPoints.length || 1)] || '综合复习';
        add({ type: 'practice', title: `${kp} 专项练习`, questionCount: 5, estimatedTime: 25 });
        add({ type: 'review', title: '错题复习', estimatedTime: 15 });
      }
      if (i === 5) add({ type: 'test', title: '本周综合测试', questionCount: 10, estimatedTime: 45 });
      if (i === 6) add({ type: 'review', title: '本周错题总复习', estimatedTime: 30 });
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
      const r = await findLatestReportForPlan(eduQuery(this.db), userId);
      if (r) {
        return { knowledgePoints: r.knowledge_points, abilityDims: r.ability_dims, errorAttribution: r.error_attribution, aiSuggestions: r.ai_suggestions, weakPoints: r.weak_points, strongPoints: r.strong_points };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** 保存计划（edu.learning_plans，user_id 定位）。 */
  private async _savePlan(params: { userId: string; planType: string; planData: any; subjects?: string[]; startDate?: string; endDate?: string }): Promise<string> {
    const { userId, planType, planData, subjects, startDate, endDate } = params;
    const planPeriod = planType === 'daily' ? startDate : planType === 'weekly' ? startDate?.substring(0, 10) : startDate?.substring(0, 7);
    const totalTasks =
      planData?.tasks?.length ||
      planData?.weeklyTasks?.reduce((sum: number, d: any) => sum + d.tasks.length, 0) ||
      0;
    const typeLabel = ({ daily: '日', weekly: '周', monthly: '月' } as Record<string, string>)[planType] ?? '';
    const subjLabel = subjects?.length ? `${subjects.join('、')} ` : '';
    const title = `${subjLabel}${typeLabel}学习计划`;
    return (await insertPlanFull(eduQuery(this.db), {
      userId,
      title,
      planType,
      planPeriod: planPeriod ?? null,
      planData: JSON.stringify(planData),
      totalTasks,
      startDate: startDate ?? new Date().toISOString(),
      endDate: endDate ?? null,
    })) as string;
  }

  /**
   * 更新计划进度：按 completedTaskIds 在 plan_data 中「标记式」写入 completed 并重算 progress，写回 JSONB。
   * 支持日计划（plan_data.tasks）与周计划（plan_data.weeklyTasks[].tasks）两种结构；owner 由 user_id 收敛。
   */
  async updateProgress(userId: string, planId: string, completedTaskIds: string[]) {
    const ids = new Set((Array.isArray(completedTaskIds) ? completedTaskIds : []).map((x) => String(x)));
    const cur = await findPlanDataForUser(eduQuery(this.db), planId, userId);
    if (!cur) return { success: false, error: '计划不存在或无权访问' };

    const planData: any = cur.plan_data || {};
    const allTasks: any[] = [];
    if (Array.isArray(planData.tasks)) allTasks.push(...planData.tasks);
    if (Array.isArray(planData.weeklyTasks)) {
      for (const day of planData.weeklyTasks) if (Array.isArray(day.tasks)) allTasks.push(...day.tasks);
    }
    for (const t of allTasks) if (t && t.id != null) t.completed = ids.has(String(t.id));

    const completedCount = allTasks.filter((t) => t && t.completed).length;
    const total = allTasks.length || Number(cur.total_tasks) || 0;
    const progress = total ? Math.round((completedCount / total) * 10000) / 100 : 0;
    const status = total && completedCount >= total ? 'completed' : 'active';

    // 同参数双处引用须各显式同型 cast（先例见 session-fsm.ts flush 的 $3::varchar）。
    const row = await updatePlanProgressFull(eduQuery(this.db), {
      planId,
      userId,
      planData: JSON.stringify(planData),
      completedTasks: completedCount,
      progress,
      status,
    });
    if (!row) return { success: false, error: '计划不存在或无权访问' };
    return { success: true, plan: row };
  }
}