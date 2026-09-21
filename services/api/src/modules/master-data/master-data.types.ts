/** M4 master-data 切片的领域模型（ontology.master_data）。 */

export interface MasterDataEntry {
  id: string;
  kind: string; // 关联本体 Object 名（Subject / Grade / AcademicTerm / MealCategory ...）
  label: string;
  code: string | null;
  value: Record<string, unknown>; // 类型化属性（经 ontology Object 约定）
  is_builtin: boolean;
  sort_order: number;
  status: string; // 'active' | 'archived'
  created_at: string;
  updated_at: string;
}

/** 字典分类概览（目录浏览：kind → 条目数）。 */
export interface MasterDataKindSummary {
  kind: string;
  total: number;
  active: number;
}