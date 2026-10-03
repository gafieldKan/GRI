/**
 * twin 模块领域模型 —— 学生数字孪生（人本论：人本体的可执行运行时）。
 *
 * 孪生 = 身份(profile) + 状态(state) + 世界(world) + 经历(events) + 记忆(memories)。
 * 前四者由既成真源装配（identity/edu/curriculum/agent），经历落 twin.event（015）。
 */

/** 行为类别（闭集，对齐原型 PERSONA C1 的 kindNames）。 */
export type TwinEventKind =
  | 'system' // 初始化
  | 'session' // 会话（登录激活/休眠退出）
  | 'profile' // 人物设定
  | 'world' // 场景移动
  | 'action' // 学习行动
  | 'memory' // 记忆
  | 'settings'; // 设置

/** 单条差异（操作前 → 操作后）。 */
export interface TwinDiff {
  label: string;
  before: string;
  after: string;
}

/** 行为时间线一条（twin.event 行）。 */
export interface TwinEvent {
  id: string;
  entityId: string;
  kind: TwinEventKind;
  title: string;
  text: string | null;
  source: string | null;
  sceneId: string | null;
  diffs: TwinDiff[];
  before: unknown;
  after: unknown;
  at: string;
}

/** 写一条事件的入参（供行动挂钩/facade 调用）。 */
export interface TwinEventInput {
  kind: TwinEventKind;
  title: string;
  text?: string | null;
  source?: string | null;
  sceneId?: string | null;
  diffs?: TwinDiff[];
  before?: unknown;
  after?: unknown;
}

/** 孪生身份（稳定属性）——来自 public.users + edu.students。 */
export interface TwinProfile {
  id: string;
  username: string | null;
  name: string;
  email: string | null;
  role: string;
  avatarUrl: string | null;
  gradeLevel: number | null;
  gradeName: string | null;
  textbookVersion: string | null;
  school: string | null;
}

/** 行动入参（学习动词闭集：上课/练习/复习错题/请教教师/测验/休息）。 */
export interface TwinActionInput {
  verb: 'lesson' | 'practice' | 'review' | 'chat' | 'exam' | 'rest' | string;
  sceneId?: string | null;
  title?: string | null;
  text?: string | null;
}

/** 人物画像自助更新入参（白名单；落 edu.students，并记一条 profile 经历）。 */
export interface TwinProfilePatch {
  name?: string;
  avatarUrl?: string;
  gradeLevel?: number | null;
  textbookVersion?: string;
  school?: string;
}

/** 能力雷达一项（按知识版图领域聚合的掌握度均值）。 */
export interface TwinSkill {
  fieldCode: string;
  name: string;
  mastery: number | null; // 0–100；无数据显示 null
}

/** 掌握度汇总（诚实口径：节点粒度近似）。 */
export interface TwinMasterySummary {
  avg: number;
  mastered: number; // >= 80
  learning: number; // 50–79
  weak: number; // < 50
  total: number;
}

/** 与 AI 教师的关系（教学互动轮次 → 关系值）。 */
export interface TwinRelation {
  interactions: number;
  bond: number; // 0–100
}

/** 孪生状态（可变属性）——状态由行动驱动。 */
export interface TwinState {
  subject: string;
  gradeLevel: number | null;
  gradeName: string | null;
  scene: { code: string; name: string } | null; // 当前所在版图营地
  progress: {
    totalAnswered: number;
    correctCount: number;
    accuracy: number;
    practiceSessions: number;
    unresolvedWrong: number;
  };
  mastery: TwinMasterySummary;
  skills: TwinSkill[];
  relations: { teacher: TwinRelation };
}

/** 虚拟世界（学科版图，复刻「登峰」：节点=KnowledgeArea，航线=prerequisite）。 */
export interface TwinWorld {
  subject: string | null;
  subjectName: string | null;
  fields: unknown[];
  areas: unknown[];
  stats: unknown;
}

/** 长期记忆一条（agent.memory）。 */
export interface TwinMemory {
  key: string;
  value: unknown;
  strength: number;
  updatedAt: string | null;
}

/** 孪生总览（GET /api/twin/me）。 */
export interface TwinOverview {
  profile: TwinProfile;
  state: TwinState;
  world: TwinWorld;
  events: TwinEvent[];
  memories: TwinMemory[];
  generatedAt: string;
}
