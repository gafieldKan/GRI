import { Controller, Get, Put, Body, Req, Query, Optional } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import { OrganizationService } from '../organization/organization.service';
import { AgentCredentialsService } from './agent-credentials.service';
import { AgentService } from './agent.service';
import { ModelRouter, storeFrom } from '@gri/agent-core';
import {
  eduQuery, findKnowledgePointName, countStudentsWithData, countUnresolvedWrongTotal,
  countActivePlans, lessonRollup, classKpAccuracy, classStudentAccuracy, kpQuestionStats,
  findQuestionMeta, countQuestionWrong, topWrongAnswers, wrongStudentsByQuestion,
} from '../edu-core/repository';

/**
 * 大模型路由管理（运营可配、前台可切）—— /api/agent/admin/routes。
 *
 * 特权铁律：管理面一律要求「站点运营」（根组织 owner|admin，见 OrganizationService.assertSiteOperator）。
 * 现状曾在《前言》里是「任意登录用户可配」——本题已收紧到运营角色，防学生/普通用户改全局模型路由。
 *
 * 切换 = 写 agent.llm_routes 表 → 下一轮调用实时生效（ModelRouter 每轮读库）。
 *
 * 凭据（B-1 凭据缝）：可选 `api_key` 为**只写**入参 —— 经底座 CredentialStore 以 AES-256-GCM
 * 密文落 agent.llm_credentials，明文永不落库、永不回传；`api_key` 不进 agent.llm_routes（路由行可被
 * 运营读，凭据行独立）。GET 只回 `has_key` + `hint`（后 4 位掩码）。不传 `api_key` 时行为与旧版完全一致。
 * 缺省：无路由行 → env（LLM_MODEL/LLM_API_KEY…）。
 */
@Controller('agent/admin/routes')
export class AgentAdminRoutesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly org: OrganizationService,
    @Optional() private readonly creds?: AgentCredentialsService,
    // 引擎目录（W2.6b）：只用于**写入口早校验** engine id。`@Optional()` —— 缺省不拦（read-time 仍会抛未知引擎），
    // 但生产由 Nest 注入 `AgentService`，运营错字在 PUT 时即被拒。
    @Optional() private readonly agent?: AgentService,
  ) {}

  private _router(): ModelRouter {
    // 注入凭据读取器（未配置主密钥 → null → 只走 env，行为同今日）
    return new ModelRouter(
      storeFrom((text: string, params?: unknown[]) => this.db.query(text, params)),
      null,
      this.creds?.store ?? null,
    );
  }

  private async _guard(req: Request): Promise<void> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
  }

  /** 当前生效的全部可配路由（含 env 缺省说明）+ 各行凭据掩码。仅运营。 */
  @Get()
  async list(@Req() req: Request): Promise<any> {
    await this._guard(req);
    const router = this._router();
    const rows = await router.list();
    const routes = await Promise.all(
      (rows || []).map(async (r: any) => {
        if (!this.creds?.store) return { ...r, has_key: false, hint: null };
        const meta = await this.creds.store.meta(r.route_key);
        return { ...r, has_key: meta.has_key, hint: meta.hint };
      }),
    );
    return {
      success: true,
      routes,
      credentialsEnabled: !!this.creds?.enabled,
      note: 'apiKey 只写不读：列表仅回 has_key + hint（后 4 位）；无路由行时回退环境变量缺省。',
    };
  }

  /**
   * 增改一条路由。body: { route_key, provider?, model?, multimodal_model?, base_url?, enabled?, api_key? }
   * 写表即切换，下一轮生效。`api_key` 可选且**只写**（密文落 agent.llm_credentials；不回显）。仅运营。
   */
  @Put()
  async upsert(@Req() req: Request, @Body() body: any): Promise<any> {
    await this._guard(req);
    const router = this._router();
    if (!body?.route_key) {
      return { success: false, error: 'route_key 必填（default | kind=<kind> | entity=<id>）' };
    }
    const routeKey = String(body.route_key);
    // 引擎早校验（W2.6b）：把错字挡在**写入口**，而不是等某次对话才 500。
    // 未注入 AgentService（测试档）→ 跳过校验（behavior 不拦）；生产恒注入 → 未知 id 一律拒。
    // 语义：不传 `engine` → undefined → ModelRouter.set 走 COALESCE **保留旧值**（不静默清空）；
    //      要「回到默认引擎」须显式传 `'gri-core'`（与 provider 的约定一致）。
    let engine: string | undefined;
    if (body?.engine !== undefined && body.engine !== null && String(body.engine).trim() !== '') {
      engine = String(body.engine).trim();
      const known = this.agent?.knownEngineIds?.() ?? null;
      if (known && !known.includes(engine)) {
        return { success: false, error: `未知引擎: ${engine}（可用：${known.join('、')}）`, knownEngines: known };
      }
    }
    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    if (apiKey) {
      // fail-fast：没有主密钥就不接收密钥（避免"看起来保存了"却无处可存）
      if (!this.creds?.store) {
        return {
          success: false,
          error: 'AGENT_CRED_MASTER_KEY 未配置 → 本服务不接受 api_key（key 不落库）；未写入任何变更',
        };
      }
      if (apiKey.length < 8) {
        return { success: false, error: 'api_key 过短（至少 8 字符）' };
      }
    }

    await router.set({
      route_key: routeKey,
      provider: body.provider,
      model: body.model,
      multimodal_model: body.multimodal_model,
      base_url: body.base_url,
      enabled: body.enabled ?? true,
      engine,
    });
    // 先落路由行再落凭据（凭据 FK → agent.llm_routes(route_key)）；不传 api_key → 完全不上凭据面（C9）
    if (apiKey) {
      await this.creds!.store!.set(routeKey, apiKey, { updatedBy: (req as any).auth?.externalId ?? null });
      const meta = await this.creds!.store!.meta(routeKey);
      return {
        success: true,
        route_key: routeKey,
        applied: true,
        has_key: meta.has_key,
        hint: meta.hint,
        note: '下一轮调用生效；api_key 只写不读（仅回掩码）。',
      };
    }
    const meta = this.creds?.store ? await this.creds.store.meta(routeKey) : null;
    return {
      success: true,
      route_key: routeKey,
      applied: true,
      has_key: !!meta?.has_key,
      hint: meta?.hint ?? null,
      note: '下一轮调用生效；api_key 只写不读（仅回掩码）。',
    };
  }
}

/**
 * 运营能力探询 —— GET /api/agent/admin/capability。
 *
 * 纯只读、不含任何资源：专供前端在渲染运营入口/面板前判断「当前登录用户是否是站点运营
 * （根组织 owner|admin）」。守卫是 DB 角色（assertSiteOperator），JWT roles 全空故前端无法
 * 自行推导，只能探这里。非运营 → isOperator:false（不抛错，前端当作「无权限」展示开关）。
 */
@Controller('agent/admin/capability')
export class AgentAdminCapabilityController {
  constructor(private readonly org: OrganizationService) {}

  @Get()
  async check(@Req() req: Request): Promise<any> {
    try {
      await this.org.assertSiteOperator((req as any).auth?.externalId as string);
      return { success: true, isOperator: true };
    } catch {
      return { success: true, isOperator: false };
    }
  }
}

/** 路由日志观测：最近工具调用审计（后管/运营可观测）。仅运营。 */
@Controller('agent/admin/tool-runs')
export class AgentAdminToolRunsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly org: OrganizationService,
  ) {}

  @Get()
  async recent(@Req() req: Request): Promise<any> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
    const res = await this.db.query(
      `SELECT id, entity_id, tool_name, args, result, latency_ms, created_at
         FROM agent.tool_runs
        ORDER BY id DESC LIMIT 50`,
    );
    return { success: true, runs: res.rows };
  }
}

/** 运营总览（只读聚合）—— GET /api/agent/admin/overview。仅运营。
 *  一调带回：在用学生数/有学习数据的学生数/累计工具调用/未解决错题/活动计划 + 授课落盘(上了多少节课/平均掌握度提升) + 各工具调用排行 + 最近工具动态。
 *  纯观测、无写操作，帮助运营判断"AI 教师在多大程度被使用、健康与否"。 */
@Controller('agent/admin/overview')
export class AgentAdminOverviewController {
  constructor(
    private readonly db: DatabaseService,
    private readonly org: OrganizationService,
  ) {}

  @Get()
  async overview(@Req() req: Request): Promise<any> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
    const [ents, data, runs, wrong, plans, lessons, usage, recent] = await Promise.all([
      this.db.query(`SELECT count(*)::int AS n FROM agent.entities WHERE kind = 'student' AND status = 'active'`),
      countStudentsWithData(eduQuery(this.db)),
      this.db.query(`SELECT count(*)::int AS n FROM agent.tool_runs`),
      countUnresolvedWrongTotal(eduQuery(this.db)),
      countActivePlans(eduQuery(this.db)),
      // 授课落盘聚合：上了多少节课(plan_type='lesson') + 平均掌握度提升(plan_data->>'delta' 数值均值)
      lessonRollup(eduQuery(this.db)),
      this.db.query(`SELECT tool_name, count(*)::int AS n FROM agent.tool_runs GROUP BY tool_name ORDER BY n DESC`),
      this.db.query(`SELECT entity_id, tool_name, created_at FROM agent.tool_runs ORDER BY id DESC LIMIT 8`),
    ]);
    return {
      success: true,
      counts: {
        activeStudents: ents.rows[0]?.n ?? 0,
        studentsWithData: data[0]?.n ?? 0,
        totalToolRuns: runs.rows[0]?.n ?? 0,
        unresolvedWrong: wrong[0]?.n ?? 0,
        activePlans: plans[0]?.n ?? 0,
        lessonsRecorded: lessons[0]?.n ?? 0,
      },
      lessons: {
        count: lessons[0]?.n ?? 0,
        knowledgePoints: lessons[0]?.kps ?? 0,
        avgDelta: lessons[0]?.avgDelta ?? null,
      },
      toolUsage: (usage.rows || []).map((r: any) => ({ toolName: r.tool_name, n: r.n })),
      recent: (recent.rows || []).map((r: any) => ({ entityId: r.entity_id, toolName: r.tool_name, createdAt: r.created_at })),
    };
  }
}

/**
 * 全班学情（只读运营聚合）—— GET /api/agent/admin/class-diagnosis。仅运营。
 * 观测的答案侧：运营总览(overview)看"被用了多少"，这里看"教到了什么"——
 * 跨全体学生的每题/每知识点作答集合准确率，指出全班最弱的知识点，供运营决定该教什么。
 * 复用 diagnosis 的聚合念头（answer_records→questions→knowledge_points），但按库内全体学生透视。
 * 纯读、无写、无 schema，非运营断言守卫抛 403。
 */
@Controller('agent/admin/class-diagnosis')
export class AgentAdminClassDiagnosisController {
  constructor(
    private readonly db: DatabaseService,
    private readonly org: OrganizationService,
  ) {}

  @Get()
  async diagnostic(@Req() req: Request): Promise<any> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
    const [kpRes, studentRes] = await Promise.all([
      // 每题/每知识点集合准确率（跨全体学生）
      classKpAccuracy(eduQuery(this.db)),
      // 每位学生总掌握（学生×累计作答准确率）——提供钻取背景
      classStudentAccuracy(eduQuery(this.db)),
    ]);

    const knowledgePoints = (kpRes || []).map((r: any) => {
      const attempts = r.attempts || 0;
      return {
        kpId: r.kp_id,
        kpName: r.kp_name,
        attempts,
        correct: r.correct || 0,
        students: r.students || 0,
        accuracy: attempts ? Math.round((r.correct / attempts) * 100) : 0,
      };
    });
    // 按掌握度从低到高（弱到强）排序；至少有一次作答才计入"弱项"。
    knowledgePoints.sort((a: any, b: any) => a.accuracy - b.accuracy);
    const weakest = knowledgePoints.filter((k: any) => k.attempts > 0).slice(0, 5);

    const studentRows = (studentRes || []).map((r: any) => {
      const attempts = r.attempts || 0;
      return {
        studentId: r.student_id,
        attempts,
        accuracy: attempts ? Math.round((r.correct / attempts) * 100) : 0,
      };
    });

    return {
      success: true,
      totalStudents: studentRows.length,
      hasData: knowledgePoints.length > 0,
      knowledgePoints,
      weakest,
      students: studentRows,
      note: '全班作答集合透视；weakest 为掌握度最低的前 5（至少作答一次）。',
    };
  }

  /**
   * 知识点题目钻取 —— GET /api/agent/admin/class-diagnosis/questions?kpId=<uuid>。仅运营。
   * 从全班学情下钻：给定一个知识点（通常在 weakest 里），列出它下面的题 + 每题全班作答统计,
   * 按掌握度弱→强排 —— 运营一眼看出"这个弱知识点里,全班具体卡在哪几题",决定该补教什么。
   * 只读、不泄答案（只给题面/类型/难度/统计,不给 answer/explanation）。kpId 缺失 → 空集合不崩。
   */
  @Get('questions')
  async questions(@Req() req: Request, @Query('kpId') kpId?: string): Promise<any> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
    if (!kpId) {
      return { success: true, kpId: null, totalQuestions: 0, questions: [], note: '缺 kpId' };
    }
    const [kpName, qRes] = await Promise.all([
      findKnowledgePointName(eduQuery(this.db), kpId),
      kpQuestionStats(eduQuery(this.db), kpId),
    ]);
    const questions = (qRes || [])
      .map((r: any) => {
        const attempts = r.attempts || 0;
        const correct = r.correct || 0;
        return {
          questionId: r.question_id,
          content: (r.content || '').slice(0, 120),
          difficulty: r.difficulty,
          type: r.type,
          attempts,
          correct,
          accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
          indexed: attempts && correct === 0,
        };
      })
      // 弱→强排：先未答对(卡题)再低掌握；都有作答时按准确率升序。
      .sort((a: any, b: any) => Number(b.indexed) - Number(a.indexed) || a.accuracy - b.accuracy)
      .slice(0, 20);
    return {
      success: true,
      kpId,
      kpName: kpName ?? null,
      totalQuestions: questions.length,
      questions,
      note: '仅题面+全班作答统计，不透答案。',
    };
  }

  /**
   * 单题作答归因（只读运营）—— GET /api/agent/admin/class-diagnosis/question?questionId=<uuid>。仅运营。
   * 从钻取到的一道卡题再下钻：它的正确答案/错误之比 + 全班最常见的错法分布 + 答错的学生（谁、写成什么）。
   * 让运营看到的是"为什么做错"这一步（区别于上一层的"卡在哪题"），直接支撑该讲什么误区。
   * 只读、零 schema；questionId 缺失 → 空不崩。student_answer 属教师/运营视角的归因数据。
   */
  @Get('question')
  async questionBreakdown(@Req() req: Request, @Query('questionId') questionId?: string): Promise<any> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
    if (!questionId) {
      return { success: true, questionId: null, error: '需 questionId' };
    }
    const [meta, wrongCount, topWrong, wrongStudents] = await Promise.all([
      findQuestionMeta(eduQuery(this.db), questionId),
      countQuestionWrong(eduQuery(this.db), questionId),
      topWrongAnswers(eduQuery(this.db), questionId),
      wrongStudentsByQuestion(eduQuery(this.db), questionId),
    ]);
    const content = meta?.content ?? '';
    return {
      success: true,
      questionId,
      question: content,
      kpName: meta?.kp_name ?? null,
      difficulty: meta?.difficulty ?? null,
      wrongCount: wrongCount ?? 0,
      topWrong: (topWrong || []).map((r: any) => ({ answer: r.student_answer, count: r.n })),
      wrongStudents: (wrongStudents || []).map((r: any) => ({ studentId: r.user_id, answer: r.student_answer })),
    };
  }
}