/**
 * 教学工具与技能集（W2.2「拆神服务」—— 从 agent.service.ts:1777 抽出）。
 *
 * 这里装的是 AI 教师**能做什么**：`makeTool` 工具定义（question/answer/diagnosis/plan/wrong/review/
 * lesson/curriculum/map…，共 13 个内建）+ 两个共享落库管线（gradeAnswerRecord / lessonRecord）。
 *
 * W2.3 起**工具与技能正文都在往外搬**：长期记忆三件套（memory.*）→ 出厂插件 `plugins/memory`；
 * `tutor` 技能正文 → 出厂插件 `plugins/tutor/SKILL.md`（本文件只把宿主解析好的技能注册进
 * `SkillRegistry`，不再持有正文）。其余内建工具按 `toolDefs(pluginTools)` 的**原位**拼回，
 * 工具表顺序与集合不变（见 docs/AGENT_SKILL_PLUGIN_CONTRACT.md §四 P-3.1）。
 *
 * 为什么单独成件：① `agent.service.ts` 因此回到「装配 + 面板」两件事；② 插件化需要先有独立文件。
 *
 * 依赖**只向下**：edu-core（数据口，W2.1）+ @gri/agent-core（工具/技能原语）。零 `this.`、零回指宿主。
 */

import { AgentCore, LlmClient, ModelRouter, MemoryStore, SkillRegistry, makeTool, sanitizeToolName } from '@gri/agent-core';
import { binaryQuality, applySrReview } from '../edu-core/sm2';
import {
  eduQuery,
  findQuestionById,
  insertAnswerRecord,
  upsertWrongQuestion,
  resolveMasteredWrongQuestion,
  resolveWrongQuestion,
  listUnresolvedWrongQuestions,
  countUnresolvedWrongByKpName,
  countUnresolvedWrongByKp,
  findKnowledgePointName,
  insertLessonPlan,
  listQuestionsBySubject,
  listKnowledgePointsByChapters,
  masteryByKnowledgePoint,
  masteryByKnowledgePointWithTime,
  masteryByQuestionKp,
  masteryBySingleKp,
  practiceAggByKp,
  dailyMasterySeries,
  listReviewCandidates,
  findLastWrongAnswer,
  findRandomQuestionByKp,
  findQuestionIdByKp,
  listKnowledgePointsByIds,
  upsertMasterySnapshot,
  upsertMasterySnapshotBumped,
  findMasterySnapshot,
  archivePersonalizedPlans,
  insertPersonalizedPlan,
  findPlanForUser,
  updatePlanProgress,
} from '../edu-core/repository';

/**
 * 判读一道题 + 落库（answer.grade 与 lesson.submit 共用同一判读管线，保证"课上再练"与"面板判读"副作用同源）。
 * 判题：LlmClient.validateAnswer(返回对错与讲解)；落库：answer_records(作答) + wrong_questions(答错入职,幂等计数)
 *   + resolveOnCorrect 消错题 + SM-2 间隔重复队列。全部以 ctx.entityId 隔离；任一步失败不阻断判题。
 */
export async function gradeAnswerRecord(ctx: any, args: any): Promise<any> {
  const db = eduQuery(ctx.store);
  const q = (await findQuestionById(db, args.questionId)) ?? undefined;
  const grader = new LlmClient(async () => ({ apiKey: '', model: '', baseUrl: '' }));
  const result = await grader.validateAnswer(q, args.answer);
  const isCorrect = !!result.correct;
  let recorded = false;
  let sm2Out: { interval: number; easeFactor: number; repetitions: number; nextReview: string } | null = null;
  try {
    await insertAnswerRecord(db, {
      userId: ctx.entityId,
      questionId: args.questionId,
      studentAnswer: args.answer,
      isCorrect,
      timeSpentMs: args.timeSpentMs,
    });
    recorded = true;
    if (!isCorrect && q) {
      await upsertWrongQuestion(db, {
        userId: ctx.entityId,
        questionId: args.questionId,
        studentAnswer: args.answer,
        correctAnswer: q.answer,
        difficulty: q.difficulty,
      });
    }
    if (args.resolveOnCorrect && isCorrect) {
      await resolveMasteredWrongQuestion(db, ctx.entityId, args.questionId);
    }
    {
      const { sm2, nextReview } = await applySrReview(db, {
        userId: ctx.entityId,
        questionId: args.questionId,
        quality: binaryQuality(isCorrect),
      });
      sm2Out = { interval: sm2.interval, easeFactor: sm2.easeFactor, repetitions: sm2.repetitions, nextReview: nextReview.toISOString() };
    }
  } catch { /* 作答/错题/记忆队列记录失败不阻断判题 */ }
  return { ...result, recorded, isCorrect, questionId: args.questionId, resolved: !!(args.resolveOnCorrect && isCorrect), sm2: sm2Out };
}

/**
 * lesson.record 的落盘核心 —— 把一节上完的课收束落盘到 edu.learning_plans（plan_type='lesson'）。
 * 模块级函数（lesson.record execute 与 lesson.submit 答对分支共享，同一落库源头）。
 * plan_data 存该课真实结果（读自授课状态 lesson:<kpId>）；status 直接取 outcome（一次性历史记录，不归档不堆叠）。
 */
export async function lessonRecord(ctx: any, args: any): Promise<any> {
  const kpId = String(args.kpId ?? '');
  if (!kpId) return { ok: false, error: 'kpId 必填' };
  const mem = ctx.memory;
  let state: any = {};
  if (mem) {
    try { state = (await mem.get(ctx.entityId, `lesson:${kpId}`)) ?? {}; } catch { state = {}; }
  }
  // 该KP名称（缺省查库）
  let kpName = String(args.kpName ?? '');
  if (!kpName) {
    try {
      kpName = (await findKnowledgePointName(eduQuery(ctx.store), kpId)) ?? kpId;
    } catch { kpName = kpId; }
  }
  const outcome = args.outcome === 'abandoned' ? 'abandoned' : 'completed';
  // 本课真实结果（读自授课状态 + 参数），落 plan_data（status 直接取 outcome：lesson 是一次性的历史记录，不归档不堆叠）
  const lessons: any = {
    kpId,
    kpName,
    outcome,
    stage: state.stage ?? 'unknown',
    baseline: typeof state.baseline === 'number' ? state.baseline : null,
    practiceMastery: typeof state.practiceMastery === 'number' ? state.practiceMastery : null,
    delta: typeof state.delta === 'number' ? state.delta : null,
    attempts: state.attempts ?? 0,
    missedCount: state.missedCount ?? 0,
    lastWrongAnswer: state.lastWrongAnswer ?? null,
    recordedAt: new Date().toISOString(),
  };
  // 落盘一行
  const recordId = await insertLessonPlan(eduQuery(ctx.store), {
    userId: ctx.entityId,
    title: `一节课「${kpName}」`,
    planData: lessons,
    status: outcome,
  });
  return { ok: true, recordId, kpName, outcome, lessons };
}

/**
 * 宿主**自有**工具名（13 个内建）——**插件不得占用**。
 *
 * 为什么单列一张表：宿主工具与插件工具最终同进一个 `ToolRegistry`，而它是**后写覆盖**——
 * 插件只要叫 `answer.grade`，内建工具就被**无声顶替**，且面板按名取用会指向插件版本。
 * 故装载时把本表作为 `PluginHost.reservedTools` 传入（撞名 → `TOOL_NAME_RESERVED` 诊断并拒绝），
 * `toolDefs()` 里再做一层**同源守卫**（见下），双保险。
 *
 * 与 `toolDefs()` 的一致性由 `agent-plugins.spec.ts` 断言（防本表漂移）。
 */
export const BUILTIN_TOOL_NAMES = [
  'question.lookup',
  'curriculum.lookup',
  'answer.grade',
  'wrong.list',
  'review.sequence',
  'lesson.current',
  'lesson.submit',
  'progress.trend',
  'diagnosis.state',
  'plan.generate',
  'lesson.record',
  'plan.complete',
  'map.explorer',
];

/**
 * 宿主**自有**工具名全集 —— 装配时作为 `PluginHost.reservedTools` 传入，插件一律不得占用。
 *
 * = 本文件内建 13 个 **加上宿主自己另注册进同一 registry 的工具**：委派工具 `agent.delegate`
 * （由 `AgentService._teachingTools()` 注册 —— 它**不在** `toolDefs()` 里，宿主另外并入同一 registry；
 * 漏登记它，插件就能无声顶替委派工具）。名字取自 `packages/agent-core/src/cli-delegate.js`；
 * `AgentService._reportPluginDiagnostics()` 在启动期核对「宿主自有工具名是否都在本表内」，防漂移。
 */
export const HOST_RESERVED_TOOL_NAMES = [...BUILTIN_TOOL_NAMES, 'agent.delegate'];

/**
 * 丢弃**与宿主自有工具同（清洗）名**的外来工具（插件 / MCP 桥接）。
 *
 * 为什么需要：外来工具与宿主工具最终同进一个 `ToolRegistry`（**后写覆盖**），撞名即**无声顶替**——
 * 且宿主「按名取用」（面板直调 `execute`）会拿到外来版本。按**清洗名**比对（模型眼里的函数名空间
 * 多对一：`answer.grade` 与 `answer-grade` 同名），只按原样比会漏放后者。
 *
 * 与 `PluginHost.reservedTools`/`nameKey` 是**同一规则的两道口**：那处负责在**装载期**拒绝并诊断；
 * 这处负责在**装配期**兜底（MCP 桥接不经过 plugin-host，只有这一道）。
 *
 * @returns {{safe: any[], dropped: any[]}} 保留的工具 / 被丢弃的工具（调用方应把 dropped 打日志，不静默）
 */
export function dropHostNameCollisions(tools: any[], reserved: readonly string[] = HOST_RESERVED_TOOL_NAMES): { safe: any[]; dropped: any[] } {
  const reservedKeys = new Set(reserved.map(sanitizeToolName));
  const safe: any[] = [];
  const dropped: any[] = [];
  for (const t of tools) (t && t.name && !reservedKeys.has(sanitizeToolName(t.name)) ? safe : dropped).push(t);
  return { safe, dropped };
}

export class AgentTeachingTools {
  /**
   * 教学工具定义集：学生 agent 可调用的能力（直接读库，不耦合 tuition）。
   *
   * `pluginTools`：由**出厂插件**提供的工具（宿主经 `@gri/plugin-host` 装配后传入，见 `./agent-plugins`），
   * 按**原位**拼回工具表（当前承载 memory.* 三件套）。缺省空数组 → 纯内建集（插件缺失时宿主仍可用，P5）。
   */
  toolDefs(pluginTools: any[] = []): any[] {
    // 同源守卫：撞宿主自有名（HOST_RESERVED_TOOL_NAMES）的插件工具在此丢弃 —— 真正的拦截与诊断在宿主
    // （PluginHost.reservedTools / nameKey），这层保证「即便调用方把撞名工具直接塞进来」也不会顶替内建。
    // 与**注册顺序无关**：不管插件工具落在内建表的哪一段（原位拼回时它在中间），一律按名丢弃。
    const safePluginTools = dropHostNameCollisions(pluginTools).safe;
    return [
      makeTool({
        name: 'question.lookup',
        description: '按学科/知识点查题库，返回题目数组（用于出题/诊断）。subject 必填（学生提到具体学科时用该学科，否则用 persona 里的当前学科，code 形如 math/phys/chem）。',
        inputSchema: { type: 'object', properties: { subject: { type: 'string' }, limit: { type: 'number' } }, required: ['subject'] },
        async execute(ctx, args) {
          const limit = Math.min(Number(args.limit) || 5, 20);
          const rows = await listQuestionsBySubject(eduQuery(ctx.store), args.subject, limit);
          return rows.map((r: any) => ({ id: r.id, content: r.content, type: r.type, options: r.options, difficulty: r.difficulty }));
        },
      }),
      makeTool({
        name: 'curriculum.lookup',
        description: '导航 K12 教学体系：按学段/年级/学科查教材与章节树，再按章节查知识点（学生要「学什么/先学哪章/有哪些知识点/教学体系」时先调它，再针对具体知识点出题或讲解）。',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: '学科 code（math/phys/chem 等，缺省用当前学科）' },
            gradeLevel: { type: 'number', description: '年级数字 1-12（缺省用学生档案年级）' },
            chapterId: { type: 'string', description: '章节 UUID（给定时只返回该章知识点）' },
          },
        },
        async execute(ctx, args) {
          // 教材（学科+年级定位）
          const tb = await ctx.store.query(
            `SELECT t.id, t.code, t.name, t.publisher
               FROM ontology.textbook t
               LEFT JOIN ontology.subject s ON s.id = t.subject_id
               LEFT JOIN ontology.grade g ON g.id = t.grade_id
              WHERE (t.status = 'published' OR t.status = 'active')
                AND ($1::varchar IS NULL OR LOWER(s.code) = LOWER($1::varchar))
                AND ($2::int IS NULL OR g.code = $2::varchar OR g.sort_order = $2::int)
              ORDER BY t.code LIMIT 5`,
            [args.subject ?? null, args.gradeLevel ?? null],
          );
          // 章节（教材范围；未选教材时取全部匹配教材的章节）
          const chapters = args.chapterId
            ? (await ctx.store.query(
                `SELECT id, code, name, parent_id FROM ontology.textbook_chapter WHERE id = $1::uuid`,
                [args.chapterId],
              )).rows
            : (await ctx.store.query(
                `SELECT c.id, c.code, c.name, c.parent_id
                   FROM ontology.textbook_chapter c
                   JOIN ontology.textbook t ON t.id = c.textbook_id
                   LEFT JOIN ontology.subject s ON s.id = t.subject_id
                   LEFT JOIN ontology.grade g ON g.id = t.grade_id
                  WHERE (t.status = 'published' OR t.status = 'active')
                    AND ($1::varchar IS NULL OR LOWER(s.code) = LOWER($1::varchar))
                    AND ($2::int IS NULL OR g.code = $2::varchar OR g.sort_order = $2::int)
                  ORDER BY c.sort_order NULLS LAST, c.code LIMIT 30`,
                [args.subject ?? null, args.gradeLevel ?? null],
              )).rows;
          // 知识点（章节范围内 published）
          const chapterIds = chapters.map((c: any) => c.id);
          const kps = chapterIds.length
            ? await listKnowledgePointsByChapters(eduQuery(ctx.store), chapterIds)
            : [];
          return {
            textbooks: tb.rows,
            chapters: chapters.map((c: any) => ({ id: c.id, code: c.code, name: c.name, parentId: c.parent_id })),
            knowledgePoints: kps.map((k: any) => ({ id: k.id, code: k.code, name: k.name, description: k.description, chapterId: k.chapter_id })),
          };
        },
      }),
      makeTool({
        name: 'answer.grade',
        description: '判读一道题的学生答案（选择/填空/数值容差/essay），返回对错与讲解，并把本次作答写入作答记录（答错同时记入错题本），再按 SM-2 演进出间隔重复队列（edu.sr_queue，供自适应复习按到期日调度）。若 resolveOnCorrect 为 true 且答对，会同时把对应错题置已解决。',
        inputSchema: { type: 'object', properties: { questionId: { type: 'string' }, answer: { type: 'string' }, resolveOnCorrect: { type: 'boolean' }, timeSpentMs: { type: 'number' } }, required: ['questionId', 'answer'] },
        async execute(ctx, args) {
          return gradeAnswerRecord(ctx, args);
        },
      }),
      makeTool({
        name: 'wrong.list',
        description: '抽取该学生未解决的错题（用于错题重做冲刺）。返回题目内容与题型，但不含正确作答（保证重做真实性），答对用 answer.grade(resolveOnCorrect:true) 消除。复习错题先调它。',
        inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
        async execute(ctx, args) {
          const limit = Math.min(Number(args.limit) || 5, 20);
          const rows = await listUnresolvedWrongQuestions(eduQuery(ctx.store), ctx.entityId, limit);
          // 拉该生 per-KP 掌握度（与 diagnosis 同源），把错题冲刺按"最弱知识点优先"排序——先练不会的。
          const masteryByKp = new Map<string, number>();
          try {
            const agg = await masteryByQuestionKp(eduQuery(ctx.store), ctx.entityId);
            for (const r of agg || []) {
              const att = r.attempts || 0;
              masteryByKp.set(r.kp_id, att ? (r.correct || 0) / att : 0);
            }
          } catch { /* 掌握度拉取失败不阻断抽题 */ }
          const ranked = (rows || [])
            .map((r: any) => ({
              questionId: r.question_id,
              content: r.content,
              type: r.type,
              options: r.options,
              difficulty: r.difficulty,
              wrongAnswer: r.student_answer,
              wrongCount: r.wrong_count || 1,
              knowledgePoint: r.knowledge_point,
              lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at).getTime() : null,
              kpMasteryPct: Math.round(((masteryByKp.get(r.knowledge_point_id) ?? 0) || 0) * 100),
            }))
            .sort((a: any, b: any) => {
              // 最弱知识点优先 ⇒ (1-mastery) 大者前；同弱点再按错次多、最近错优先
              const ag = 1 - a.kpMasteryPct / 100;
              const bg = 1 - b.kpMasteryPct / 100;
              if (bg - ag !== 0) return bg - ag;
              if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
              return (b.lastAttemptAt ?? 0) - (a.lastAttemptAt ?? 0);
            })
            .slice(0, limit)
            .map(({ lastAttemptAt: _la, ...q }: any) => q);
          return {
            entityId: ctx.entityId,
            total: ranked.length,
            questions: ranked,
          };
        },
      }),
      makeTool({
        name: 'review.sequence',
        description:
          '为该学生生成一道自适应复习序列：按每个知识点的掌握度缺口（越弱越靠前）+ SM-2 记忆曲线间隔（edu.sr_queue 到期日越近越优先，已在册未到期自动下沉、刚练过的沉底）+ 短期答错惩罚（最近一次作答≤3天前且答错的题浮上来尽早重练）给候选题排序，返回一段有序出的题。复习/巩固/自适应出题前先调它；判读仍走 answer.grade（会自动演进间隔队列）。',
        inputSchema: {
          type: 'object',
          properties: {
            size: { type: 'number', description: '想要的数量（默认 5，上限 10）' },
            weakKnowledgePointIds: { type: 'array', items: { type: 'string' }, description: '可选：限定复习知识点，缺省为该生做过题的所有知识点按掌握度排序' },
          },
        },
        async execute(ctx, args) {
          const size = Math.min(Number(args.size) || 5, 10);
          // 1) 每知识点掌握度（复用 diagnosis 的念头：answer_records→questions→kps）
          const agg = await masteryByKnowledgePoint(eduQuery(ctx.store), ctx.entityId);
          const masteryById = new Map<string, number>();
          const kpNameById = new Map<string, string>();
          for (const r of agg || []) {
            const attempts = r.attempts || 0;
            const correct = r.correct || 0;
            masteryById.set(r.kp_id, attempts ? correct / attempts : 0);
            kpNameById.set(r.kp_id, r.kp_name);
          }
          // 2) 候选知识点：限定则用给定 id（不认识的 id 忽略）；缺省用该生做过的全部
          let kpIds: string[];
          if (Array.isArray(args.weakKnowledgePointIds) && args.weakKnowledgePointIds.length) {
            kpIds = args.weakKnowledgePointIds.filter((id: string) => masteryById.has(id));
          } else {
            kpIds = [...masteryById.keys()];
          }
          if (!kpIds.length) {
            return { entityId: ctx.entityId, total: 0, questions: [], note: '该学生还没有作答记录，先做几道题我才能排出复习序列。' };
          }
          // 3) 拉候选题目 + 每题的 SM-2 间隔信号（edu.sr_queue.next_review 到期日；无档案时回退到 answer_records.created_at 距作答时长）
          const rows = await listReviewCandidates(eduQuery(ctx.store), ctx.entityId, kpIds);
          // 4) 自适应排序（SM-2 记忆曲线 + 短期答错惩罚）：score = gap*10 + spacingDays + wrongBoost。
          //    gap 越大(掌握度越低)越前；到期越近/越逾期越前。有 sr_queue.next_review 时按到期算——
          //    逾期(N 天前到期)=14+min(逾期天数,7)、N 天后到期=14-N(未到期自动预降，长期在册自动沉底)；
          //    无档案(原生新卡/历史作答)回退:距上次作答线性 0..14，从未做过按 14 满分。
          //    短期惩罚：最近一次作答是答错且 ≤3 天前 → wrongBoost=5 浮上来尽早重练（刚错的题不因间隔曲线被久延）。
          const now = Date.now();
          const ranked = (rows || [])
            .map((r: any) => {
              const mastery = masteryById.get(r.knowledge_point_id) ?? 0;
              const gap = 1 - mastery;
              const nrMs = r.next_review ? new Date(r.next_review).getTime() : null;
              const lastTs = r.last_attempt_at ? new Date(r.last_attempt_at).getTime() : null;
              const lastWrongTs = r.last_wrong_at ? new Date(r.last_wrong_at).getTime() : null;
              // 最近一次作答是答错（last_wrong_at 就是 last_attempt_at 那条）且 3 天内 → 短期重练
              const recentWrong = !!(
                lastWrongTs != null &&
                lastTs != null &&
                Math.abs(lastWrongTs - lastTs) < 2000 &&
                (now - lastWrongTs) / 86_400_000 < 3
              );
              const wrongBoost = recentWrong ? 5 : 0;
              let spacingDays: number;
              let dueDays: number;
              if (nrMs != null) {
                const days = (nrMs - now) / 86_400_000;
                dueDays = Math.round(days);
                spacingDays = days > 0 ? Math.max(0, 14 - days) : 14 + Math.min(-days, 7);
              } else if (lastTs != null) {
                const since = Math.max(0, (now - lastTs) / 86_400_000);
                spacingDays = Math.min(since, 14);
                dueDays = -Math.min(since, 21);
              } else {
                spacingDays = 14;
                dueDays = 0;
              }
              const score = gap * 10 + spacingDays + wrongBoost;
              return {
                questionId: r.question_id,
                kpId: r.knowledge_point_id,
                kpName: kpNameById.get(r.knowledge_point_id) ?? r.knowledge_point_id,
                content: r.content,
                type: r.type,
                options: r.options,
                difficulty: r.difficulty,
                masteryPct: Math.round(mastery * 100),
                spacingDays: Math.round(spacingDays * 10) / 10,
                dueDays: Math.round(dueDays),
                recentWrong,
                wrongBoost,
                score: Math.round(score * 100) / 100,
              };
            })
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, size)
            // 稳定去重：同知识点也允许多题，但同题只出现一次
            .filter((v: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.questionId === v.questionId) === i);
          return {
            entityId: ctx.entityId,
            total: ranked.length,
            strategy: 'mastery_gap + sm2_spacing (edu.sr_queue 到期日驱动)',
            questions: ranked,
          };
        },
      }),
      // 长期记忆三件套（memory.*）自 W2.3 起由**出厂插件** `plugins/memory` 提供；
      // 宿主按**原位**拼回（同 index），使工具表顺序与插件化前逐项一致（listTools() 集合不变）。
      ...safePluginTools,
      makeTool({
        name: 'lesson.current',
        description:
          '驱动一节课：针对一个知识点的授课状态机，把「问答判题」升级为「设案→讲解→例题→再练」。' +
          '学生想「上课/讲解/教我/学某知识点」时用它；状态存于该生长期记忆 lesson:<kpId>，跨消息保持"正在上到第几步"。' +
          '各阶段返回真实数据：assess=摸底(该KP该生真实掌握度+未解决错题)、teach=讲解(该生该KP最近一次实际答错的写法,作"一题一错因")、example=讲一道该KP真题、drill=再练(该KP一道真题,判读仍走 answer.grade)。' +
          '每讲完一步，带上 stage 参数推进到下一步(assess→teach→example→drill→complete)，否则复用已推进的阶段。',
        inputSchema: { type: 'object', properties: { kpId: { type: 'string' }, stage: { type: 'string', enum: ['assess', 'teach', 'example', 'drill', 'complete'] } }, required: ['kpId'] },
        async execute(ctx, args) {
          if (!args.kpId) return { success: false, error: 'kpId 必填', kpId: null };
          const kpId = args.kpId;
          const mem = ctx.memory; // 可能为 undefined（无 key/mock 路径）→ 状态不持久化但不阻断授课
          const memKey = `lesson:${kpId}`;
          // 读当前阶段（跨消息续课）；LLM 显式带 stage 则推进
          let state: any = {};
          if (mem) { try { state = (await mem.get(ctx.entityId, memKey)) || {}; } catch { state = {}; } }
          const stage = (args.stage as string) || state.stage || 'assess';
          const next = stage === 'assess' ? 'teach' : stage === 'teach' ? 'example' : stage === 'example' ? 'drill' : stage === 'drill' ? 'complete' : null;
          // 该KP名称
          const kpName = (await findKnowledgePointName(eduQuery(ctx.store), kpId)) ?? kpId;
          let anchor: any = {};
          if (stage === 'assess') {
            // 摸底：该KP该生真实作答聚合 + 该KP未解决错题数
            const [row, unresolvedWrong] = await Promise.all([
              masteryBySingleKp(eduQuery(ctx.store), ctx.entityId, kpId),
              countUnresolvedWrongByKp(eduQuery(ctx.store), ctx.entityId, kpId),
            ]);
            const attempts = row?.attempts || 0;
            anchor = { mastery: attempts ? Math.round(((row.correct || 0) / attempts) * 100) : 0, attempts, unresolvedWrong, baseline: attempts ? Math.round(((row.correct || 0) / attempts) * 100) : 0 };
          } else if (stage === 'teach') {
            // 错因：优先讲"这次答错"(授课状态里 lesson.submit 存的本错)；无则回退该KP最近一次实际答错的作答
            const targetedWrong = state.lastWrongAnswer && String(state.lastWrongAnswer).trim();
            if (targetedWrong) {
              anchor = { wrongAnswer: String(state.lastWrongAnswer), targeted: true };
            } else {
              const wrongAnswer = await findLastWrongAnswer(eduQuery(ctx.store), ctx.entityId, kpId);
              anchor = { wrongAnswer, targeted: false };
            }
          } else if (stage === 'example' || stage === 'drill') {
            // 例题 / 再练：该KP抽一道真题（真实题面；判读走 answer.grade）
            const q = await findRandomQuestionByKp(eduQuery(ctx.store), kpId);
            anchor = q ? { questionId: q.question_id, content: q.content, type: q.type, options: q.options, difficulty: q.difficulty } : { question: null };
          }
          // 持久化推进后的阶段 + 授课数据锚(跨消息续课)：example/drill 记 lastQuestion, assess 记 baseline，lesson.submit 据此回授。
          if (mem) {
            try {
              const persist = { stage, kpId, updatedAt: new Date().toISOString() } as any;
              if ((stage === 'example' || stage === 'drill') && anchor.questionId) persist.lastQuestion = anchor.questionId;
              else if (state.lastQuestion) persist.lastQuestion = state.lastQuestion;
              if (typeof anchor.baseline === 'number') persist.baseline = anchor.baseline;
              else if (state.baseline != null) persist.baseline = state.baseline;
              if (state.lastWrongAnswer) persist.lastWrongAnswer = state.lastWrongAnswer; // 本轮错因带过 teach→example→drill,直至判对清除
              await mem.set(ctx.entityId, memKey, persist, 1);
            } catch { /* 状态未持久化不阻断 */ }
          }
          return {
            success: true,
            kpId,
            kpName,
            stage,
            next,
            state,
            hint: next ? `已到「${stage}」步，讲完带 stage:"${next}" 推进下一步。` : `该课已完成，可再用 lesson.current 开新课。`,
            ...anchor,
          };
        },
      }),
      makeTool({
        name: 'lesson.submit',
        description:
          '提交授课进程中抢时段(drill/example)的一道题作答：判题并落库(practice.answer 与 lesson 分享同一 gradeAnswerRecord，答对可消错题)。随后把结果耦送到授课状态机 lesson:<kpId>：答对则推进到 complete 并记 drillDone=true/lastCorrect=true；答错则留在 drill 记 lastCorrect=false/missedCount+1(回到 lesson.current 结论再练)。返回当次判定与该KP当前真实掌握度 practiceMastery(含 baseline 提升,即「回授掌握度」)。学生抢时作答后必须调它，别再用裸 answer.grade 以免状态机不推进。',
        inputSchema: {
          type: 'object',
          properties: {
            kpId: { type: 'string', description: '授课知识点ID' },
            questionId: { type: 'string', description: '作答的题目ID；缺省回退到授课状态机记的 lastQuestion' },
            answer: { type: 'string', description: '学生作答内容' },
          },
          required: ['kpId', 'answer'],
        },
        async execute(ctx, args) {
          const kpId = String(args.kpId ?? '');
          const answer = String(args.answer ?? '');
          const questionId = String(args.questionId ?? '');
          const mem = ctx.memory;
          let state: any = {};
          let memKey = '';
          if (mem) {
            memKey = `lesson:${kpId}`;
            try { state = (await mem.get(ctx.entityId, memKey)) ?? {}; } catch { state = {}; }
          }
          // 题目ID缺省回退到授课状态上次下发的题
          const gradeId = questionId || state.lastQuestion || '';
          if (!gradeId) {
            return { success: false, error: '缺少 questionId，且授课状态无 lastQuestion(需要先用 lesson.current 下发例题/再练题)' };
          }
          // 同源判题+落库(与 answer.grade 完全一致)
          const graded: any = await gradeAnswerRecord(ctx, { questionId: gradeId, answer, resolveOnCorrect: true });
          const isCorrect = !!graded.isCorrect;
          // 回授掌握度：该KP当前真实掌握度 + baseline 提升（先算,状态机与落盘都要用）
          let practiceMastery = 0;
          let baseline: number | null = typeof state.baseline === 'number' ? state.baseline : null;
          try {
            const rc = await practiceAggByKp(eduQuery(ctx.store), ctx.entityId, kpId);
            if (rc.attempts) practiceMastery = Math.round((rc.correct / rc.attempts) * 100);
          } catch { /* 掌握度查询失败不阻断 */ }
          // 耦合回授课状态机：答对推进,答错留练，并累计练习次数/漏档
          let stage = 'drill';
          let drillDone = false;
          let lastCorrect = false;
          const nextState: any = {
            stage,
            kpId,
            lastQuestion: gradeId,
            attempts: (state.attempts ?? 0) + 1,
            missedCount: (state.missedCount ?? 0) + (isCorrect ? 0 : 1),
            practiceMastery,
            baseline,
            delta: baseline != null ? practiceMastery - baseline : null,
            updatedAt: new Date().toISOString(),
          };
          if (isCorrect) {
            stage = 'complete';
            drillDone = true;
            lastCorrect = true;
            nextState.stage = stage;
            nextState.lastCorrect = true;
            nextState.drillDone = true;
            nextState.lastWrongAnswer = null; // 答对收束,清掉这次错因
          } else {
            nextState.lastCorrect = false;
            nextState.lastWrongAnswer = answer; // 把"这次答错的写法"耦合进状态,teach 据此重讲本错
          }
          if (mem) {
            try { await mem.set(ctx.entityId, memKey, nextState, 1); } catch { /* 状态未持久化不阻断 */ }
          }
          // 答对收束 → 落盘一节课（best-effort，失败不阻断判题返回；在 mem.set 后调用,lessonRecord 读到含 practiceMastery/delta 的新状态）
          let recordId: string | null = null;
          if (isCorrect) {
            try {
              const rec = await lessonRecord(ctx, { kpId, outcome: 'completed' });
              recordId = rec?.recordId ?? null;
            } catch { /* 落盘失败不阻断 */ }
          }
          return {
            success: true,
            kpId,
            questionId: gradeId,
            isCorrect,
            correct: isCorrect,
            stage,
            next: stage === 'complete' ? null : stage,
            drillDone,
            lastCorrect,
            attempts: nextState.attempts,
            missedCount: nextState.missedCount,
            resolved: graded.resolved,
            sm2: graded.sm2,
            practiceMastery,
            baseline,
            delta: baseline != null ? practiceMastery - baseline : null,
            recordId,
            wrongAnswer: isCorrect ? null : answer,
            targeted: !isCorrect,
            suggestedNext: isCorrect ? null : 'teach',
            hint: isCorrect
              ? `答对!该课完成,当前掌握度 ${practiceMastery}%${baseline != null ? `(摸底 ${baseline}%,提升 ${practiceMastery - baseline}%)` : ''}。`
              : `答错了。你的答案「${answer}」不对——重讲时会专门讲解这个写法错在哪,再练一次。`,
          };
        },
      }),
      makeTool({
        name: 'progress.trend',
        description:
          '返回该学生各知识点的答题掌握度随时间变化的时间序列（由 edu.answer_records 按天累计真实作答得到），用于判断进步/退步。学生问「我有没有进步/学得怎么样/练得对不对」时先调它。',
        inputSchema: { type: 'object', properties: {}, required: [] },
        async execute(ctx, args) {
          void args;
          const entityId = ctx.entityId;
          // 按天分桶：作答正确/次数（同源 diagnosis 的聚合，仅多按天分组，保证趋势与掌握度一致）
          const rows = await dailyMasterySeries(eduQuery(ctx.store), entityId);
          // 每 KP 按天累进掌握度 → 时间序列 + 首末差值
          const byKp = new Map<string, any>();
          for (const r of rows || []) {
            const kp = byKp.get(r.kp_id) ?? {
              kpId: r.kp_id,
              kpName: r.kp_name,
              attempts: 0,
              correct: 0,
              series: [] as { day: string; mastery: number }[],
            };
            kp.attempts += r.attempts || 0;
            kp.correct += r.correct || 0;
            const mastery = kp.attempts ? Math.round((kp.correct / kp.attempts) * 100) : 0;
            kp.series.push({ day: String(r.day).slice(0, 10), mastery });
            byKp.set(r.kp_id, kp);
          }
          const knowledgePoints = [...byKp.values()].map((k: any) => {
            const first = k.series[0];
            const last = k.series[k.series.length - 1];
            return {
              kpId: k.kpId,
              kpName: k.kpName,
              currentMastery: last?.mastery ?? 0,
              deltaPts: first && last ? last.mastery - first.mastery : 0,
              days: k.series.length,
              series: k.series,
            };
          });
          return {
            knowledgePoints,
            hasHistory: knowledgePoints.some((k: any) => k.days >= 2),
            note: knowledgePoints.length ? '' : '还没有作答记录，暂无法看趋势。',
          };
        },
      }),
      makeTool({
        name: 'diagnosis.state',
        description:
          '汇总并刷新该学生的真实学习状态：按知识点算作答掌握度、按知识点归并未解决错题，并把最新掌握度写回掌握度快照表。诊断缺口/进度前先调它。',
        async execute(ctx, args) {
          void args;
          const entityId = ctx.entityId;
          // 1) per-KP 作答掌握度（edu.answer_records → questions → knowledge_points）
          const agg = await masteryByKnowledgePointWithTime(eduQuery(ctx.store), entityId);
          // 2) 未解决错题按 KP 名归并（wrong_questions.knowledge_point 是文本）
          const wr = await countUnresolvedWrongByKpName(eduQuery(ctx.store), entityId);
          const knowledgePoints = (agg || []).map((r: any) => {
            const attempts = r.attempts || 0;
            const correct = r.correct || 0;
            return {
              kpId: r.kp_id,
              kpName: r.kp_name,
              attempts,
              correct,
              mastery: attempts ? Math.round((correct / attempts) * 100) : 0,
              avgTimeSec: r.avg_time_ms != null ? Math.round(r.avg_time_ms / 1000) : null,
            };
          });
          const unresolvedByKp = (wr || []).map((r: any) => ({ kpName: r.kp_name, count: r.count }));
          const totalAttempts = knowledgePoints.reduce((s: number, k: any) => s + k.attempts, 0);
          const totalCorrect = knowledgePoints.reduce((s: number, k: any) => s + k.correct, 0);
          // 3) 把最新掌握度吃进 mastery_snapshots（每 生每 KP 一行，UPSERT）——运行时真正维护掌握度模型
          for (const k of knowledgePoints) {
            try {
              await upsertMasterySnapshot(eduQuery(ctx.store), {
                userId: entityId,
                kpId: k.kpId,
                mastery: k.mastery,
                confidence: k.attempts > 0 ? Math.min(1, k.attempts / 20) : 0,
              });
            } catch { /* 快照写失败不阻断诊断 */ }
          }
          return {
            entityId,
            totalAttempts,
            totalCorrect,
            accuracy: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
            totalUnresolved: (wr || []).reduce((s: number, r: any) => s + (r.count || 0), 0),
            knowledgePoints,
            unresolvedByKp,
          };
        },
      }),
      makeTool({
        name: 'plan.generate',
        description: '把弱项知识点落成个性化学习计划：对每个弱知识点评判一条温习练习，写入学习计划表，计划在「学习计划」页可见。',
        inputSchema: {
          type: 'object',
          properties: { weakKnowledgePointIds: { type: 'array', items: { type: 'string' } } },
          required: ['weakKnowledgePointIds'],
        },
        async execute(ctx, args) {
          const entityId = ctx.entityId;
          const ids: string[] = (args.weakKnowledgePointIds || []).slice(0, 8);
          if (!ids.length) return { ok: false, reason: '未提供弱项知识点(weakKnowledgePointIds)' };
          // 1) 先归档未完成的同类计划，避免计划堆叠
          await archivePersonalizedPlans(eduQuery(ctx.store), entityId);
          // 2) 取每个弱 KPs 的名称 + 抽一题作温习任务
          const kps = await listKnowledgePointsByIds(eduQuery(ctx.store), ids);
          const tasks = [];
          for (const k of kps || []) {
            const questionId = await findQuestionIdByKp(eduQuery(ctx.store), k.id);
            tasks.push({
              kpId: k.id,
              kpName: k.name,
              taskType: 'review',
              title: `温习「${k.name}」`,
              subject: k.subject ?? null,
              questionId,
            });
          }
          // 3) 落库一行个性化计划
          const title = `个性化学习计划（${tasks.length} 个弱项）`;
          const planId = await insertPersonalizedPlan(eduQuery(ctx.store), {
            userId: entityId,
            title,
            planData: { tasks, generatedAt: new Date().toISOString() },
            totalTasks: tasks.length,
          });
          return { ok: true, planId, title, totalTasks: tasks.length, tasks };
        },
      }),
      makeTool({
        name: 'lesson.record',
        description:
          '把一节上完的课收束落盘到 edu.learning_plans（plan_type=\'lesson\'）：plan_data 存该课真实结果（授课阶段/摸底/当前掌握度/提升增量/连错数/作答数），status 直接取 outcome（一次性历史记录,不归档不堆叠）。授课完成(答对收束)后由 lesson.submit 自动调用，也可显式调用补录历史课。运营台总览可见"上了多少节课"。',
        inputSchema: {
          type: 'object',
          properties: {
            kpId: { type: 'string', description: '本课知识点ID' },
            kpName: { type: 'string', description: '本课知识点名称(可选,缺省查库)' },
            outcome: { type: 'string', enum: ['completed', 'abandoned'], description: '本课结局(缺省 completed)' },
          },
          required: ['kpId'],
        },
        async execute(ctx, args) {
          return lessonRecord(ctx, args);
        },
      }),
      makeTool({
        name: 'plan.complete',
        description:
          '把个性化学习计划中的一条任务标记为已完成：答对会回灌该知识点的掌握度快照并消除对应未解决错题；全部任务完成时自动把计划置为「已完成」。学生做完一条任务后调它。',
        inputSchema: {
          type: 'object',
          properties: {
            planId: { type: 'string' },
            taskIndex: { type: 'integer', description: '该任务在 plan_data.tasks 中的下标(从 0 起)' },
            correct: { type: 'boolean', description: '这条任务是否答对(缺省视为答对)' },
          },
          required: ['planId', 'taskIndex'],
        },
        async execute(ctx, args) {
          const entityId = ctx.entityId;
          // 所有权铁律: 仅能取属于自己的计划, 杜绝跨学生访问
          const plan = await findPlanForUser(eduQuery(ctx.store), args.planId, entityId);
          if (!plan) return { ok: false, reason: '未找到该学习计划（或不属于当前学生）' };
          const tasks: any[] = Array.isArray(plan.plan_data?.tasks) ? plan.plan_data.tasks : [];
          const idx = Number(args.taskIndex);
          if (!Number.isInteger(idx) || idx < 0 || idx >= tasks.length) {
            return { ok: false, reason: `taskIndex 越界（该计划共 ${tasks.length} 条任务）` };
          }
          const task = tasks[idx];
          task.completed = true;
          task.completedAt = new Date().toISOString();
          const total = Number(plan.total_tasks) || tasks.length;
          const completedTasks = tasks.filter((t: any) => t.completed).length;
          const progress = total ? Math.round((completedTasks / total) * 10000) / 100 : 0;
          const isComplete = completedTasks >= total;
          const nextStatus = isComplete ? 'completed' : plan.status === 'completed' ? 'completed' : 'active';
          let masteryBump: number | null = null;
          // 回灌: 答对 → 消除对应未解决错题 + 抬升该知识点掌握度快照
          if (args.correct !== false && task.kpId) {
            if (task.questionId) {
              try {
                await resolveWrongQuestion(eduQuery(ctx.store), entityId, task.questionId);
              } catch { /* 消除错题失败不阻断完成 */ }
            }
            try {
              const curV = await findMasterySnapshot(eduQuery(ctx.store), entityId, task.kpId);
              const newV = curV == null ? 60 : Math.min(100, curV + 10);
              await upsertMasterySnapshotBumped(eduQuery(ctx.store), entityId, task.kpId, newV);
              masteryBump = newV;
            } catch { /* 快照回灌失败不阻断完成 */ }
          }
          await updatePlanProgress(eduQuery(ctx.store), {
            planId: plan.id,
            userId: entityId,
            planData: plan.plan_data,
            completedTasks,
            progress,
            status: nextStatus,
          });
          return {
            ok: true,
            planId: plan.id,
            title: plan.title,
            taskIndex: idx,
            taskTitle: task.title ?? task.kpName ?? null,
            completedTasks,
            totalTasks: total,
            progress,
            status: nextStatus,
            isComplete,
            masteryBump,
          };
        },
      }),
      makeTool({
        // 版图探索（0.4.0 学科知识版图）：山体摘要——学生在山的哪里/前方是什么/顶峰之外有什么。
        // 与 /api/curriculum/knowledge-map 同源同数据（直读 knowledge_area/area_prerequisite）。
        name: 'map.explorer',
        description:
          '探索学科知识版图（登山视图）：给学科/年级，返回该学科全学段知识山体摘要——当前位置（该年级已学知识域）、前方待攀（更高年级知识域）、峰外地带（K12 之后的学科前沿）。学生问「这门学科都学什么/我学到哪了/以后学什么/这门课的尽头是什么/山顶之外有什么」时调它，用山体比喻给学生讲清全貌与位置感。',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: '学科 code（math/chn/eng/phys/chem/bio，缺省用学生当前学科）' },
            gradeLevel: { type: 'number', description: '年级数字 1-12（缺省用学生档案年级）' },
          },
        },
        async execute(ctx, args) {
          const subject = String(args.subject ?? ctx.student?.subject ?? 'math').toLowerCase();
          const gradeLevel = Number(args.gradeLevel ?? ctx.student?.gradeLevel ?? 7);
          const subj = (await ctx.store.query(
            `SELECT id, code, name FROM ontology.subject WHERE LOWER(code) = LOWER($1)`,
            [subject],
          )).rows[0];
          if (!subj) return { ok: false, reason: `未知学科：${subject}` };
          const areas = (await ctx.store.query(
            `SELECT code, name, description, scope, grade_level
               FROM ontology.knowledge_area
              WHERE subject_id = $1 AND status = 'published'
              ORDER BY grade_level NULLS LAST, code`,
            [subj.id],
          )).rows;
          if (!areas.length) return { ok: false, reason: `学科 ${subj.name} 版图尚未灌库` };
          const k12 = areas.filter((a: any) => a.scope === 'k12');
          const frontier = areas.filter((a: any) => a.scope === 'frontier');
          const passed = k12.filter((a: any) => a.grade_level < gradeLevel);
          const current = k12.filter((a: any) => a.grade_level === gradeLevel);
          const ahead = k12.filter((a: any) => a.grade_level > gradeLevel);
          const coverageRatio = areas.length ? Math.round((k12.length / areas.length) * 100) : 0;
          return {
            ok: true,
            subject: { code: subj.code, name: subj.name },
            studentGrade: gradeLevel,
            stats: {
              totalAreas: areas.length,
              k12Areas: k12.length,
              frontierAreas: frontier.length,
              coverageRatioPct: coverageRatio,
            },
            climbed: passed.map((a: any) => ({ name: a.name, grade: a.grade_level })),
            here: current.map((a: any) => ({ name: a.name, description: a.description })),
            ahead: ahead.map((a: any) => ({ name: a.name, grade: a.grade_level })),
            beyondPeak: frontier.map((a: any) => ({ name: a.name, description: a.description })),
          };
        },
      }),
    ];
  }


  /**
   * 教学技能集：指令并入 system prompt + 携带依赖工具定义（由 AgentCore 统一装载）。
   *
   * W2.3 起技能正文**不再硬编码在本文件**：`tutor` 正文搬进出厂插件
   * `plugins/tutor/SKILL.md`，由装载器读出、`agent-plugins.agentSkills()` 解析后传进来。
   * 换/加一套教法只需放一个插件目录，不必改并重编译本文件。
   * 这里**不做解析**（解析与失败诊断在 agent-plugins）—— 本文件保持「纯内建、零宿主回指」。
   *
   * @param toolDefs 本次装配的工具表（技能据此声明其依赖工具）
   * @param pluginSkills 插件提供的技能正文（缺省空 → 无技能块）
   */
  skills(toolDefs: any[], pluginSkills: Array<{ name: string; description?: string; instructions: string }> = []): SkillRegistry {
    const reg = new SkillRegistry();
    for (const s of pluginSkills) {
      reg.register({ name: s.name, description: s.description || '', instructions: s.instructions, tools: toolDefs });
    }
    return reg;
  }
}
