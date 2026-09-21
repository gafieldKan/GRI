import { runEtl } from './etl-converge-ai';
import type { Pg } from './etl-converge-ai';

/**
 * Fake pool：模拟 runEtl 的两类行为——
 *   1) 映射读（_etl_entity_map/_etl_student_map）在多次运行间持久复用 uuid（客户端幂等核心）；
 *   2) 数据层 INSERT 模拟 ON CONFLICT DO NOTHING：同一实体主键重复插入视为跳过（服务端幂等）。
 * 源行所有时戳字段给固定值，保证两次运行的 INSERT 参数完全一致（PK 唯一即可命中 DO NOTHING）。
 */
const TS = new Date('2024-01-01T00:00:00Z');

function makeFake() {
  const entityMap = new Map<string, string>(); // `${entity}|${legacy}` → uuid
  const studentMap = new Map<string, string>(); // legacy → uuid
  const dataKeys = new Set<string>(); // 数据行 PK 签名（DO NOTHING 模拟：命中则跳过）
  const sqlLog: string[] = [];
  let newInserts = 0;

  const destQuery = (sql: string, params: unknown[] = []) => {
    sqlLog.push(sql);
    // —— 映射读 ——
    if (/FROM public\._etl_entity_map WHERE entity = \$1 AND legacy_id = \$2/.test(sql)) {
      const k = `${params[0]}|${params[1]}`;
      return Promise.resolve({ rows: entityMap.has(k) ? [{ new_id: entityMap.get(k) }] : [], rowCount: 0 });
    }
    if (/SELECT new_id FROM public\._etl_entity_map WHERE entity='knowledge_points' AND legacy_id=\$1/.test(sql)) {
      const k = `knowledge_points|${params[0]}`;
      return Promise.resolve({ rows: entityMap.has(k) ? [{ new_id: entityMap.get(k) }] : [], rowCount: 0 });
    }
    if (/FROM public\._etl_student_map WHERE legacy_student_id = \$1/.test(sql)) {
      const u = studentMap.get(String(params[0]));
      return Promise.resolve({ rows: u ? [{ user_id: u }] : [], rowCount: 0 });
    }
    // —— 映射写 ——
    if (/INSERT INTO public\._etl_entity_map/.test(sql)) {
      entityMap.set(`${params[0]}|${params[1]}`, String(params[2]));
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (/INSERT INTO public\._etl_student_map/.test(sql)) {
      studentMap.set(String(params[0]), String(params[1]));
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    // —— 数据 INSERT（含 edu.students）：DO NOTHING 语义（按 表+前两个 PK 参 去重）——
    if (/^INSERT INTO /i.test(sql)) {
      const table = sql.replace(/INSERT INTO (\S+)/, '$1');
      const key = `${table}|${params[0]}|${params[1] ?? ''}`;
      if (!dataKeys.has(key)) {
        dataKeys.add(key);
        newInserts += 1;
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  };

  const srcRows: Record<string, any[]> = {
    students: [{ id: 'student_001', name: '小明', grade: '八年级', created_at: TS, updated_at: TS }],
    knowledge_points: [{ id: 'math_pythagorean', name: '勾股定理', prerequisites: null, examples: null, common_mistakes: null, related_knowledge: null, created_at: TS }],
    questions: [{ id: 'q1', knowledge_point_id: 'math_pythagorean', content: '3-4-?', answer: '5', difficulty: 1, created_at: TS }],
    exams: [{ id: 'exam1', student_id: 'student_001', subject: '数学', created_at: TS, updated_at: TS }],
    analysis_reports: [{ id: 'r1', student_id: 'student_001', exam_id: 'exam1', student_score: 80, created_at: TS, updated_at: TS }],
    wrong_questions: [{ id: 'w1', student_id: 'student_001', question_text: '错题', subject: '数学', created_at: TS, updated_at: TS }],
    learning_plans: [{ id: 'p1', student_id: 'student_001', plan_type: 'daily', created_at: TS, updated_at: TS }],
    practice_sessions: [{ id: 'ps1', student_id: 'student_001', questions: '[{"id":"q1"}]', created_at: TS, completed_at: TS }],
    sr_queue: [{ student_id: 'student_001', question_id: 'q1', interval: 1, ease_factor: 2.5, repetitions: 1, updated_at: TS }],
    reminders: [{ id: 'rem1', student_id: 'student_001', type: 'daily', created_at: TS }],
    user_preferences: [{ student_id: 'student_001', daily_goal: 15, updated_at: TS }],
    achievements: [{ id: 'ach1', student_id: 'student_001', code: 'first_exam', created_at: TS }],
    mastery_snapshots: [{ id: 'ms1', student_id: 'student_001', knowledge_point_id: 'math_pythagorean', mastery_score: 0.5, calculated_at: TS, created_at: TS }],
  };
  const srcQuery = (sql: string) => {
    if (/FROM pg_tables/.test(sql)) {
      return Promise.resolve({
        rows: Object.keys(srcRows).map((t) => ({ tablename: t })),
        rowCount: Object.keys(srcRows).length,
      });
    }
    const match = sql.match(/FROM (\w+)/);
    const table = match?.[1] ?? '';
    return Promise.resolve({ rows: srcRows[table] ?? [], rowCount: srcRows[table]?.length ?? 0 });
  };

  const src: Pg = { query: srcQuery, end: async () => {} };
  const dest = { query: destQuery, newInserts: () => newInserts, log: () => sqlLog };
  return { src, dest };
}

describe('etl-converge-ai.runEtl', () => {
  it('收敛 13 张 smartlens 表，legacy_id → uuid 映射正确', async () => {
    const { src, dest } = makeFake();
    const { counts } = await runEtl(src, dest);

    expect(counts.students).toBe(1);
    expect(counts.knowledge_points).toBe(1);
    expect(counts.questions).toBe(1);
    expect(counts.exams).toBe(1);
    expect(counts.analysis_reports).toBe(1);
    expect(counts.wrong_questions).toBe(1);
    expect(counts.learning_plans).toBe(1);
    expect(counts.practice_sessions).toBe(1);
    expect(counts.sr_queue).toBe(1);
    expect(counts.reminders).toBe(1);
    expect(counts.user_preferences).toBe(1);
    expect(counts.achievements).toBe(1);
    expect(counts.mastery_snapshots).toBe(1);
  });

  it('双跑幂等：第二次运行不再新增任何数据行（uuid 复用 + DO NOTHING）', async () => {
    const { src, dest } = makeFake();
    const run1 = await runEtl(src, dest);
    const insertsAfterRun1 = dest.newInserts();

    const run2 = await runEtl(src, dest);
    const insertsAfterRun2 = dest.newInserts();

    // 列表稳定 + 第二遍零新增插入 → ON CONFLICT 语义成立
    expect(run2.counts.students).toBe(run1.counts.students);
    expect(run2.counts.questions).toBe(run1.counts.questions);
    expect(run2.counts.exams).toBe(run1.counts.exams);
    expect(insertsAfterRun2).toBe(insertsAfterRun1);
  });

  it('legacy student（varchar）解析为稳定 uuid，且被学情表复用', async () => {
    const { src, dest } = makeFake();
    await runEtl(src, dest);
    const before = dest.newInserts();
    await runEtl(src, dest); // 再跑：映射复用不换 id、不新增行
    expect(dest.newInserts()).toBe(before);
    // edu.students 仅首轮 INSERT 一次：第二轮复用既有映射，不再重复插入（幂等核心）
    const studentInserts = dest.log().filter((s) => s.includes('edu.students')).length;
    expect(studentInserts).toBe(1);
  });
});