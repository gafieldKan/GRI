import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { loadConfig } from '../../../config/config';
import { SessionFsm } from './session-fsm';
import {
  AgentCore, ModelRouter, ToolRegistry, SkillRegistry, MemoryStore, makeTool, storeFrom,
} from '@gri/agent-core';

/**
 * 教学会话的「决策脑」—— 教学行为重组为 agent-core 消费方。
 *
 * 旧实现：session-fsm 里一段硬编码中文 prompt + 一次 LlmService.generateTeachingResponse 调用。
 * 现重组为 @gri/agent-core 驱动：每个会话消息装配一个 AgentCore，
 *   - 教师行为 = 一个 `tutor` 技能（指令即旧 prompt 的阶段/行为判定规则，交给底座装载）；
 *   - 会话能力 = 工具：session.context（读会话态）/ session.answer（提交教学判定，决定性调用）/
 *     session.remember（写学生长期记忆，与 /api/agent 专属教师共用 agent.memory）；
 *   - 记忆 = MemoryStore(agent.memory, keyed by session.userId) —— 教师在会话里记住的偏好，
 *     在「我的 AI 教师」面板同样读得到（同底座同记忆，真正跨入口）。
 *
 * `decide` 返回模型提交的判定 {phase, action, answerCorrect, studentAnswer, suggestedResponse, analysis}
 * （与旧 generateTeachingResponse 同 schema）；模型没调用 session.answer / 无 key → 返回 null，
 * 由调用方（SessionFsm）降级到本地关键词判定。SessionFsm 仍是阶段机+持久化权威，判定仅“喂”给它执行，
 * 前端契约与既有测试接口不变。
 */
@Injectable()
export class TutorSessionAgent {
  constructor(private readonly db: DatabaseService) {}

  private _store() {
    return storeFrom((text: string, params?: unknown[]) => this.db.query(text, params));
  }

  /** 会话态摘要（给模型看）：阶段/进度/结果/当前题务必带正确答，避免模型瞎判。 */
  private _sessionContext(s: SessionFsm): string {
    const bits: string[] = [`阶段=${s.phase}`, `知识点=${s.selectedKpName || s.knowledgePointId || '未定'}`];
    if (s.phase === 'diagnosis') bits.push(`诊断进度=已答${s.diagnosisAnswers.length}/${s.diagnosisQuestions.length}题`);
    if (s.phase === 'quizzing') bits.push(`测验进度=已答${s.quizAnswers.length}/${s.quizQuestions.length}题`);
    if (s.diagnosisResult) bits.push(`诊断结果=正确${s.diagnosisResult.correctCount}/${s.diagnosisResult.total}`);
    const q = s.getCurrentQuestion();
    bits.push(q ? `当前题目="${q.content}"（类型 ${q.type}，正确答案 ${q.answer}）` : '当前题目=无');
    return `[会话] ${bits.join('｜')}`;
  }

  /**
   * 跑一轮 agent，返回教学判定（或 null）。
   * @param session 会话（状态机；只读用于上下文，状态迁移仍由 SessionFsm 执行）
   * @param userMessage 学生消息
   */
  async decide(session: SessionFsm, userMessage: string): Promise<any | null> {
    const entityId = session.userId;
    const store = this._store();
    const router = new ModelRouter(store); // 读 agent.llm_routes，前台切大模型立即生效
    const memory = new MemoryStore(store); // agent.memory，与专属教师同一张记忆
    const context = this._sessionContext(session);

    let decision: any = null;

    const tools = new ToolRegistry().registerAll([
      makeTool({
        name: 'session.context',
        description: '读取当前教学会话状态（阶段/进度/当前题目与正确答案）。',
        async execute(ctx) {
          void ctx;
          return JSON.parse(context);
        },
      }),
      makeTool({
        name: 'session.answer',
        description:
          '提交教学判定（一次性把所有如下字段都给全）。phase=welcome|diagnosis|teaching|quizzing|done；' +
          'action=greet|ask_question|evaluate_answer|teach|respond|give_quiz|complete；answerCorrect 仅在学生答题时给 true/false；' +
          'suggestedResponse 是回复学生的中文文本；analysis 不超 10 字。',
        inputSchema: {
          type: 'object',
          properties: {
            phase: { type: 'string' },
            action: { type: 'string' },
            answerCorrect: { type: 'boolean' },
            studentAnswer: { type: 'string' },
            suggestedResponse: { type: 'string' },
            analysis: { type: 'string' },
          },
          required: ['phase', 'action', 'suggestedResponse'],
        },
        async execute(_ctx, args) {
          decision = args || {};
          return { ok: true, captured: true };
        },
      }),
      makeTool({
        name: 'session.remember',
        description: '记录一条该学生的长期记忆（偏好/事实），跨会话、与专属 AI 教师共享。',
        inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
        async execute(ctx, args) {
          await ctx.memory.set(ctx.entityId, args.key, args.value, 1);
          return { saved: true, key: args.key };
        },
      }),
    ]);

    const skills = new SkillRegistry().register({
      name: 'tutor',
      description: '数学教师：学情诊断 → 讲解 → 测验',
      instructions: TUTOR_SKILL_INSTRUCTIONS,
    });

    const core = new AgentCore({
      router,
      store,
      tools,
      skills,
      memory,
      persona: '你是智学慧眼为这位学生配备的专属数学教师（决策模式）。只用中文。你不是在闲聊，而是通过工具给出教学判定。',
      defaultResponder: async () => null, // 无 key → decide 返回 null，调用方走本地 fallback
      llmTimeoutMs: loadConfig().llm.timeoutMs, // 与教师路同源：推理模型大 prompt 下 60s 误杀
    });

    try {
      await core.run({
        entityId,
        userMessage: context + '\n学生最新消息：' + (userMessage || ''),
        routeKey: 'default',
        opts: { maxToolTurns: 3, temperature: 0.3, max_tokens: 1024 },
      });
    } catch {
      return null; // 任何异常 → 本地降级
    }

    return decision && decision.phase && decision.suggestedResponse ? decision : null;
  }
}

/**
 * tutor 技能指令 = 旧 generateTeachingResponse 提示词的判定规则（重组为底座技能）。
 * 由 SkillRegistry 装载进 AgentCore system prompt；模型据此决策并调 session.answer。
 */
const TUTOR_SKILL_INSTRUCTIONS = `
你是教学会话的决策脑：不直接回复闲聊，而是给出教学判定交给系统执行。
判定阶段 phase：welcome | diagnosis | teaching | quizzing | done。

行为准则：
- welcome：学生首次打招呼开始学习 → 进入诊断 diagnosis，action=ask_question（系统会推诊断题）。
- diagnosis：学生答题 → action=evaluate_answer, answerCorrect=对错, studentAnswer=提取的答案；
  若诊断题已全部答完，系统自动带诊断结果转 teaching。
- 学生说「不能/不知道/直接教学/跳过/讲给我听/先回答我的问题」→ 立即 teaching，action=teach，
  直接讲解知识点核心概念（公式/定义），简短讲解后用提问确认理解收尾，不再出题、不再反问。
- teaching：学生困惑/提问 → action=teach 或 respond，紧扣知识点讲清后确认理解。
- 学生确认理解（懂了/明白/理解）→ quizzing，action=give_quiz（系统推测验题）。
- quizzing：学生答题 → action=evaluate_answer + answerCorrect。
- 测验全部做完 → done，action=complete。

补充：
- 仅把遇到的学生偏好/事实用 session.remember 写长期记忆，之后的答案要贴合记忆。
- 需要再看会话当前态就用 session.context。
`.trim();