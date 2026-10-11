/**
 * 题型词汇（ExamScanner→QuestionParser→VariantGenerator 链路统一）。
 *   - single_choice / multiple_choice：单选 / 多选（有选项）
 *   - fill_blank：填空（有空位，blanks[] 计数）
 *   - solution：解答（无选项、无空位，需推导）
 * 保留旧词汇（multiple-choice/short-answer/essay）以兼容既有 `Question` 消费方。
 */
export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'fill_blank'
  | 'solution'
  | 'multiple-choice'
  | 'short-answer'
  | 'essay';

export interface Question {
  id: string;
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  knowledge_point_id?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  type?: QuestionType;
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

// ---------------------------------------------------------------------------
// 拍照解题域（P2-T7）：OCR 适配层 / 结构化解析 / 变式生成 的共享纯类型。
// 真源：`edu.questions` / `edu.knowledge_points` 表 + `k12-curriculum.ontology.yaml`
//（禁引不存在的 k12/questions.yaml）。均纯接口，无装饰器。
// ---------------------------------------------------------------------------

/** OCR 块（版面切分的最小单元）。 */
export interface OcrBlock {
  /** text=正文；formula=公式；image=图；table=表。 */
  type: 'text' | 'formula' | 'image' | 'table';
  text?: string;
  /** 公式块的 LaTeX 表示。 */
  latex?: string;
  confidence?: number;
}

/** OCR 适配层统一输出（多引擎同形）。 */
export interface OcrResult {
  /** 全文本（结构化解析的输入）。 */
  text: string;
  /** 全文中的 LaTeX 公式片段（顺序拼接）。 */
  latex: string;
  /** 版面块序列。 */
  blocks: OcrBlock[];
  /** 产出该结果的引擎名（mock / multimodal-llm / passthrough）。 */
  engine?: string;
}

/** 试卷识别请求（`ExamScannerAgent.scanExam` 入参，向后兼容原签名）。 */
export interface ExamScanRequest {
  imageDataUrl: string;
  subject?: string;
  gradeLevel?: string;
  rawText?: string;
}

/** 试卷识别结果（`ExamScannerAgent.scanExam` 出参；`ocr.rawText`/`parsedQuestions` 为既有契约）。 */
export interface ExamScanResult {
  success: boolean;
  error?: string;
  /** `rawText`/`questions` 为既有消费方（ai-agent.service）所依赖字段，保留。 */
  ocr: OcrResult & { rawText: string; questions: unknown[] };
  parsedQuestions: ParsedQuestion[];
  /** 可选：基于首题的变式（增量字段，不破坏既有契约）。 */
  variants?: ParsedQuestion[];
  metadata?: { subject: string; gradeLevel: string; timestamp: string };
}

/** 填空空位。 */
export interface BlankSpec {
  index: number;
  placeholder?: string;
}

/** 结构化解析产物（实现 `Question` 契约，题型/空位/KP 为必填强约束）。 */
export interface ParsedQuestion extends Question {
  type: QuestionType;
  options: string[];
  blanks: BlankSpec[];
  knowledgePoint: string;
  difficulty: 'easy' | 'medium' | 'hard';
  subject?: string;
}

/** 变式生成的种子题。 */
export interface QuestionSeed {
  id?: string;
  type: QuestionType;
  content: string;
  options?: string[];
  answer?: string;
  knowledgePoint?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  blanks?: BlankSpec[];
  subject?: string;
}

/** 变式生成选项。 */
export interface VariantGenerationOptions {
  /** 目标变式数（默认 3）。 */
  count?: number;
  /** numeric=数值 ±20% 非零替换；swap=已知/未知互换；auto=交替。 */
  strategy?: 'numeric' | 'swap' | 'auto';
  subject?: string;
  gradeLevel?: string;
}
// ---------------------------------------------------------------------------
// 练习会话域（P2-T5）：会话级进度/分析闭环的共享纯类型（无装饰器）。
// 真源 = edu.answer_records(session_id) + edu.practice_sessions(.questions jsonb)。
// ---------------------------------------------------------------------------

/** POST /practice/answer 入参：`sessionId` 落真实 practice_sessions.id（缺省则向后兼容存 NULL）。 */
export interface AnswerSubmitDto {
  questionId: string;
  answer: string;
  sessionId?: string;
  timeSpentMs?: number;
  isCorrect?: boolean;
  studentId?: string;
}

/** 会话进度：已答/总数/正确率/当前题索引。 */
export interface SessionProgressDto {
  sessionId: string;
  answered: number;
  total: number;
  correctCount: number;
  /** 正确率，0..1。 */
  correctRate: number;
  /** 下一题索引（= 已答题数）。 */
  currentIndex: number;
  status: 'in_progress' | 'completed';
}

/** 会话逐题解析项（题面多态沿用 edu.questions.type/options/content_latex/answer_latex）。 */
export interface SessionAnalysisItem {
  questionId: string;
  content: string | null;
  type: QuestionType | null;
  options: string[] | null;
  studentAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  analysis: string | null;
  contentLatex: string | null;
  answerLatex: string | null;
  difficulty: string | null;
  knowledgePointId: string | null;
  knowledgePointName: string | null;
  timeSpentMs: number | null;
}

/** 知识点掌握度聚合（按 knowledge_point_id）。 */
export interface KnowledgePointMastery {
  knowledgePointId: string | null;
  knowledgePointName: string | null;
  answered: number;
  correct: number;
  /** 正确率，0..1。 */
  correctRate: number;
}

/** 会话分析：逐题解析数组 + 按 knowledge_point_id 聚合的正确率。 */
export interface SessionAnalysisDto {
  sessionId: string;
  answered: number;
  correctCount: number;
  correctRate: number;
  items: SessionAnalysisItem[];
  knowledgePoints: KnowledgePointMastery[];
}
// ---------------------------------------------------------------------------
// 错题本复习域（P2-T8）：due 到期卡片流 / 单题详情 / 统计聚合 的共享纯类型。
// 真源 = edu.sr_queue（SM-2 参数，N3）+ edu.wrong_questions（错误元数据，N1）；
// edu.wrong_questions 无 SR 列、无 next_review_at —— 到期判断一律走 sr_queue.next_review。
// 错误类型沿用库内既有中文值（N6）。均纯接口，无装饰器。
// ---------------------------------------------------------------------------

/** SM-2 调度参数（仅存 edu.sr_queue；无 SR 记录时为 null/默认值）。 */
export interface SrParams {
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: Date | null;
  lastReviewed: Date | null;
}

/** 到期复习卡片（数据源 = edu.sr_queue.next_review ≤ now，join edu.questions；按 next_review 升序）。 */
export interface DueWrongQuestionDto {
  /** edu.wrong_questions.id（无错题行时为 null）；复习入口 = POST /wrong-questions/:id/review。 */
  id: string | null;
  /** edu.sr_queue.question_id ≡ edu.questions.id（卡片主键，恒存在）。 */
  questionId: string;
  content: string | null;
  type: QuestionType | null;
  options: string[] | null;
  answer: string | null;
  analysis: string | null;
  subject: string | null;
  /** 优先错题表 knowledge_point，缺失回退 edu.knowledge_points.name。 */
  knowledgePoint: string | null;
  /** 错误类型（库内既有中文值，如 '计算错误'/'判读错误'）。 */
  errorType: string | null;
  wrongCount: number;
  difficulty: number | null;
  lastAttemptAt: Date | null;
  sr: SrParams;
  /** 逾期天数（now - next_review，向下取整，最小 0）。 */
  overdueDays: number;
}

/** 单条错题详情（含 SR 参数）。:id = edu.wrong_questions.id。 */
export interface WrongQuestionDetailDto {
  id: string;
  questionId: string | null;
  content: string | null;
  questionText: string | null;
  type: QuestionType | null;
  questionType: string | null;
  options: string[] | null;
  answer: string | null;
  analysis: string | null;
  subject: string | null;
  knowledgePoint: string | null;
  studentAnswer: string | null;
  correctAnswer: string | null;
  /** 错误类型（库内既有中文值，N6）。 */
  errorType: string | null;
  difficulty: number | null;
  masteryLevel: string | null;
  reviewed: boolean;
  mastered: boolean;
  isResolved: boolean;
  reviewCount: number;
  wrongCount: number;
  lastAttemptAt: Date | null;
  lastReviewedAt: Date | null;
  sr: SrParams;
}

/** 掌握度分档（未复习 / 复习中 / 已掌握）。 */
export interface MasteryBucket {
  key: 'unreviewed' | 'reviewing' | 'mastered';
  label: string;
  count: number;
}

/** 高频错误知识点（按 knowledge_point 聚合，wrong_count 降序）。 */
export interface ErrorKnowledgePointStat {
  knowledgePoint: string | null;
  /** 该 KP 下累计错误次数。 */
  wrongCount: number;
  /** 该 KP 下错题条数。 */
  questionCount: number;
}

/** 复习进度（错题表口径 + sr_queue 调度口径）。 */
export interface WrongQuestionReviewProgress {
  total: number;
  reviewed: number;
  unreviewed: number;
  mastered: number;
  resolved: number;
  unresolved: number;
  /** 复习率 = reviewed / total，0..1（total=0 时为 0）。 */
  reviewedRate: number;
  /** 已进入 sr_queue 的卡片数。 */
  scheduledCount: number;
  /** sr_queue.next_review ≤ now 的到期卡片数。 */
  dueCount: number;
}

/** 错题统计聚合（掌握度分布 + 高频错误 KP + 复习进度）。 */
export interface WrongQuestionStatsDto {
  studentId: string;
  total: number;
  masteryBuckets: MasteryBucket[];
  topErrorKnowledgePoints: ErrorKnowledgePointStat[];
  reviewProgress: WrongQuestionReviewProgress;
}
