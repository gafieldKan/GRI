// TwinService 经 TuitionService 静态依赖 @gri/agent-core（ESM）；测试不连真实 LLM，
// 按本仓其他 spec 的统一做法桩掉（仅需 ModelRouter / storeFrom 两个符号）。
jest.mock('@gri/agent-core', () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q }));

import { TwinService } from './twin.service';

/**
 * 锁 TwinService 的「既成真源 → 孪生对外形态」映射（装配是否忠实），
 * 不连真实 DB/服务。真实真源正确性由各自模块的 spec / node --test 覆盖。
 */
function makeService(overrides: {
  events?: any[];
  teacherN?: number;
  profile?: any;
  stats?: any;
  map?: any;
  memories?: any;
  backfillCount?: number;
} = {}) {
  const events = overrides.events ?? [
    {
      id: 'e2', entity_id: 'u1', kind: 'action', title: '完成练习 5 题', text: null,
      source: '练习', scene_id: 'math.map.a.01.05', diffs: [],
      before: null, after: null, at: new Date('2026-10-02T10:00:00Z'),
    },
    {
      id: 'e1', entity_id: 'u1', kind: 'system', title: '数字孪生建立', text: '初始化',
      source: '系统初始化', scene_id: null, diffs: [],
      before: null, after: null, at: new Date('2026-10-01T10:00:00Z'),
    },
  ];

  const db = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT after FROM twin.event')) {
        return { rows: [{ after: { totalAnswered: 19, accuracy: 70 } }] };
      }
      if (sql.includes('FROM twin.event') && sql.includes('ORDER BY at DESC')) {
        return { rows: events };
      }
      if (sql.includes('FROM twin.event') && sql.includes('COUNT(*)')) {
        return { rows: [{ n: overrides.backfillCount ?? 0 }] };
      }
      if (sql.includes('FROM agent.sessions')) {
        return { rows: [{ n: overrides.teacherN ?? 4 }] };
      }
      if (sql.includes('FROM edu.answer_records') && sql.includes('GROUP BY d')) {
        return { rows: [{ d: new Date('2026-09-30T00:00:00Z'), n: 3, correct: 2 }] };
      }
      if (sql.includes('INSERT INTO twin.event')) {
        return {
          rows: [{
            id: 'e9', entity_id: 'u1', kind: 'system', title: '数字孪生建立', text: '初始化',
            source: '系统初始化', scene_id: null, diffs: [], before: null, after: null,
            at: new Date('2026-10-02T10:00:00Z'),
          }],
        };
      }
      return { rows: [] };
    }),
  } as any;

  const identity = {
    getProfileByExternalId: jest.fn(async () => overrides.profile ?? {
      user: { id: 'u1', username: 'stu', email: 'stu@x', role: 'student', avatar_url: null },
      student: { name: '小智', grade: 8, avatar_url: 'a.png', textbook_version: '人教版', school: '实验中学' },
    }),
  } as any;

  const tuition = {
    computeStats: jest.fn(async () => overrides.stats ?? {
      totalAnswered: 20, correctCount: 15, accuracy: 75, practiceSessions: 3, unresolvedWrong: 2,
    }),
  } as any;

  const curriculum = {
    knowledgeMap: jest.fn(async () => overrides.map ?? {
      subject: { code: 'math', name: '数学' },
      fields: [{ code: 'math.map.f.01', name: '数与代数' }],
      areas: [
        { code: 'math.map.a.01.01', fieldCode: 'math.map.f.01', name: '整数与运算', scope: 'k12', gradeLevel: 1, mastery: 90 },
        { code: 'math.map.a.01.05', fieldCode: 'math.map.f.01', name: '一次式', scope: 'k12', gradeLevel: 8, mastery: 70 },
        { code: 'math.map.a.09.01', fieldCode: 'math.map.f.01', name: '数学分析', scope: 'frontier', gradeLevel: null },
      ],
      stats: { total: 3, k12: 2, frontier: 1, coverageRatio: 0.6667, byGrade: {} },
    }),
  } as any;

  const agent = {
    listMemory: jest.fn(async () => overrides.memories ?? [
      { key: 'setting.preferredDifficulty', value: 'adaptive', strength: 2, updatedAt: new Date('2026-09-28T00:00:00Z') },
    ]),
  } as any;

  return { svc: new TwinService(db, identity, tuition, curriculum, agent), db, identity, tuition, curriculum, agent };
}

describe('TwinService —— 学生数字孪生装配', () => {
  it('assembleOverview：身份来自 students、世界来自 curriculum、能力按领域聚合、关系值由教学轮次派生', async () => {
    const { svc } = makeService();
    const o = await svc.assembleOverview('u1', 'math');

    // 身份
    expect(o.profile.name).toBe('小智');
    expect(o.profile.gradeName).toBe('八年级');
    expect(o.profile.avatarUrl).toBe('a.png');
    expect(o.profile.school).toBe('实验中学');

    // 世界
    expect(o.world.subject).toBe('math');
    expect(o.world.subjectName).toBe('数学');
    expect(o.world.areas).toHaveLength(3);

    // 能力雷达：领域 f.01 = (90+70)/2 = 80
    expect(o.state.skills).toEqual([
      { fieldCode: 'math.map.f.01', name: '数与代数', mastery: 80 },
    ]);

    // 掌握度汇总（仅 k12）：avg 80，mastered 1，learning 1
    expect(o.state.mastery).toEqual({ avg: 80, mastered: 1, learning: 1, weak: 0, total: 2 });

    // 关系值：4 轮 → 10 + 4*2 = 18
    expect(o.state.relations.teacher).toEqual({ interactions: 4, bond: 18 });

    // 场景：最近一条带 scene_id 的事件 → 营地名解析
    expect(o.state.scene).toEqual({ code: 'math.map.a.01.05', name: '一次式' });

    // 经历 + 记忆
    expect(o.events).toHaveLength(2);
    expect(o.events[0].at).toBe('2026-10-02T10:00:00.000Z');
    expect(o.memories).toEqual([
      { key: 'setting.preferredDifficulty', value: 'adaptive', strength: 2, updatedAt: '2026-09-28T00:00:00.000Z' },
    ]);
  });

  it('容错：世界/记忆真源异常时降级为空件，孪生壳仍可渲染', async () => {
    const { svc, curriculum, agent } = makeService();
    curriculum.knowledgeMap.mockRejectedValueOnce(new Error('map down'));
    agent.listMemory.mockRejectedValueOnce(new Error('memory down'));

    const o = await svc.assembleOverview('u1', 'math');
    expect(o.world.subject).toBeNull();
    expect(o.world.areas).toEqual([]);
    expect(o.state.skills).toEqual([]);
    expect(o.memories).toEqual([]);
    expect(o.profile.name).toBe('小智'); // 身份仍在
  });

  it('listEvents：行 → 驼峰映射 + 限幅', async () => {
    const { svc, db } = makeService();
    const evs = await svc.listEvents('u1', 9999);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM twin.event'),
      ['u1', 500], // 限幅到 500
    );
    expect(evs[0]).toMatchObject({ id: 'e2', entityId: 'u1', sceneId: 'math.map.a.01.05' });
  });

  it('recordEvent：追加经历并回读映射', async () => {
    const { svc } = makeService();
    const e = await svc.recordEvent('u1', { kind: 'session', title: '人物激活' });
    expect(e.kind).toBe('system'); // 假 db 固定返回
    expect(e.id).toBe('e9');
  });

  it('backfill：时间线非空则幂等跳过', async () => {
    const { svc } = makeService({ backfillCount: 3 });
    await expect(svc.backfill('u1')).resolves.toEqual({ created: 0, skipped: true });
  });

  it('backfill：空时间线时建立初始化事件 + 按日回填', async () => {
    const { svc } = makeService({ backfillCount: 0 });
    await expect(svc.backfill('u1')).resolves.toEqual({ created: 1, skipped: false });
  });

  it('updateProfile：白名单落 edu.students 并记一条 profile 经历', async () => {
    const { svc, identity, db } = makeService();
    const base = { id: 'u1', username: 'stu', email: null, role: 'student', avatar_url: null };
    identity.getProfileByExternalId
      .mockResolvedValueOnce({ user: base, student: { name: '小智', grade: 8 } })
      .mockResolvedValueOnce({ user: base, student: { name: '小智', grade: 9 } });

    const p = await svc.updateProfile('u1', { gradeLevel: 9 });
    expect(p.gradeName).toBe('九年级');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO edu.students'),
      expect.arrayContaining(['u1', 9]),
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO twin.event'),
      expect.any(Array),
    );
  });

  it('recordAction：记录学习行动并派生进度差异', async () => {
    const { svc, db } = makeService();
    const e = await svc.recordAction('u1', { verb: 'practice', sceneId: 'math.map.a.01.05' });
    expect(e.id).toBe('e9');
    // 上一条行动快照 70% → 当前 75%：差异写入事件的 diffs JSON
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO twin.event'),
      expect.arrayContaining([expect.stringContaining('正确率')]),
    );
  });
});
