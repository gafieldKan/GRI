import { Module } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { LlmClient } from '@gri/agent-core';
import { TuitionService } from './tuition.service';
import { TuitionController } from './tuition.controller';
import { AiAgentService } from './agents/ai-agent.service';
import { buildTuitionLlm } from './agents/llm-provider';
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
import { SOCRATIC_RENDER, resolveSocraticRender } from './agents/socratic-provider';
import { OcrProcessor } from './agents/ocr-processor';
import { QuestionParser } from './agents/question-parser';
import { VariantGenerator } from './agents/variant-generator';

@Module({
  controllers: [TuitionController],
  providers: [
    // 学情门面
    TuitionService,
    AiAgentService,
    // AI 客户端：底座 @gri/agent-core 的 LlmClient（W2.4 归一，tuition 不再自持 LLM 客户端）。
    // 配置经 ModelRouter 逐轮实时解析（路由表优先、loadConfig 兜底）；以 LlmClient 本体为 DI token。
    { provide: LlmClient, useFactory: buildTuitionLlm, inject: [DatabaseService] },
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
    // 苏格拉底话术（W2.4b）：实现已迁为插件 `plugins/socratic`（provides socratic.render）；
    // 宿主从此解析能力实现（未装配 → null，端点报 503，P5 不崩）。
    { provide: SOCRATIC_RENDER, useFactory: resolveSocraticRender },
    // 拍照解题域（P2-T7）：OCR 适配 / 结构化解析 / 变式生成
    OcrProcessor,
    QuestionParser,
    VariantGenerator,
  ],
  exports: [TuitionService, AiAgentService],
})
export class TuitionModule {}