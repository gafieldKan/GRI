/**
 * 面板面（W2.2「拆神服务」第三片 —— 从 agent.service.ts 抽出）。
 *
 * 这里是**学生面板/课堂按钮**要走的那批只读+轻写动作：记忆列表/遗忘、授课进度与提交、
 * 计划任务完成、诊断总览、错题本、复习预览、掌握度趋势、知识点抽题、单题判读、越权断言。
 *
 * 与"工具"的关系：面板**按名**从工具表里取出对应工具再 execute（面板与工具走同一实现，
 * 保证"面板按一下"与"AI 自己调"副作用同源）。故宿主注入 `_teachingToolDefs`，不复制逻辑。
 * 依赖只向宿主要三样：装配好的 agent（取 memory）、工具定义集、Store —— 由 AgentService 提供。
 */

import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { storeFrom } from '@gri/agent-core';
import { eduQuery, listQuestionsByKp } from '../edu-core/repository';

export class AgentPanelService {
  constructor(
    private readonly db: DatabaseService,
    host: {
      /** 装配好的每生 agent（面板取 memory 用；实现仍在 AgentService）。 */
      _agent: (entityId: string) => Promise<any>;
      /** 教学工具定义集（面板按名取工具再 execute；实现见 teaching-tools.ts）。 */
      _teachingToolDefs: () => any[];
    },
  ) {
    this._agent = host._agent;
    this._teachingToolDefs = host._teachingToolDefs;
  }

  private readonly _agent: (entityId: string) => Promise<any>;
  private readonly _teachingToolDefs: () => any[];

  /** Store 适配：把 DatabaseService 拧成 agent-core 的 {query}。 */
  private _store() {
    return storeFrom((text: string, params?: unknown[]) => this.db.query(text, params));
  }

  /** 读某学生的全部记忆（个人私有）。 */
  async listMemory(entityId: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    return { success: true, facts: await memory.list(entityId, { limit: 50 }) };
  }

  /** 忘掉一条长期记忆 —— 复用 memory.forget 工具逻辑(不绕 LLM),供面板显式管理记忆。 */
  async forgetMemory(entityId: string, key: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'memory.forget');
    let result: any;
    try {
      result = await tool!.execute({ store: this._store(), memory, entityId }, { key });
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'memory.forget', $2, $3, NULL)`,
        [entityId, JSON.stringify({ key }), result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.ok !== false, ...result };
  }

  /** 授课状态机 —— 复用 lesson.current 工具逻辑(不绕 LLM),经该生记忆持久化阶段,供面板/脚本确定性驱动。 */
  async lessonProgress(entityId: string, kpId: string, stage?: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'lesson.current');
    let result: any;
    try {
      result = await tool!.execute({ store: this._store(), memory, entityId }, stage ? { kpId, stage } : { kpId });
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'lesson.current', $2, $3, NULL)`,
        [entityId, JSON.stringify({ kpId, stage }) , result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.success !== false, ...result };
  }

  /** 提交授课抢时段作答 —— 复用 lesson.submit 工具(判题+落库+回授掌握度+状态机推进,不绕 LLM)，供授课UI闭环。 */
  async lessonSubmit(entityId: string, kpId: string, questionId: string, answer: string): Promise<any> {
    const { memory } = await this._agent(entityId);
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'lesson.submit');
    let result: any;
    try {
      result = await tool!.execute({ store: this._store(), memory, entityId }, { kpId, questionId, answer });
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'lesson.submit', $2, $3, NULL)`,
        [entityId, JSON.stringify({ kpId, questionId, answer }), result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.success !== false, ...result };
  }

  /** 直接完成个性化计划的一条任务 —— 复用 plan.complete 工具逻辑(不绕 LLM)，供计划页 UI 闭环。 */
  async completePlanTask(entityId: string, planId: string, taskIndex: number, correct: boolean): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'plan.complete');
    const result = await tool!.execute({ store: this._store(), entityId }, { planId, taskIndex, correct });
    // 与 AgentCore 工具路径一致地审计（失败静默，不阻断）
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'plan.complete', $2, $3, NULL)`,
        [entityId, JSON.stringify({ planId, taskIndex, correct }), (result as any)?.error ? JSON.stringify({ error: (result as any).error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: (result as any)?.ok !== false, ...result };
  }

  /** 只读学情总览——复用 diagnosis.state 工具 execute(不绕 LLM),供前端面板直读真实掌握度/未解错题。 */
  async diagnosisOverview(entityId: string): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'diagnosis.state');
    const result = (await tool!.execute({ store: this._store(), entityId }, {})) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'diagnosis.state', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'diagnosis', ...result };
  }

  /** 只读错题本——复用 wrong.list(不泄正确答案,含题面/错答/知识点)。 */
  async wrongBook(entityId: string, limit = 10): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'wrong.list');
    const result = (await tool!.execute({ store: this._store(), entityId }, { limit })) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'wrong.list', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'wrong-book', ...result };
  }

  /** 只读复习序列预览——复用 review.sequence(掌握度缺口+间隔排序,不含答案)。 */
  async reviewPreview(entityId: string, size = 5): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'review.sequence');
    const result = (await tool!.execute({ store: this._store(), entityId }, { size })) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'review.sequence', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'review-preview', ...result };
  }

  /** 只读掌握度趋势——复用 progress.trend(按天累计作答掌握度,判断进步/退步)。 */
  async masteryTrend(entityId: string): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'progress.trend');
    const result = (await tool!.execute({ store: this._store(), entityId }, {})) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'progress.trend', $2, NULL)`,
        [entityId, result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: !result.error, phase: 'mastery-trend', ...result };
  }

  /** 按知识点抽题（专项练习）——给定一个知识点(kpId)，随机抽 size 道该知识点的题，只回题面/选项/类型/难度，**不含答案**。
   *  学生作答仍走 answer.grade（判题/落库/错题/SM-2/消错题副作用统一），这里只是出题面。只读。 */
  async kpQuestions(entityId: string, kpId: string, size = 5): Promise<any> {
    if (!kpId) return { success: false, error: 'kpId 必填', questions: [] };
    const n = Math.max(1, Math.min(Number(size) || 5, 10));
    const rows = await listQuestionsByKp(eduQuery(this._store()), kpId, n);
    const questions = (rows || []).map((r: any) => ({
      questionId: r.id,
      content: r.content,
      type: r.type,
      options: r.options,
      difficulty: r.difficulty,
      knowledgePoint: r.knowledge_point,
    }));
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, result, latency_ms) VALUES ($1, 'kp.drill', $2, NULL)`,
        [entityId, JSON.stringify({ kpId, size: questions.length })],
      );
    } catch { /* 审计失败静默 */ }
    return { success: true, phase: 'kp-drill', kpId, count: questions.length, questions };
  }

  /** 面板作答判读——复用 answer.grade(判题 + 作答落库 + 可选 resolveOnCorrect 消错题),不经 LLM。 */
  async gradeAnswer(entityId: string, questionId: string, answer: string, resolveOnCorrect = true, timeSpentMs?: number): Promise<any> {
    const tool = this._teachingToolDefs().find((t: any) => t.name === 'answer.grade');
    const result = (await tool!.execute({ store: this._store(), entityId }, { questionId, answer: answer ?? '', resolveOnCorrect, timeSpentMs })) as any;
    try {
      await this._store().query(
        `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)
         VALUES ($1, 'answer.grade', $2, $3, NULL)`,
        [entityId, JSON.stringify({ questionId, resolveOnCorrect, timeSpentMs }), result.error ? JSON.stringify({ error: result.error }) : JSON.stringify(result)],
      );
    } catch { /* 审计失败静默 */ }
    return { success: result.ok !== false, phase: 'graded', ...result };
  }

  /** 越权辅助：断言传入的 studentId 即请求者本人，否则 404。 */
  assertSelf(requestedId: string, externalId: string): void {
    if (requestedId && requestedId !== externalId) {
      throw new NotFoundException('学生不存在或无权访问');
    }
  }
}
