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