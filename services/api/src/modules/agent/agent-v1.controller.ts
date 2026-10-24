import { Controller, Get, Post, Body, Req, Header, Param, Query, Res, Inject, Optional, BadRequestException, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AgentService, AGENT_CLI_BACKENDS } from './agent.service';
import type { CliBackendRegistry } from '@gri/agent-core';

/** v1 契约版本号（随 body `v` 与响应头 `X-Agent-Api-Version` 同时下发）。 */
export const AGENT_API_VERSION = 1;

/** SSE 轮询间隔（≤1s，B-4）；run 终态后再发一条 status 事件 + 5 秒尾巴即关流。 */
export const AGENT_SSE_POLL_MS = 900;
export const AGENT_SSE_TAIL_MS = 5000;

/**
 * 对外版本化契约 —— `POST/GET /api/v1/agent/*`（B-2 目标 1）。
 *
 * 定位：**新增**的对外承诺面，与既有 `/api/agent/*`（前端 3 端 + portal 在用）**并存且互不影响**。
 *   - 既有面（`agent.controller.ts`）路径/形状逐字节不变（C1 零回归）；
 *   - 本面只做「契约层」：入参校验 / 出参形状 / 版本语义，业务逻辑一律**复用** `AgentService`（C3 不复制）。
 *
 * 契约（v1，形状稳定，见 docs/AGENT_PUBLIC_CONTRACT.md）：
 *   成功 → 200 `{ v: 1, success: true,  data: <payload> }`
 *   失败 → 4xx/5xx `{ v: 1, success: false, error: { code, message } }`
 *   版本语义：`/api/v1/**` 为对外承诺面；任何不兼容变更开 `/api/v2/**`，不得原地改 v1 语义。
 *
 * 所有权铁律（C4，与旧面同源）：一律以 `req.auth.externalId`（= public.users.id）为真源，
 *   本面对外**不接受**任何 studentId 入参 —— 跨用户访问在 v1 面上被结构性消灭（无从传入）。
 *   全局鉴权默认强制（`/api` 中间件），`/api/v1/agent/*` 不在 public-routes 白名单内。
 *
 * 依赖注入：`AGENT_CLI_BACKENDS` 为进程级共享 `cliBackends`（B-3a/B-3b，零成本声明式描述）。
 *   未注入/为 null → `delegate/backends` 回空数组 `[]`（**只读探测，绝不报错**）。
 */
@Controller('v1/agent')
export class AgentV1Controller {
  constructor(
    private readonly agentService: AgentService,
    @Optional() @Inject(AGENT_CLI_BACKENDS) private readonly cliBackends?: CliBackendRegistry | null,
  ) {}

  /** 业务主体 = externalId（= users.id）。与旧面同源，不做二次推导。 */
  private externalId(req: Request): string {
    return (req as any).auth.externalId as string;
  }

  /** v1 成功信封。 */
  private ok(data: unknown): { v: number; success: true; data: unknown } {
    return { v: AGENT_API_VERSION, success: true, data };
  }

  /** 打开我的 agent（工具/技能/记忆摘要）。GET /api/v1/agent/me */
  @Get('me')
  @Header('X-Agent-Api-Version', String(AGENT_API_VERSION))
  async me(@Req() req: Request) {
    return this.ok(await this.agentService.openSession(this.externalId(req)));
  }

  /**
   * 发消息给我的 AI 教师。POST /api/v1/agent/me/message  body: { content, routeKey? }
   * 空 content → 400（fail-fast，结构化 error），不再落到 service 层的 `{success:false}` 软失败。
   */
  @Post('me/message')
  @Header('X-Agent-Api-Version', String(AGENT_API_VERSION))
  async message(@Req() req: Request, @Body() body: { content?: string; routeKey?: string }) {
    const content = typeof body?.content === 'string' ? body.content : '';
    if (!content.trim()) {
      throw new BadRequestException({
        v: AGENT_API_VERSION,
        success: false,
        error: { code: 'INVALID_CONTENT', message: 'content 必填且非空' },
      });
    }
    const routeKey = typeof body?.routeKey === 'string' && body.routeKey ? body.routeKey : undefined;
    return this.ok(await this.agentService.sendMessage(this.externalId(req), content, { routeKey }));
  }

  /** 只读学情总览。GET /api/v1/agent/me/diagnosis */
  @Get('me/diagnosis')
  @Header('X-Agent-Api-Version', String(AGENT_API_VERSION))
  async diagnosis(@Req() req: Request) {
    return this.ok(await this.agentService.diagnosisOverview(this.externalId(req)));
  }

  /**
   * 只读：列出本机可用 CLI 后端（外部项目探测本机能力）。GET /api/v1/agent/delegate/backends
   * 无注册表 / 无后端 → `{ backends: [] }`，**不报错**（探测面必须永不 5xx）。
   * 注意：`list()` 为可序列化清单（id/label/bin/timeoutMs/resumeKey），不含函数、不含任何凭据。
   */
  @Get('delegate/backends')
  @Header('X-Agent-Api-Version', String(AGENT_API_VERSION))
  backends() {
    const list = this.cliBackends?.list?.() ?? [];
    return this.ok({ backends: list });
  }

  /**
   * 本人最近外部 agent run 列表（B-4）。GET /api/v1/agent/delegate/runs?limit=20
   * 只读；所有权按 req.auth.externalId 隔离（无 studentId 入参可越权）。无 run / 落库失败 → `{ runs: [] }`（探测面永不 5xx）。
   */
  @Get('delegate/runs')
  @Header('X-Agent-Api-Version', String(AGENT_API_VERSION))
  async listRuns(@Req() req: Request, @Query('limit') limit?: string) {
    return this.ok(await this.agentService.listExternalRuns(this.externalId(req), Number(limit) || 20));
  }

  /**
   * 单条 run（B-4）。GET /api/v1/agent/delegate/runs/:runId
   * 他人/不存在 → **404**（结构化 error.code=RUN_NOT_FOUND，不泄露是否存在）。
   */
  @Get('delegate/runs/:runId')
  @Header('X-Agent-Api-Version', String(AGENT_API_VERSION))
  async getRun(@Req() req: Request, @Param('runId') runId: string) {
    const run = await this.agentService.getExternalRun(this.externalId(req), runId);
    if (!run) {
      throw new NotFoundException({
        v: AGENT_API_VERSION,
        success: false,
        error: { code: 'RUN_NOT_FOUND', message: 'run 不存在或无权访问' },
      });
    }
    return this.ok({ run });
  }

  /**
   * run 事件流（SSE，B-4）。GET /api/v1/agent/delegate/runs/:runId/events
   * `text/event-stream`：循 agent.external_events 增量下发（`id`=事件行 id，`event`=kind，`data`=JSON），
   * run 终态后再发一条 `event: status` 并保留 5 秒尾巴即关流。**零新依赖、无 WS**（服务端轮询，间隔 ≤1s）。
   * 他人 run → 404（不进入流）。事件 data 只含 child 派生内容（**不含** argv/prompt/密钥）。
   */
  @Get('delegate/runs/:runId/events')
  async runEvents(@Req() req: Request, @Param('runId') runId: string, @Res() res: Response) {
    const entityId = this.externalId(req);
    // 所有权：先确认 run 属本人（他人 → 404，且不写任何流内容）
    const run = await this.agentService.getExternalRun(entityId, runId);
    if (!run) {
      res.status(404).json({
        v: AGENT_API_VERSION,
        success: false,
        error: { code: 'RUN_NOT_FOUND', message: 'run 不存在或无权访问' },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Agent-Api-Version', String(AGENT_API_VERSION));
    res.flushHeaders?.();

    let lastId = 0;
    let ended = false;
    let pollTimer: NodeJS.Timeout | null = null;
    let tailTimer: NodeJS.Timeout | null = null;
    const clearTimers = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (tailTimer) clearTimeout(tailTimer);
      pollTimer = null;
      tailTimer = null;
    };
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimers();
      try { res.end(); } catch { /* 连接已断 */ }
    };

    const tick = async () => {
      if (ended) return;
      try {
        const r = await this.agentService.listExternalEvents(entityId, runId, lastId);
        if (!r.ok) { end(); return; }
        for (const ev of r.events || []) {
          lastId = Number(ev.id) || lastId;
          res.write(`id: ${ev.id}\nevent: ${ev.kind}\ndata: ${JSON.stringify(ev.data ?? {})}\n\n`);
        }
        // 终态：发 status 尾巴事件 → 停止轮询 → 5 秒后关流
        if (r.run && r.run.status !== 'running') {
          res.write(`event: status\ndata: ${JSON.stringify({ status: r.run.status, error_code: r.run.error_code ?? null })}\n\n`);
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          const tailMs = Number(process.env.AGENT_SSE_TAIL_MS) > 0 ? Number(process.env.AGENT_SSE_TAIL_MS) : AGENT_SSE_TAIL_MS;
          tailTimer = setTimeout(end, tailMs);
          if (typeof tailTimer.unref === 'function') tailTimer.unref();
        }
      } catch { end(); }
    };

    // 客户端断开：只清定时器（不再 res.end）
    req.on('close', () => { ended = true; clearTimers(); });
    void tick();
    const pollMs = Number(process.env.AGENT_SSE_POLL_MS) > 0 ? Number(process.env.AGENT_SSE_POLL_MS) : AGENT_SSE_POLL_MS;
    pollTimer = setInterval(() => void tick(), pollMs);
    if (typeof pollTimer.unref === 'function') pollTimer.unref();
  }
}
