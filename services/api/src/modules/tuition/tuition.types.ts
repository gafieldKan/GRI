export interface Question {
  id: string;
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  knowledge_point_id?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  type?: 'multiple-choice' | 'short-answer' | 'essay';
}

export interface PracticeSession {
  id: string;
  user_id: string;
  start_time?: Date;
  end_time?: Date;
  score?: number;
  status: 'in_progress' | 'completed';
}

export interface WrongQuestion {
  id: string;
  user_id: string;
  question_id: string;
  wrong_count: number;
  last_attempt_at?: Date;
  is_resolved: boolean;
}

export interface LearningPlan {
  id: string;
  user_id: string;
  title: string;
  start_date?: Date;
  end_date?: Date;
  progress?: number;
  status: 'active' | 'completed' | 'archived';
}

// ---------------------------------------------------------------------------
// 教学卡片域（P2-T6）：卡片态状态机 / 意图识别 / 苏格拉底模板 的共享纯类型。
// 说明：api 侧无 class-validator（容器 npm ci 未装），故此处一律纯接口/联合类型，无装饰器。
// `TeachingCardStage` 是「卡片态」（内嵌于会话阶段状态机之内），与 SessionFsm 的
// welcome/diagnosis/teaching/quizzing/done（「会话阶段」）分属不同域，二者可组合、勿混用。
// ---------------------------------------------------------------------------

/** 教学卡片态：Question → Hint → Scaffold → Solution → Reflection 五态。 */
export type TeachingCardStage = 'Question' | 'Hint' | 'Scaffold' | 'Solution' | 'Reflection';

/** 学生消息意图（规则优先、LLM 兜底）。 */
export type Intent =
  | 'ASK_HINT'
  | 'ASK_SOLUTION'
  | 'ATTEMPT_ANSWER'
  | 'ASK_CLARIFICATION'
  | 'OFF_TOPIC'
  | 'GIVE_UP'
  | 'NEXT_QUESTION';

/** 苏格拉底模板插值上下文；`{knowledgePoint}`/`{studentLevel}`/`{attemptCount}` 缺失时 render 明确报错。 */
export interface SocraticContext {
  knowledgePoint: string;
  studentLevel?: string;
  attemptCount?: number;
  [key: string]: unknown;
}

/** 卡片推进结果（FSM 每次流转产出的、可交付前端的更新）。 */
export interface TeachingCardUpdate {
  stage: TeachingCardStage;
  intent?: Intent;
  message?: string;
  hintCount?: number;
  attemptCount?: number;
}