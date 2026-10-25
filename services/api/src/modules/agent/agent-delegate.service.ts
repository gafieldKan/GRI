/**
 * 外部 agent 委派 run 生命周期（W2.2「拆神服务」第二片 —— 从 agent.service.ts 抽出）。
 *
 * B-4 的这一面本已自洽：建 running 行 → 跑外部 agent → 落终态（external_runs）+ 事件流
 * （external_events，SSE 增量下发）+ 重启对账 + 机器错误码归一。全部 best-effort，失败不阻断对话。
 *
 * 独立成件后 agent.service.ts 只留装配与面板；委派面自带 ALS 行级上下文与自己的 Store 适配。
 * 所有权铁律不变：一律按 entity_id 读写（读侧隔离在 SQL 谓词里）。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { createDelegateTool, storeFrom } from '@gri/agent-core';
import type { CliBackendRegistry } from '@gri/agent-core';

/**
 * 外部 agent run 的 `error_code` 取值集（B-4 §目标4）。
 * `status='failed'` 的 run 必带其一（绝不静默）；写进契约 docs/AGENT_PUBLIC_CONTRACT.md §三。
 */
export const EXTERNAL_RUN_ERROR_CODES = Object.freeze([
  'TIMEOUT',              // 超时杀进程组
  'NONZERO_EXIT',         // 后端非零退出
  'EMPTY_TEXT',           // 正常退出但无可用文本
  'BACKEND_NOT_FOUND',    // 未知后端 id / CLI 未安装
  'GOAL_MISSING',         // 缺少 goal
  'CWD_DENIED',           // cwd 越出白名单
  'REGISTRY_NOT_INJECTED',// 未注入 CliBackendRegistry
  'INTERRUPTED',          // 重启对账：宿主重启时残留 running 的孤儿 run
] as const);

export class AgentDelegateRunsService {
  /**
   * 外部 agent 委派 run 的**行级上下文**（B-4）：把 runId 带给 onEvent/落库，
   * 而**不改**工厂签名（`createDelegateTool` 依旧只收 onEvent 回调孔）。
   * Node 内置 `AsyncLocalStorage`，零依赖；底座仍不碰 DB（落库全在本 host 层）。
   */
  private readonly delegateAls = new AsyncLocalStorage<{ runId: string; chain: Promise<void> }>();

  constructor(
    private readonly db: DatabaseService,
    private readonly cliBackends?: CliBackendRegistry | null,
  ) {}

  /** Store 适配：把 DatabaseService 拧成 agent-core 的 {query}。 */
  private _store() {
    return storeFrom((text: string, params?: unknown[]) => this.db.query(text, params));
  }

  /**
   * 构造**宿主接管**后的 `agent.delegate` 工具（B-4）：
   *   - onEvent 回调孔 → 宿主逐条落 `agent.external_events`（runId 经 ALS 带入，不改工厂签名）；
   *   - schema 增 `mode?: 'sync'|'async'`（缺省 sync，行为与今日逐字一致；async 为 v1 扩展）；
   *   - execute 包一层 → `_delegateExecute`（建行 → 跑 → 落终态）。
   */
  _delegateTool(): any {
    const raw: any = createDelegateTool({
      cliBackends: this.cliBackends ?? null,
      cwdAllowlist: this._delegateCwdAllowlist(),
      onEvent: (event: any, ctx: any) => void this._onDelegateEvent(event, ctx),
    });
    const inputSchema = {
      ...(raw.inputSchema || {}),
      properties: {
        ...((raw.inputSchema && raw.inputSchema.properties) || {}),
        mode: {
          type: 'string',
          enum: ['sync', 'async'],
          description:
            '执行模式：sync（缺省，等结果一并返回）/ async（立即返回 runId，后台执行；用 /api/v1/agent/delegate/runs 查状态与事件流）',
        },
      },
    };
    return { ...raw, inputSchema, execute: (ctx: any, args: any = {}) => this._delegateExecute(raw, ctx, args) };
  }

  // ---------------------------------------------------------------------------
  // B-4：外部 agent run 生命周期（external_runs / external_events）——全部 best-effort
  // ---------------------------------------------------------------------------

  /** 一次委派：先建 running 行 → 跑 → 落终态（sync/async 统一）。sync 缺省行为与今日逐字一致。 */
  async _delegateExecute(raw: any, ctx: any, args: any = {}): Promise<any> {
    const entityId = typeof ctx?.entityId === 'string' ? ctx.entityId : null;
    const backend = typeof args.backend === 'string' ? args.backend.trim() : '';
    const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
    const mode: 'sync' | 'async' = args.mode === 'async' ? 'async' : 'sync';
    const runId = randomUUID();
    await this._createExternalRun({ runId, entityId, backend, goal, mode });
    const store = { runId, chain: Promise.resolve() };
    const startedAt = Date.now();

    if (mode === 'async') {
      // 立即返回（对话继续）；后台执行 + 落终态（C4：返回 runId 必有终态）。
      // 后台走**同一路径** raw.execute（沿用 cwd 白名单/DENYLIST/goal 校验 + 进程组超时，不复制校验）。
      void this.delegateAls.run(store, async () => {
        let result: any;
        try {
          result = await raw.execute(ctx, args);
        } catch (e: any) {
          result = { ok: false, backend, error: `委派失败：${e?.message ? e.message : String(e)}` };
        }
        await this._finishExternalRun(runId, result, startedAt, store.chain);
      });
      return { ok: true, async: true, runId, status: 'running', backend };
    }

    // sync：与今日一致的路径，仅多一次 best-effort 落行/落事件（失败静默，不阻断对话）。
    let result: any;
    try {
      result = await this.delegateAls.run(store, () => raw.execute(ctx, args));
    } catch (e: any) {
      result = { ok: false, backend, error: `委派失败：${e?.message ? e.message : String(e)}` };
    }
    await this._finishExternalRun(runId, result, startedAt, store.chain);
    return result;
  }

  /** onEvent 回调孔 → 落 external_events（best-effort；runId 由 ALS 带入；只存 child 派生 kind/data）。 */
  async _onDelegateEvent(event: any, _ctx: any): Promise<void> {
    const store = this.delegateAls.getStore();
    if (!store) return; // 无 run 上下文 → 不落库（不伪造 run）
    const kind = typeof event?.kind === 'string' ? event.kind : 'unknown';
    const data = event?.data ?? {};
    // 串行链：保事件在库中按发生序落入（bigserial id 单调），供 SSE 增量下发。
    store.chain = store.chain.then(() => this._recordExternalEvent(store.runId, kind, data)).catch(() => {});
    await store.chain;
  }

  /** 建 run 行（status=running）。best-effort：失败静默不阻断对话（与 tool_runs 审计同格）。 */
  private async _createExternalRun(m: { runId: string; entityId: string | null; backend: string; goal: string; mode: 'sync' | 'async' }): Promise<void> {
    if (!m.entityId) return; // 无 entity 真源 → 不建行（所有权铁律：读侧按 entity_id 隔离）
    try {
      await this._store().query(
        `INSERT INTO agent.external_runs (run_id, entity_id, backend, goal, mode, status)
         VALUES ($1, $2, $3, $4, $5, 'running')`,
        [m.runId, m.entityId, m.backend || null, m.goal || null, m.mode],
      );
    } catch { /* best-effort：落库失败不阻断对话 */ }
  }

  /** 落终态（done/failed + summary/exit_code/timed_out/error_code/latency_ms/resume_key）。best-effort。 */
  private async _finishExternalRun(runId: string, result: any, startedAt: number, chain: Promise<void>): Promise<void> {
    try { await chain; } catch { /* 事件队列异常不阻断终态 */ } // 先冲事件队列（保序）再落终态
    const ok = !!(result && result.ok);
    const latencyMs = Date.now() - startedAt;
    try {
      await this._store().query(
        `UPDATE agent.external_runs
            SET status = $2, error_code = $3, summary = $4, exit_code = $5,
                timed_out = $6, resume_key = $7, latency_ms = $8, finished_at = NOW()
          WHERE run_id = $1`,
        [
          runId,
          ok ? 'done' : 'failed',
          ok ? null : this._classifyDelegateError(result),
          ok && typeof result?.summary === 'string' ? result.summary : null,
          Number.isFinite(Number(result?.exitCode)) ? Number(result.exitCode) : null,
          !!result?.timedOut,
          typeof result?.sessionId === 'string' && result.sessionId ? result.sessionId : null,
          latencyMs,
        ],
      );
    } catch { /* best-effort */ }
  }

  /** 单条事件落库（data 只含 child 派生内容；JSON 编码）。best-effort。 */
  private async _recordExternalEvent(runId: string, kind: string, data: any): Promise<void> {
    try {
      await this._store().query(
        `INSERT INTO agent.external_events (run_id, kind, data) VALUES ($1, $2, $3::jsonb)`,
        [runId, kind, JSON.stringify(data ?? {})],
      );
    } catch { /* best-effort：事件落库失败不阻断 */ }
  }

  /**
   * 失败归一为机器码（B-4 §目标4）。先看结构化字段（timedOut/exitCode），再按 delegate 稳定错误文案兜底。
   * 取值集见 EXTERNAL_RUN_ERROR_CODES。
   */
  _classifyDelegateError(result: any): string {
    if (!result) return 'NONZERO_EXIT';
    if (result.timedOut) return 'TIMEOUT';
    if (result.exitCode != null && Number(result.exitCode) !== 0) return 'NONZERO_EXIT';
    const msg = String(result.error || '');
    if (/未注入 CliBackendRegistry/.test(msg)) return 'REGISTRY_NOT_INJECTED';
    if (/缺少 goal/.test(msg)) return 'GOAL_MISSING';
    if (/缺少 backend/.test(msg)) return 'BACKEND_NOT_FOUND';
    if (/越界/.test(msg)) return 'CWD_DENIED';
    if (/未安装|spawn 失败|未知 CLI 后端/.test(msg)) return 'BACKEND_NOT_FOUND';
    if (/超时/.test(msg)) return 'TIMEOUT';
    if (/空文本/.test(msg)) return 'EMPTY_TEXT';
    return 'NONZERO_EXIT';
  }

  /** 重启对账：宿主启动时把残留 status='running' 的孤儿 run 置 failed/INTERRUPTED（B-4 §目标4）。 */
  async reconcileInterruptedRuns(): Promise<number> {
    try {
      const res = await this._store().query(
        `UPDATE agent.external_runs
            SET status = 'failed', error_code = 'INTERRUPTED', finished_at = NOW()
          WHERE status = 'running'`,
      );
      return res.rowCount ?? 0;
    } catch {
      return 0; // 表未就绪（迁移未跑）/失败 → 静默（best-effort）
    }
  }

  /** 本人最近 run 列表（GET /api/v1/agent/delegate/runs；所有权按 entity_id 隔离）。 */
  async listExternalRuns(entityId: string, limit = 20): Promise<{ runs: any[] }> {
    const n = Math.max(1, Math.min(Number(limit) || 20, 100));
    try {
      const { rows } = await this._store().query(
        `SELECT run_id, backend, goal, mode, resume_key, status, error_code, summary,
                exit_code, timed_out, latency_ms, created_at, finished_at
           FROM agent.external_runs
          WHERE entity_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [entityId, n],
      );
      return { runs: rows };
    } catch {
      return { runs: [] };
    }
  }

  /** 单条 run（GET /api/v1/agent/delegate/runs/:runId）——他人/不存在 → null（控制器回 404）。 */
  async getExternalRun(entityId: string, runId: string): Promise<any | null> {
    try {
      const { rows } = await this._store().query(
        `SELECT run_id, backend, goal, mode, resume_key, status, error_code, summary,
                exit_code, timed_out, latency_ms, created_at, finished_at
           FROM agent.external_runs
          WHERE run_id = $1 AND entity_id = $2`,
        [runId, entityId],
      );
      return rows[0] ?? null;
    } catch {
      return null; // runId 非 uuid 等 → 视作不存在（404）
    }
  }

  /**
   * 增量拉某 run 的事件（SSE 面用）：先校验所有权（非本人 → ok:false），再按 (run_id, id) 递增取。
   * @param afterId 只取 id > afterId 的事件（增量）
   */
  async listExternalEvents(entityId: string, runId: string, afterId = 0): Promise<{ ok: boolean; run?: any; events?: any[] }> {
    const run = await this.getExternalRun(entityId, runId);
    if (!run) return { ok: false };
    try {
      const { rows } = await this._store().query(
        `SELECT id, kind, data, created_at
           FROM agent.external_events
          WHERE run_id = $1 AND id > $2
          ORDER BY id ASC
          LIMIT 200`,
        [runId, Number(afterId) || 0],
      );
      return { ok: true, run, events: rows };
    } catch {
      return { ok: true, run, events: [] };
    }
  }

  /** 委派 cwd 白名单（宿主配置面）：AGENT_DELEGATE_CWD_ALLOWLIST（逗号分隔）→ 默认 GRI 工作树。 */
  private _delegateCwdAllowlist(): string[] {
    const raw = process.env.AGENT_DELEGATE_CWD_ALLOWLIST;
    const list = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return list.length ? list : ['/home/ubantu/GRI'];
  }
}
