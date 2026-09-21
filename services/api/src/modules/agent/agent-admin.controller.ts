import { Controller, Get, Put, Body, Req, Query } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import { OrganizationService } from '../organization/organization.service';
import { ModelRouter, storeFrom } from '@gri/agent-core';

/**
 * 大模型路由管理（运营可配、前台可切）—— /api/agent/admin/routes。
 *
 * 特权铁律：管理面一律要求「站点运营」（根组织 owner|admin，见 OrganizationService.assertSiteOperator）。
 * 现状曾在《前言》里是「任意登录用户可配」——本题已收紧到运营角色，防学生/普通用户改全局模型路由。
 *
 * 切换 = 写 agent.llm_routes 表 → 下一轮调用实时生效（ModelRouter 每轮读库）。
 * apiKey 永不入库：本管理面不接收/不回显任何密钥，apiKey 一律由部署 env/SecretRef 供给。
 * 缺省：无路由行 → env（LLM_MODEL/LLM_API_KEY…）。
 */
@Controller('agent/admin/routes')
export class AgentAdminRoutesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly org: OrganizationService,
  ) {}

  private _router(): ModelRouter {
    return new ModelRouter(storeFrom((text: string, params?: unknown[]) => this.db.query(text, params)));
  }

  private async _guard(req: Request): Promise<void> {
    await this.org.assertSiteOperator((req as any).auth?.externalId as string);
  }

  /** 当前生效的全部可配路由（含 env 缺省说明）。仅运营。 */
  @Get()
  async list(@Req() req: Request): Promise<any> {
    await this._guard(req);
    const router = this._router();
    const rows = await router.list();
    return {
      success: true,
      routes: rows,
      note: 'apiKey 不经此面存取；无路由行时回退环境变量缺省。',
    };
  }

  /**
   * 增改一条路由。body: { route_key, provider?, model?, multimodal_model?, base_url?, enabled? }
   * 写表即切换，下一轮生效。仅运营。
   */
  @Put()
  async upsert(@Req() req: Request, @Body() body: any): Promise<any> {
    await this._guard(req);
    const router = this._router();
    if (!body?.route_key) {
      return { success: false, error: 'route_key 必填（default | kind=<kind> | entity=<id>）' };
    }
    await router.set({
      route_key: body.route_key,
      provider: body.provider,
      model: body.model,
      multimodal_model: body.multimodal_model,
      base_url: body.base_url,
      enabled: body.enabled ?? true,
    });
    return { success: true, route_key: body.route_key, applied: true, note: '下一轮调用生效；apiKey 不落库' };
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
 *  一调带回：在用学生数/有学习数据的学生数/累计工具调用/未解决错题/活动计划 + 各工具调用排行 + 最近工具动态。
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
    const [ents, data, runs, wrong, plans, usage, recent] = await Promise.all([
      this.db.query(`SELECT count(*)::int AS n FROM agent.entities WHERE kind = 'student' AND status = 'active'`),
      this.db.query(`SELECT count(DISTINCT user_id)::int AS n FROM edu.answer_records`),
      this.db.query(`SELECT count(*)::int AS n FROM agent.tool_runs`),
      this.db.query(`SELECT count(*)::int AS n FROM edu.wrong_questions WHERE is_resolved = false`),
      this.db.query(`SELECT count(*)::int AS n FROM edu.learning_plans WHERE status = 'active'`),
      this.db.query(`SELECT tool_name, count(*)::int AS n FROM agent.tool_runs GROUP BY tool_name ORDER BY n DESC`),
      this.db.query(`SELECT entity_id, tool_name, created_at FROM agent.tool_runs ORDER BY id DESC LIMIT 8`),
    ]);
    return {
      success: true,
      counts: {
        activeStudents: ents.rows[0]?.n ?? 0,
        studentsWithData: data.rows[0]?.n ?? 0,
        totalToolRuns: runs.rows[0]?.n ?? 0,
        unresolvedWrong: wrong.rows[0]?.n ?? 0,
        activePlans: plans.rows[0]?.n ?? 0,
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
      this.db.query(
        `SELECT kp.id AS kp_id, kp.name AS kp_name,
                count(*)::int           AS attempts,
                count(*) FILTER (WHERE ar.is_correct)::int AS correct,
                count(DISTINCT ar.user_id)::int AS students
           FROM edu.answer_records ar
           JOIN edu.questions q        ON q.id = ar.question_id
           JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
          GROUP BY kp.id, kp.name`,
      ),
      // 每位学生总掌握（学生×累计作答准确率）——提供钻取背景
      this.db.query(
        `SELECT ar.user_id AS student_id,
                count(*)::int AS attempts,
                count(*) FILTER (WHERE ar.is_correct)::int AS correct
           FROM edu.answer_records ar
          GROUP BY ar.user_id`,
      ),
    ]);

    const knowledgePoints = (kpRes.rows || []).map((r: any) => {
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

    const studentRows = (studentRes.rows || []).map((r: any) => {
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
    const [kpRes, qRes] = await Promise.all([
      this.db.query(`SELECT name FROM edu.knowledge_points WHERE id = $1`, [kpId]),
      this.db.query(
        `SELECT q.id AS question_id, q.content, q.difficulty, q.type,
                count(ar.id)::int                    AS attempts,
                count(ar.id) FILTER (WHERE ar.is_correct)::int AS correct
           FROM edu.questions q
           LEFT JOIN edu.answer_records ar ON ar.question_id = q.id
          WHERE q.knowledge_point_id = $1
          GROUP BY q.id
          ORDER BY attempts DESC`,
        [kpId],
      ),
    ]);
    const questions = (qRes.rows || [])
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
      kpName: kpRes.rows?.[0]?.name ?? null,
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
    const [qRes, wrongRes, topRes, studentRes] = await Promise.all([
      this.db.query(`SELECT q.content, q.difficulty, q.type, q.knowledge_point_id, kp.name AS kp_name
                       FROM edu.questions q
                       LEFT JOIN edu.knowledge_points kp ON kp.id = q.knowledge_point_id
                      WHERE q.id = $1`, [questionId]),
      this.db.query(`SELECT count(*)::int AS n FROM edu.answer_records WHERE question_id = $1 AND is_correct = false`, [questionId]),
      this.db.query(`SELECT student_answer, count(*)::int AS n
                       FROM edu.answer_records
                      WHERE question_id = $1 AND is_correct = false AND student_answer IS NOT NULL AND student_answer <> ''
                      GROUP BY student_answer ORDER BY n DESC LIMIT 5`, [questionId]),
      this.db.query(`SELECT DISTINCT user_id, student_answer FROM edu.answer_records
                      WHERE question_id = $1 AND is_correct = false ORDER BY user_id`, [questionId]),
    ]);
    const content = qRes.rows?.[0]?.content ?? '';
    return {
      success: true,
      questionId,
      question: content,
      kpName: qRes.rows?.[0]?.kp_name ?? null,
      difficulty: qRes.rows?.[0]?.difficulty ?? null,
      wrongCount: wrongRes.rows?.[0]?.n ?? 0,
      topWrong: (topRes.rows || []).map((r: any) => ({ answer: r.student_answer, count: r.n })),
      wrongStudents: (studentRes.rows || []).map((r: any) => ({ studentId: r.user_id, answer: r.student_answer })),
    };
  }
}