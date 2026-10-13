import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LlmClient } from '@gri/agent-core';
import { loadConfig } from '../../config/config';
import { TaxonomyService } from './taxonomy.service';

/** 解析出的单个维度操作。 */
export interface DimOp {
  dimension: 'region' | 'industry';
  op: 'rename' | 'move' | 'archive';
  id: string;
  name?: string;
  parentId?: string | null;
}

const PLAN_TTL_MS = 10 * 60 * 1000;

/**
 * 维度 AI 命令（P3-S6）：自然语言 → 结构化提案（不落库）→ 确认 → 事务应用 + 审计(source=ai_command)。
 * 解析：优先 LLM（@gri/agent-core LlmClient）；失败/无 key → 规则兜底（确定性可测）。
 */
@Injectable()
export class CommandService {
  private readonly plans = new Map<string, { ops: DimOp[]; at: number }>();
  private readonly llm = new LlmClient(async () => {
    const l = loadConfig().llm;
    return { apiKey: l.apiKey, provider: l.provider, model: l.model, multimodalModel: l.multimodalModel, baseUrl: l.apiUrl };
  });

  constructor(private readonly taxonomy: TaxonomyService) {}

  /** 解析命令 → 提案（校验节点存在；不落库）。 */
  async propose(text: string): Promise<{ planId: string; parsedBy: string; preview: unknown[] }> {
    if (!text || !String(text).trim()) throw new BadRequestException('命令为空');
    // 候选解析：LLM 优先，规则兜底；逐个校验节点存在，取首个全部命中的
    const candidates: Array<[string, DimOp[]]> = [];
    try {
      const l = await this.parseLlm(String(text));
      if (l.length) candidates.push(['llm', l]);
    } catch {
      /* 忽略 LLM 失败，走规则 */
    }
    const r = this.parseRules(String(text));
    if (r.length) candidates.push(['rules', r]);
    if (!candidates.length) {
      throw new BadRequestException('无法理解命令（示例：把行业 A 改名为「农林牧渔」/ 把 011 移到 B / 归档 01）');
    }
    for (const [parsedBy, ops] of candidates) {
      const preview: unknown[] = [];
      let ok = true;
      for (const op of ops) {
        let before = (await this.taxonomy.getNode(op.dimension, op.id).catch(() => null)) as {
          id?: string; name?: string; parentId?: string | null;
        } | null;
        if (!before) {
          // 兼容：命令里写的是「名称」而非编码 → 搜索；唯一命中则采用其 id
          const s = (await this.taxonomy.search(op.dimension, op.id, 5).catch(() => null)) as
            | { items?: Array<{ id: string }> }
            | null;
          const items = (s && s.items) || [];
          if (items.length === 1) {
            op.id = items[0].id;
            before = (await this.taxonomy.getNode(op.dimension, op.id).catch(() => null)) as {
              id?: string; name?: string; parentId?: string | null;
            } | null;
          }
        }
        if (!before) { ok = false; break; }
        preview.push({ ...op, before: { id: before.id, name: before.name, parentId: before.parentId } });
      }
      if (!ok) continue;
      const planId = randomUUID();
      this.plans.set(planId, { ops, at: Date.now() });
      this.gc();
      return { planId, parsedBy, preview };
    }
    throw new BadRequestException('未能匹配到有效节点：请写明维度与编码（如「把行业 A 改名为 X」或「归档 01」）');
  }

  /** 应用提案（校验 planId；事务式逐条应用；审计 source=ai_command）。 */
  async apply(planId: string, actorId: string | null): Promise<{ applied: number; results: unknown[] }> {
    const plan = this.plans.get(planId);
    if (!plan) throw new NotFoundException('提案不存在或已过期（请重新下达命令）');
    if (Date.now() - plan.at > PLAN_TTL_MS) {
      this.plans.delete(planId);
      throw new BadRequestException('提案已过期（>10 分钟）');
    }
    const results: unknown[] = [];
    for (const op of plan.ops) {
      if (op.op === 'rename') {
        if (!op.name) throw new BadRequestException(`rename 缺 name：${op.id}`);
        results.push(await this.taxonomy.updateNode(op.dimension, op.id, { name: op.name }, actorId, 'ai_command'));
      } else if (op.op === 'move') {
        results.push(await this.taxonomy.moveNode(op.dimension, op.id, op.parentId ?? null, actorId, 'ai_command'));
      } else if (op.op === 'archive') {
        results.push(await this.taxonomy.archiveNode(op.dimension, op.id, actorId, 'ai_command'));
      }
    }
    this.plans.delete(planId);
    return { applied: results.length, results };
  }

  // ── LLM 解析 ──
  private async parseLlm(text: string): Promise<DimOp[]> {
    const sys =
      '你是 GRI 维度治理命令解析器。把用户指令转换为 JSON 数组，每项形如 ' +
      '{"dimension":"region"|"industry","op":"rename"|"move"|"archive","id":"<节点id/code>","name":"<新名，仅rename>","parentId":"<新父id，仅move，可为null>"}。' +
      '规则：region 的 id 是数字编码（如 100000），industry 的 id 是编码（如 A、01、011）；未指明维度时默认 industry。'+
      '必须使用用户给定的准确编码，**绝不臆造或拼接编码**；若无法确定准确编码，返回空数组 []。只输出 JSON 数组，不要解释。';
    const res = await this.llm.chat(
      [{ role: 'system', content: sys }, { role: 'user', content: text }],
      'default',
      { temperature: 0, max_tokens: 800 },
    );
    const content = res && res.content ? String(res.content) : '';
    const m = content.match(/\[[\s\S]*\]/);
    if (!m) return [];
    return this.normalize(JSON.parse(m[0]));
  }

  // ── 规则兜底（确定性）──
  private parseRules(text: string): DimOp[] {
    const t = text.trim();
    const dimension: DimOp['dimension'] = /区域|region/i.test(t) ? 'region' : 'industry';
    let m: RegExpMatchArray | null;
    if ((m = t.match(/([A-Za-z0-9]{1,18})\s*(?:改名为|更名为|改名|重命名为)\s*[「『"']?([^」』"'\s]+)[」』"']?/))) {
      return [{ dimension, op: 'rename', id: m[1], name: m[2] }];
    }
    if ((m = t.match(/([A-Za-z0-9]{1,18})\s*(?:移到|移动到|移动至)\s*([A-Za-z0-9]{1,18})/))) {
      return [{ dimension, op: 'move', id: m[1], parentId: m[2] }];
    }
    if ((m = t.match(/(?:归档|停用)\s*([A-Za-z0-9]{1,18})/))) {
      return [{ dimension, op: 'archive', id: m[1] }];
    }
    return [];
  }

  private normalize(arr: unknown): DimOp[] {
    if (!Array.isArray(arr)) return [];
    const out: DimOp[] = [];
    for (const raw of arr) {
      const o = raw as Record<string, unknown>;
      if (!o || typeof o !== 'object') continue;
      const dimension = o.dimension === 'region' ? 'region' : 'industry';
      const op = o.op === 'rename' || o.op === 'move' || o.op === 'archive' ? o.op : null;
      if (!op || o.id === undefined || o.id === null) continue;
      out.push({
        dimension,
        op,
        id: String(o.id),
        name: o.name !== undefined ? String(o.name) : undefined,
        parentId: o.parentId !== undefined && o.parentId !== null ? String(o.parentId) : null,
      });
    }
    return out;
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, v] of this.plans) if (now - v.at > PLAN_TTL_MS) this.plans.delete(k);
  }
}
