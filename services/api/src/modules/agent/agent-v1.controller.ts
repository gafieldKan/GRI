import { Controller, Get, Post, Body, Req, Header, Inject, Optional, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { AgentService, AGENT_CLI_BACKENDS } from './agent.service';
import type { CliBackendRegistry } from '@gri/agent-core';

/** v1 契约版本号（随 body `v` 与响应头 `X-Agent-Api-Version` 同时下发）。 */
export const AGENT_API_VERSION = 1;

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
}
