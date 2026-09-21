import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MasterDataEntry, MasterDataKindSummary } from './master-data.types';

/**
 * M4 master-data 切片：类型化引用主数据字典（ontology schema）。
 *
 * 消费方（tuition 学科分类 / food 餐别 / 前端下拉）统一读这里，消灭各模块自造字典分歧。
 * 只读目录端点走白名单游客可见；写由内置 seed + 未来的后台运维承载，不在本门面开写。
 */
@Injectable()
export class MasterDataService {
  constructor(private readonly db: DatabaseService) {}

  /** 字典分类概览（kind → 条目数）。 */
  async listKinds(): Promise<MasterDataKindSummary[]> {
    const res = await this.db.query(
      `SELECT kind,
              count(*)::int AS total,
              count(*) FILTER (WHERE status = 'active')::int AS active
         FROM ontology.master_data
        GROUP BY kind
        ORDER BY kind`,
    );
    return res.rows as MasterDataKindSummary[];
  }

  /** 某字典的启用条目（按 sort_order,label）。 */
  async listByKind(kind: string): Promise<MasterDataEntry[]> {
    const res = await this.db.query(
      `SELECT * FROM ontology.master_data
        WHERE kind = $1 AND status = 'active'
        ORDER BY sort_order, label`,
      [kind],
    );
    return res.rows as MasterDataEntry[];
  }

  async getById(id: string): Promise<MasterDataEntry> {
    const res = await this.db.query(
      'SELECT * FROM ontology.master_data WHERE id = $1',
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException('主数据条目不存在');
    return res.rows[0] as MasterDataEntry;
  }
}