/** curriculum 模块的领域模型（ontology 六表 + edu.knowledge_points）。 */

/** 学科（ontology.subject）。 */
export interface Subject {
  id: string;
  code: string; // 稳定编码（MATH/EN/…，≡ master_data code）
  name: string;
  domain: string | null;
  sort_order: number | null;
  status: string;
}

/** 学段（ontology.school_stage）。 */
export interface SchoolStage {
  id: string;
  code: string; // PRIMARY/JUNIOR/SENIOR
  name: string;
  sort_order: number | null;
}

/** 年级（ontology.grade）。 */
export interface Grade {
  id: string;
  code: string; // G1–G12（数值后缀 ≡ edu.knowledge_points.grade_level）
  name: string;
  sort_order: number | null;
  stage_id: string;
  stage_code?: string; // JOIN 附加
  stage_name?: string; // JOIN 附加
}

/** 教材（ontology.textbook）。 */
export interface Textbook {
  id: string;
  code: string; // math.g7.pep
  name: string;
  version: string | null;
  publisher: string | null;
  status: string;
  subject_id: string;
  grade_id: string;
  subject_code?: string; // JOIN 附加
  grade_code?: string; // JOIN 附加
}

/** 章节（ontology.textbook_chapter，树形）。 */
export interface Chapter {
  id: string;
  code: string;
  name: string;
  sort_order: number | null;
  textbook_id: string;
  parent_id: string | null;
  children?: Chapter[];
}

/** 知识点（edu.knowledge_points，canonical 形态 + 图谱叠加字段）。 */
export interface KnowledgePoint {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  subject: string | null;
  grade_level: number | null;
  chapter_id: string | null;
  chapter_name?: string; // JOIN 附加
  status: string | null; // 状态机 draft/reviewed/published（LLM 生成内容审核生命周期）
  mastery?: number; // 个人掌握度叠加（auth 请求时）
  prerequisites?: string[]; // 前置 KP code 列表（JOIN kp_prerequisite 附加）
}

/** 版图领域（ontology.knowledge_area，一级；f.NN）。 */
export interface KnowledgeField {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

/** 版图知识域（ontology.knowledge_area，二级；a.NN.MM；k12 落位或 frontier 峰外）。 */
export interface KnowledgeArea {
  id: string;
  code: string;
  fieldCode: string; // 父领域 code（JOIN 附加）
  name: string;
  description: string | null;
  scope: 'k12' | 'frontier';
  gradeLevel: number | null; // k12 落位年级（1–12；frontier 为 null）
  mastery?: number; // 该域个人掌握度均值（登录叠加；无数据 undefined）
  kpCount?: number; // 该域已入库知识点数（与教材题库层衔接的可见锚点）
  prerequisites?: string[]; // 前置知识域 code 列表（DAG 边）
}

/** 版图统计（诚实口径：节点粒度近似值）。 */
export interface KnowledgeMapStats {
  total: number; // 版图总节点（k12 + frontier）
  k12: number;
  frontier: number;
  coverageRatio: number; // k12 / total（0–1）
  byGrade: Record<string, number>; // G1–G12 → k12 节点数（年级为键）
}
