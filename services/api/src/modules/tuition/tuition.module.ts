import { Module } from '@nestjs/common';
import { TuitionService } from './tuition.service';
import { TuitionController } from './tuition.controller';
import { AiAgentService } from './agents/ai-agent.service';
import { LlmService } from './agents/llm.service';
import { TuitionQuestionService } from './agents/question.service';
import { SessionFsmService } from './agents/session-fsm';
import { TutorSessionAgent } from './agents/tutor-session-agent';
import { ExamScannerAgent } from './agents/exam-scanner';
import { TutorAgent } from './agents/tutor-agent';
import { QuestionGeneratorAgent } from './agents/question-generator';
import { PlanAgent } from './agents/plan-agent';
import { SpacedRepetitionService } from './agents/spaced-repetition.service';
import { TeachingCardFsm } from './agents/teaching-card-fsm';
import { IntentClassifier } from './agents/intent-classifier';
import { SocraticTemplates } from './agents/socratic-templates';
import { OcrProcessor } from './agents/ocr-processor';
import { QuestionParser } from './agents/question-parser';
import { VariantGenerator } from './agents/variant-generator';

@Module({
  controllers: [TuitionController],
  providers: [
    // 学情门面
    TuitionService,
    AiAgentService,
    // AI 客户端
    LlmService,
    // 会话 / 题库 / 间隔复习
    SessionFsmService,
    TutorSessionAgent,
    TuitionQuestionService,
    SpacedRepetitionService,
    // smartlens 四 agent
    ExamScannerAgent,
    TutorAgent,
    QuestionGeneratorAgent,
    PlanAgent,
    // 教学卡片域（P2-T6）：卡片态状态机 / 意图识别 / 苏格拉底模板
    TeachingCardFsm,
    IntentClassifier,
    SocraticTemplates,
    // 拍照解题域（P2-T7）：OCR 适配 / 结构化解析 / 变式生成
    OcrProcessor,
    QuestionParser,
    VariantGenerator,
  ],
  exports: [TuitionService, AiAgentService, LlmService],
})
export class TuitionModule {}