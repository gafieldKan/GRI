import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  IndustryTaxonomyRow,
  RegionTaxonomyRow,
  TaxonomyChildren,
  TaxonomyName,
  TaxonomyNode,
  TaxonomyPath,
  TaxonomySearch,
} from './taxonomy.types';

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
const REGION_ID_PATTERN = /^\d{1,18}$/;
const INDUSTRY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;
const ACTIVE_REGION = "(r.status = 'active' OR r.status IS NULL)";
const ACTIVE_INDUSTRY = "(i.status = 'active' OR i.status IS NULL)";

const REGION_NODE_SELECT = `
  SELECT r.node_id AS id,
         r.code,
         r.name,
         r.short,
         r.english,
         r.level,
         r.iso2,
         r.iso3,
         r.center,
         parent.node_id AS parent_id,
         EXISTS (
           SELECT 1
             FROM ontology.region child
            WHERE child.parent_id = r.id
              AND (child.status = 'active' OR child.status IS NULL)
         ) AS has_children,
         (
           SELECT count(*)::int
             FROM ontology.region child
            WHERE child.parent_id = r.id
              AND (child.status = 'active' OR child.status IS NULL)
         ) AS child_count
    FROM ontology.region r
    LEFT JOIN ontology.region parent ON parent.id = r.parent_id
`;

const INDUSTRY_NODE_SELECT = `
  SELECT i.code AS id,
         i.code,
         i.name,
         i.short,
         i.en AS english,
         i.level,
         parent.code AS parent_id,
         i.section,
         i.intro,
         i.includes,
         i.also,
         i.excludes,
         i.refs,
         i.updated,
         EXISTS (
           SELECT 1
             FROM ontology.industry child
            WHERE child.parent_id = i.id
              AND (child.status = 'active' OR child.status IS NULL)
         ) AS has_children,
         (
           SELECT count(*)::int
             FROM ontology.industry child
            WHERE child.parent_id = i.id
              AND (child.status = 'active' OR child.status IS NULL)
         ) AS child_count
    FROM ontology.industry i
    LEFT JOIN ontology.industry parent ON parent.id = i.parent_id
`;

@Injectable()
export class TaxonomyService {
  constructor(private readonly db: DatabaseService) {}

  async children(name: string, parent?: string): Promise<TaxonomyChildren> {
    const kind = this.resolveName(name);
    const parentId = parent === undefined ? undefined : this.validateId(kind, parent);
    const parentRow = await this.findParent(kind, parentId);
    const rows = await this.findDirectChildren(kind, parentRow.id);

    return {
      parent: kind === 'region'
        ? this.mapRegion(parentRow as RegionTaxonomyRow)
        : this.mapIndustry(parentRow as IndustryTaxonomyRow),
      children: rows.map((row) =>
        kind === 'region'
          ? this.mapRegion(row as RegionTaxonomyRow)
          : this.mapIndustry(row as IndustryTaxonomyRow),
      ),
    };
  }

  async getNode(name: string, id: string): Promise<TaxonomyNode> {
    const kind = this.resolveName(name);
    const nodeId = this.validateId(kind, id);
    const row = await this.findNode(kind, nodeId);
    if (!row) throw new NotFoundException('节点不存在');
    return kind === 'region'
      ? this.mapRegion(row as RegionTaxonomyRow)
      : this.mapIndustry(row as IndustryTaxonomyRow);
  }

  async search(
    name: string,
    q: string | undefined,
    limitInput?: string | number,
  ): Promise<TaxonomySearch> {
    const kind = this.resolveName(name);
    const query = typeof q === 'string' ? q.trim() : '';
    if (!query || query.length > 100) {
      throw new BadRequestException('q 必须为 1-100 个字符');
    }
    const limit = this.parseLimit(limitInput);
    const rows = kind === 'region'
      ? await this.searchRegions(query, limit)
      : await this.searchIndustries(query, limit);

    return {
      query,
      limit,
      items: rows.map((row) =>
        kind === 'region'
          ? this.mapRegion(row as RegionTaxonomyRow)
          : this.mapIndustry(row as IndustryTaxonomyRow),
      ),
    };
  }

  async path(name: string, id: string): Promise<TaxonomyPath> {
    const kind = this.resolveName(name);
    const nodeId = this.validateId(kind, id);
    const rows = kind === 'region'
      ? await this.pathRegions(nodeId)
      : await this.pathIndustries(nodeId);
    if (rows.length === 0) throw new NotFoundException('节点不存在');

    return {
      nodes: rows.map((row) =>
        kind === 'region'
          ? this.mapRegion(row as RegionTaxonomyRow)
          : this.mapIndustry(row as IndustryTaxonomyRow),
      ),
    };
  }

  /** 移动节点到新父级（防环）；写审计。 */
  async moveNode(
    name: string,
    id: string,
    parentId: unknown,
    actorId: string | null,
  ): Promise<TaxonomyNode> {
    const kind = this.resolveName(name);
    const nodeId = this.validateId(kind, id);
    const before = await this.findNode(kind, nodeId);
    if (!before) throw new NotFoundException('节点不存在');
    const table = kind === 'region' ? 'ontology.region' : 'ontology.industry';
    const key = kind === 'region' ? 'node_id' : 'code';
    let newParent: string | null = null;
    const raw = parentId === undefined || parentId === null ? '' : String(parentId);
    if (raw !== '') {
      newParent = this.validateId(kind, raw);
      const p = await this.findNode(kind, newParent);
      if (!p) throw new NotFoundException('目标父级不存在');
      if (String(newParent) === String(nodeId)) throw new BadRequestException('不能移动到自身');
      let cur: string | null = newParent; let guard = 0;
      while (cur != null && guard++ < 500) {
        if (String(cur) === String(nodeId)) throw new BadRequestException('不能移动到自身后代下');
        const row = (await this.findNode(kind, cur)) as { parent_id?: string | null } | null;
        cur = row ? (row.parent_id ?? null) : null;
      }
    }
    await this.db.query(
      `UPDATE ${table} SET parent_id = (SELECT id FROM ${table} WHERE ${key} = $1) WHERE ${key} = $2`,
      [newParent, nodeId],
    );
    await this.db.query(
      `INSERT INTO ontology.dimension_change_log (dimension, target_id, op, before, after, actor_id, source)
       VALUES ($1, $2, 'move', $3, $4, $5, 'manual')`,
      [kind, nodeId, JSON.stringify(before), JSON.stringify({ parent: newParent }), actorId],
    );
    const after = (await this.findNode(kind, nodeId)) as RegionTaxonomyRow | IndustryTaxonomyRow;
    return kind === 'region' ? this.mapRegion(after as RegionTaxonomyRow) : this.mapIndustry(after as IndustryTaxonomyRow);
  }

  /** 归档（停用）节点：status='archived'；写审计。 */
  async archiveNode(name: string, id: string, actorId: string | null): Promise<TaxonomyNode> {
    const kind = this.resolveName(name);
    const nodeId = this.validateId(kind, id);
    const before = await this.findNode(kind, nodeId);
    if (!before) throw new NotFoundException('节点不存在');
    const beforeNode = kind === 'region'
      ? this.mapRegion(before as RegionTaxonomyRow)
      : this.mapIndustry(before as IndustryTaxonomyRow);
    const table = kind === 'region' ? 'ontology.region' : 'ontology.industry';
    const key = kind === 'region' ? 'node_id' : 'code';
    await this.db.query(`UPDATE ${table} SET status = 'archived' WHERE ${key} = $1`, [nodeId]);
    await this.db.query(
      `INSERT INTO ontology.dimension_change_log (dimension, target_id, op, before, after, actor_id, source)
       VALUES ($1, $2, 'archive', $3, $4, $5, 'manual')`,
      [kind, nodeId, JSON.stringify(beforeNode), JSON.stringify({ status: 'archived' }), actorId],
    );
    return beforeNode;
  }

  /** 维度节点维护（改 name/short/english|en）；operator 门禁在 controller；写审计。 */
  async updateNode(
    name: string,
    id: string,
    patch: Record<string, unknown>,
    actorId: string | null,
  ): Promise<TaxonomyNode> {
    const kind = this.resolveName(name);
    const nodeId = this.validateId(kind, id);
    const before = await this.findNode(kind, nodeId);
    if (!before) throw new NotFoundException('节点不存在');
    const table = kind === 'region' ? 'ontology.region' : 'ontology.industry';
    const key = kind === 'region' ? 'node_id' : 'code';
    const map: Record<string, string> = kind === 'region'
      ? { name: 'name', short: 'short', english: 'english' }
      : { name: 'name', short: 'short', en: 'en' };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined && patch[k] !== null) {
        params.push(String(patch[k]));
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) throw new BadRequestException('无可更新字段（允许 name/short/english|en）');
    params.push(nodeId);
    await this.db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${key} = $${params.length}`, params);
    await this.db.query(
      `INSERT INTO ontology.dimension_change_log (dimension, target_id, op, before, after, actor_id, source)
       VALUES ($1, $2, 'update', $3, $4, $5, 'manual')`,
      [kind, nodeId, JSON.stringify(before), JSON.stringify(patch), actorId],
    );
    const after = (await this.findNode(kind, nodeId)) as RegionTaxonomyRow | IndustryTaxonomyRow;
    return kind === 'region'
      ? this.mapRegion(after as RegionTaxonomyRow)
      : this.mapIndustry(after as IndustryTaxonomyRow);
  }

  /** 维度变更审计流水（治理查看）。 */
  async changes(name: string, limit = 50): Promise<unknown[]> {
    const kind = this.resolveName(name);
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const result = await this.db.query(
      `SELECT id, dimension, target_id, op, before, after, actor_id, source, created_at
         FROM ontology.dimension_change_log WHERE dimension = $1
        ORDER BY created_at DESC LIMIT $2`,
      [kind, lim],
    );
    return result.rows as unknown[];
  }

  /** 全树（参考 Explorer 同形）：region 用 node_id/english，industry 用 code/en。 */
  async fullTree(name: string): Promise<{ nodes: unknown[] }> {
    const kind = this.resolveName(name);
    if (kind === 'region') {
      const result = await this.db.query(
        `SELECT r.node_id, r.code, r.name, r.short, r.english, r.level,
                r.iso2, r.iso3, r.center, r.admin_type, r.alias, r.note, r.source,
                p.node_id AS parent_node_id
           FROM ontology.region r
           LEFT JOIN ontology.region p ON p.id = r.parent_id`,
      );
      const rows = result.rows as Array<Record<string, any>>;
      const kids = new Map<string, number[]>();
      for (const r of rows) {
        if (r.parent_node_id != null) {
          const k = String(r.parent_node_id);
          let arr = kids.get(k); if (!arr) { arr = []; kids.set(k, arr); }
          arr.push(Number(r.node_id));
        }
      }
      return { nodes: rows.map((r) => ({
        id: Number(r.node_id), code: r.code, name: r.name, short: r.short, english: r.english,
        level: r.level, iso2: r.iso2, iso3: r.iso3, center: r.center, adminType: r.admin_type,
        alias: r.alias, note: r.note, source: r.source,
        parent: r.parent_node_id != null ? Number(r.parent_node_id) : null,
        children: kids.get(String(r.node_id)) ?? [],
      })) };
    }
    const result = await this.db.query(
      `SELECT i.code, i.name, i.short, i.en, i.level, i.section, i.intro,
              i.includes, i.also, i.excludes, i.refs, i.updated, p.code AS parent_code
         FROM ontology.industry i
         LEFT JOIN ontology.industry p ON p.id = i.parent_id`,
    );
    const rows = result.rows as Array<Record<string, any>>;
    const kids = new Map<string, string[]>();
    for (const r of rows) {
      if (r.parent_code != null) {
        const k = String(r.parent_code);
        let arr = kids.get(k); if (!arr) { arr = []; kids.set(k, arr); }
        arr.push(r.code);
      }
    }
    return { nodes: rows.map((r) => ({
      id: r.code, code: r.code, name: r.name, short: r.short, en: r.en, level: r.level,
      section: r.section, intro: r.intro, includes: r.includes, also: r.also,
      excludes: r.excludes, refs: r.refs, updated: r.updated,
      parent: r.parent_code != null ? r.parent_code : null,
      children: kids.get(String(r.code)) ?? [],
    })) };
  }

  private resolveName(name: string): TaxonomyName {
    const normalized = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!normalized) throw new BadRequestException('分类名称不能为空');
    if (normalized === 'region' || normalized === 'industry') return normalized;
    throw new NotFoundException('未知分类维度');
  }

  private validateId(kind: TaxonomyName, id: string): string {
    const normalized = typeof id === 'string' ? id.trim() : '';
    const pattern = kind === 'region' ? REGION_ID_PATTERN : INDUSTRY_ID_PATTERN;
    if (!normalized || !pattern.test(normalized)) {
      throw new BadRequestException('节点 id 非法');
    }
    return normalized;
  }

  private parseLimit(input?: string | number): number {
    const value = input === undefined || input === ''
      ? DEFAULT_SEARCH_LIMIT
      : Number(input);
    if (!Number.isInteger(value) || value < 1 || value > MAX_SEARCH_LIMIT) {
      throw new BadRequestException(`limit 必须为 1-${MAX_SEARCH_LIMIT} 的整数`);
    }
    return value;
  }

  private async findParent(
    kind: TaxonomyName,
    parentId?: string,
  ): Promise<RegionTaxonomyRow | IndustryTaxonomyRow> {
    const sql = kind === 'region'
      ? parentId
        ? `${REGION_NODE_SELECT} WHERE r.node_id = $1 AND ${ACTIVE_REGION} LIMIT 1`
        : `${REGION_NODE_SELECT} WHERE r.level = 'world' AND r.parent_id IS NULL AND ${ACTIVE_REGION} ORDER BY r.sort_order ASC NULLS LAST, r.node_id ASC LIMIT 1`
      : parentId
        ? `${INDUSTRY_NODE_SELECT} WHERE i.code = $1 AND ${ACTIVE_INDUSTRY} LIMIT 1`
        : `${INDUSTRY_NODE_SELECT} WHERE i.level = 'root' AND i.parent_id IS NULL AND ${ACTIVE_INDUSTRY} ORDER BY i.sort_order ASC NULLS LAST, i.code ASC LIMIT 1`;
    const result = await this.db.query(sql, parentId ? [parentId] : []);
    const row = result.rows[0] as RegionTaxonomyRow | IndustryTaxonomyRow | undefined;
    if (!row) throw new NotFoundException('节点不存在');
    return row;
  }

  private async findNode(
    kind: TaxonomyName,
    id: string,
  ): Promise<RegionTaxonomyRow | IndustryTaxonomyRow | undefined> {
    const sql = kind === 'region'
      ? `${REGION_NODE_SELECT} WHERE r.node_id = $1 AND ${ACTIVE_REGION} LIMIT 1`
      : `${INDUSTRY_NODE_SELECT} WHERE i.code = $1 AND ${ACTIVE_INDUSTRY} LIMIT 1`;
    const result = await this.db.query(sql, [id]);
    return result.rows[0] as RegionTaxonomyRow | IndustryTaxonomyRow | undefined;
  }

  private async findDirectChildren(
    kind: TaxonomyName,
    parentId: string,
  ): Promise<Array<RegionTaxonomyRow | IndustryTaxonomyRow>> {
    if (kind === 'region') {
      const result = await this.db.query(
        `SELECT c.node_id AS id,
                c.code,
                c.name,
                c.short,
                c.english,
                c.level,
                c.iso2,
                c.iso3,
                c.center,
                p.node_id AS parent_id,
                EXISTS (
                  SELECT 1
                    FROM ontology.region child
                   WHERE child.parent_id = c.id
                     AND (child.status = 'active' OR child.status IS NULL)
                ) AS has_children,
                (
                  SELECT count(*)::int
                    FROM ontology.region child
                   WHERE child.parent_id = c.id
                     AND (child.status = 'active' OR child.status IS NULL)
                ) AS child_count
           FROM ontology.region p
           JOIN ontology.region c ON c.parent_id = p.id
          WHERE p.node_id = $1
            AND (c.status = 'active' OR c.status IS NULL)
          ORDER BY c.sort_order ASC NULLS LAST, c.name ASC, c.node_id ASC`,
        [parentId],
      );
      return result.rows as RegionTaxonomyRow[];
    }

    const result = await this.db.query(
      `SELECT c.code AS id,
              c.code,
              c.name,
              c.short,
              c.en AS english,
              c.level,
              p.code AS parent_id,
              c.section,
              c.intro,
              c.includes,
              c.also,
              c.excludes,
              c.refs,
              c.updated,
              EXISTS (
                SELECT 1
                  FROM ontology.industry child
                 WHERE child.parent_id = c.id
                   AND (child.status = 'active' OR child.status IS NULL)
              ) AS has_children,
              (
                SELECT count(*)::int
                  FROM ontology.industry child
                 WHERE child.parent_id = c.id
                   AND (child.status = 'active' OR child.status IS NULL)
              ) AS child_count
         FROM ontology.industry p
         JOIN ontology.industry c ON c.parent_id = p.id
        WHERE p.code = $1
          AND (c.status = 'active' OR c.status IS NULL)
        ORDER BY c.sort_order ASC NULLS LAST, c.name ASC, c.code ASC`,
      [parentId],
    );
    return result.rows as IndustryTaxonomyRow[];
  }

  private async searchRegions(
    query: string,
    limit: number,
  ): Promise<RegionTaxonomyRow[]> {
    const result = await this.db.query(
      `${REGION_NODE_SELECT}
        WHERE ${ACTIVE_REGION}
          AND (
            r.name ILIKE '%' || $1 || '%'
            OR r.short ILIKE '%' || $1 || '%'
            OR r.english ILIKE '%' || $1 || '%'
            OR r.code ILIKE '%' || $1 || '%'
            OR r.node_id ILIKE '%' || $1 || '%'
          )
        ORDER BY CASE
                   WHEN lower(r.name) = lower($1) THEN 0
                   WHEN r.code = $1 OR r.node_id = $1 THEN 1
                   ELSE 2
                 END,
                 r.sort_order ASC NULLS LAST,
                 r.name ASC,
                 r.node_id ASC
        LIMIT $2`,
      [query, limit],
    );
    return result.rows as RegionTaxonomyRow[];
  }

  private async searchIndustries(
    query: string,
    limit: number,
  ): Promise<IndustryTaxonomyRow[]> {
    const result = await this.db.query(
      `${INDUSTRY_NODE_SELECT}
        WHERE ${ACTIVE_INDUSTRY}
          AND (
            i.name ILIKE '%' || $1 || '%'
            OR i.short ILIKE '%' || $1 || '%'
            OR i.en ILIKE '%' || $1 || '%'
            OR i.code ILIKE '%' || $1 || '%'
          )
        ORDER BY CASE
                   WHEN lower(i.name) = lower($1) THEN 0
                   WHEN i.code = $1 THEN 1
                   ELSE 2
                 END,
                 i.sort_order ASC NULLS LAST,
                 i.name ASC,
                 i.code ASC
        LIMIT $2`,
      [query, limit],
    );
    return result.rows as IndustryTaxonomyRow[];
  }

  private async pathRegions(id: string): Promise<RegionTaxonomyRow[]> {
    const result = await this.db.query(
      `WITH RECURSIVE ancestry AS (
         SELECT r.id,
                r.node_id,
                r.code,
                r.name,
                r.short,
                r.english,
                r.level,
                r.iso2,
                r.iso3,
                r.center,
                r.parent_id,
                0 AS depth
           FROM ontology.region r
          WHERE r.node_id = $1
            AND (r.status = 'active' OR r.status IS NULL)
         UNION ALL
         SELECT parent.id,
                parent.node_id,
                parent.code,
                parent.name,
                parent.short,
                parent.english,
                parent.level,
                parent.iso2,
                parent.iso3,
                parent.center,
                parent.parent_id,
                ancestry.depth + 1
           FROM ontology.region parent
           JOIN ancestry ON ancestry.parent_id = parent.id
          WHERE parent.status = 'active' OR parent.status IS NULL
       )
       SELECT ancestry.node_id AS id,
              ancestry.code,
              ancestry.name,
              ancestry.short,
              ancestry.english,
              ancestry.level,
              ancestry.iso2,
              ancestry.iso3,
              ancestry.center,
              parent.node_id AS parent_id,
              EXISTS (
                SELECT 1
                  FROM ontology.region child
                 WHERE child.parent_id = ancestry.id
                   AND (child.status = 'active' OR child.status IS NULL)
              ) AS has_children,
              (
                SELECT count(*)::int
                  FROM ontology.region child
                 WHERE child.parent_id = ancestry.id
                   AND (child.status = 'active' OR child.status IS NULL)
              ) AS child_count
         FROM ancestry
         LEFT JOIN ontology.region parent ON parent.id = ancestry.parent_id
        ORDER BY ancestry.depth DESC`,
      [id],
    );
    return result.rows as RegionTaxonomyRow[];
  }

  private async pathIndustries(id: string): Promise<IndustryTaxonomyRow[]> {
    const result = await this.db.query(
      `WITH RECURSIVE ancestry AS (
         SELECT i.id,
                i.code,
                i.name,
                i.short,
                i.en,
                i.level,
                i.section,
                i.intro,
                i.includes,
                i.also,
                i.excludes,
                i.refs,
                i.updated,
                i.parent_id,
                0 AS depth
           FROM ontology.industry i
          WHERE i.code = $1
            AND (i.status = 'active' OR i.status IS NULL)
         UNION ALL
         SELECT parent.id,
                parent.code,
                parent.name,
                parent.short,
                parent.en,
                parent.level,
                parent.section,
                parent.intro,
                parent.includes,
                parent.also,
                parent.excludes,
                parent.refs,
                parent.updated,
                parent.parent_id,
                ancestry.depth + 1
           FROM ontology.industry parent
           JOIN ancestry ON ancestry.parent_id = parent.id
          WHERE parent.status = 'active' OR parent.status IS NULL
       )
       SELECT ancestry.code AS id,
              ancestry.code,
              ancestry.name,
              ancestry.short,
              ancestry.en AS english,
              ancestry.level,
              parent.code AS parent_id,
              ancestry.section,
              ancestry.intro,
              ancestry.includes,
              ancestry.also,
              ancestry.excludes,
              ancestry.refs,
              ancestry.updated,
              EXISTS (
                SELECT 1
                  FROM ontology.industry child
                 WHERE child.parent_id = ancestry.id
                   AND (child.status = 'active' OR child.status IS NULL)
              ) AS has_children,
              (
                SELECT count(*)::int
                  FROM ontology.industry child
                 WHERE child.parent_id = ancestry.id
                   AND (child.status = 'active' OR child.status IS NULL)
              ) AS child_count
         FROM ancestry
         LEFT JOIN ontology.industry parent ON parent.id = ancestry.parent_id
        ORDER BY ancestry.depth DESC`,
      [id],
    );
    return result.rows as IndustryTaxonomyRow[];
  }

  private mapRegion(row: RegionTaxonomyRow): TaxonomyNode {
    return {
      id: row.id,
      code: row.code ?? null,
      name: row.name,
      short: row.short ?? null,
      english: row.english ?? null,
      level: row.level,
      parentId: row.parent_id ?? null,
      hasChildren: row.has_children === true,
      childCount: Number(row.child_count ?? 0),
      iso2: row.iso2 ?? null,
      iso3: row.iso3 ?? null,
      center: row.center ?? null,
    };
  }

  private mapIndustry(row: IndustryTaxonomyRow): TaxonomyNode {
    return {
      id: row.id,
      code: row.code ?? null,
      name: row.name,
      short: row.short ?? null,
      english: row.english ?? null,
      level: row.level,
      parentId: row.parent_id ?? null,
      hasChildren: row.has_children === true,
      childCount: Number(row.child_count ?? 0),
      section: row.section ?? null,
      intro: row.intro ?? null,
      includes: row.includes ?? null,
      also: row.also ?? null,
      excludes: row.excludes ?? null,
      refs: row.refs ?? null,
      updated: row.updated ?? null,
    };
  }
}
