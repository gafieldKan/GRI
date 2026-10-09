import { NotFoundException } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { DatabaseService } from '../../database/database.service';

function mockDb(impl: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { query: impl, getPool: jest.fn() } as unknown as DatabaseService;
}

describe('CurriculumService K12 课程体系门面', () => {
  it('listSubjects 只出 active 学科，ordered by sort_order', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: 's1', code: 'CN', name: '语文', domain: 'lang', sort_order: 10, status: 'active' },
        { id: 's2', code: 'MATH', name: '数学', domain: 'math', sort_order: 20, status: 'active' },
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const subjects = await svc.listSubjects();

    expect(subjects).toHaveLength(2);
    expect(subjects[1].code).toBe('MATH');
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('FROM ontology.subject');
    expect(sql).toContain("status = 'active'");
  });

  it('listGrades JOIN 学段、stage 过滤参数化', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: 'g1', code: 'G7', name: '七年级', sort_order: 7, stage_id: 'st2', stage_code: 'JUNIOR', stage_name: '初中', stage_sort: 2 },
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const grades = await svc.listGrades('JUNIOR');

    expect(grades[0].stage.code).toBe('JUNIOR');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JOIN ontology.school_stage');
    expect(params).toEqual(['JUNIOR']);
  });

  it('listKnowledgePoints published 过滤 + 前置依赖聚合', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: 'kp1', code: 'math.g7.pep.ch01.s01.kp01', name: '正数与负数', subject: 'MATH', grade_level: 7, chapter_id: 'c1', chapter_name: '1.1 正数和负数', status: 'published', prerequisites: [] },
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const kps = await svc.listKnowledgePoints('MATH', 7);

    expect(kps[0].status).toBe('published');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("kp.status = 'published'");
    expect(sql).toContain('kp_prerequisite');
    expect(params[0]).toBe('MATH');
    expect(params[1]).toBe(7);
  });

  it('knowledgeGraph 无 userId 时 mastery 为 undefined（游客）', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'c1', code: 'ch01', name: '第一章', sort_order: 1, parent_id: null, textbook_id: 't1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'kp1', code: 'kp01', name: '有理数', description: null, subject: 'MATH', grade_level: 7, chapter_id: 'c1', status: 'published', mastery: null }],
      })
      .mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));

    const graph = await svc.knowledgeGraph('MATH', 7);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.filter((n: any) => n.type === 'chapter')).toHaveLength(1);
    expect(graph.nodes.filter((n: any) => n.type === 'knowledge-point')).toHaveLength(1);
    const kp: any = graph.nodes.find((n: any) => n.type === 'knowledge-point');
    expect(kp.mastery).toBeUndefined();
    // 无 userId：第二段 SQL 不含 mastery_snapshots JOIN
    const [sql2] = query.mock.calls[1] as [string];
    expect(sql2).not.toContain('mastery_snapshots');
  });

  it('knowledgeGraph 有 userId 时叠加 mastery_snapshots', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'kp1', code: 'kp01', name: '有理数', description: null, subject: 'MATH', grade_level: 7, chapter_id: 'c1', status: 'published', mastery: '0.64' }],
      })
      .mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));

    const graph = await svc.knowledgeGraph('MATH', 7, 'user-1');

    const [sql2, params2] = query.mock.calls[1] as [string, unknown[]];
    expect(sql2).toContain('mastery_snapshots');
    expect(params2).toContain('user-1');
    const kp: any = graph.nodes.find((n: any) => n.type === 'knowledge-point');
    expect(kp.mastery).toBe(0.64);
  });

  it('listChapters 平铺行组树（parent 自引用）', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: 'c1', code: 'ch01', name: '第一章', sort_order: 1, textbook_id: 't1', parent_id: null },
        { id: 'c1s1', code: 'ch01.s01', name: '1.1', sort_order: 1, textbook_id: 't1', parent_id: 'c1' },
        { id: 'c2', code: 'ch02', name: '第二章', sort_order: 2, textbook_id: 't1', parent_id: null },
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const tree = await svc.listChapters('t1');

    expect(tree).toHaveLength(2); // 两个根（章）
    expect(tree[0].children).toHaveLength(1); // 第一章下 1 节
    expect(tree[0].children![0].code).toBe('ch01.s01');
  });

  it('getKnowledgePoint 查不到 → NotFoundException', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));

    await expect(svc.getKnowledgePoint('90000000-0000-0000-0000-000000000001')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reviewKnowledgePoint 状态机翻 draft→reviewed（fail-fast 非法迁移）', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: 'draft' }] })
      .mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));

    const r = await svc.reviewKnowledgePoint('90000000-0000-0000-0000-000000000002', 'approve');

    expect(r.from).toBe('draft');
    expect(r.to).toBe('reviewed');
    const [sql2, params2] = query.mock.calls[1] as [string, unknown[]];
    expect(sql2).toContain('SET status = $1');
    expect(params2[0]).toBe('reviewed');
  });

  it('reviewKnowledgePoint published+approve 不迁移（published 恒定）', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ status: 'published' }] });
    const svc = new CurriculumService(mockDb(query));

    const r = await svc.reviewKnowledgePoint('90000000-0000-0000-0000-000000000003', 'approve');

    expect(r.from).toBe('published');
    expect(r.to).toBe('published');
  });

  // ---- 0.4.0 学科知识版图（knowledgeMap：领域→知识域两级树 + 比重 + 登录掌握度叠加） ----

  /** knowledgeMap 的 mock 查询序：subject → areas → pres → kpCounts → [mastery] */
  function mockMapDb(rows: { subject?: any[]; areas?: any[]; pres?: any[]; kpCounts?: any[]; mastery?: any[] }) {
    return jest
      .fn()
      .mockResolvedValueOnce({ rows: rows.subject ?? [] })
      .mockResolvedValueOnce({ rows: rows.areas ?? [] })
      .mockResolvedValueOnce({ rows: rows.pres ?? [] })
      .mockResolvedValueOnce({ rows: rows.kpCounts ?? [] })
      .mockResolvedValueOnce({ rows: rows.mastery ?? [] });
  }

  const MAP_FIXTURE = {
    subject: [{ id: 'sub1', code: 'MATH', name: '数学' }],
    areas: [
      { id: 'f1', code: 'math.map.f.01', name: '数与代数', description: '数系与运算', scope: 'k12', grade_level: null, parent_id: null },
      { id: 'a1', code: 'math.map.a.01.01', name: '有理数', description: null, scope: 'k12', grade_level: 7, parent_id: 'f1' },
      { id: 'a2', code: 'math.map.a.01.02', name: '一元一次方程', description: null, scope: 'k12', grade_level: 7, parent_id: 'f1' },
      { id: 'a3', code: 'math.map.a.01.03', name: '二次函数', description: null, scope: 'k12', grade_level: 9, parent_id: 'f1' },
      { id: 'a4', code: 'math.map.a.01.04', name: '抽象代数', description: '群环域', scope: 'frontier', grade_level: null, parent_id: 'f1' },
    ],
    pres: [{ from_code: 'math.map.a.01.01', to_code: 'math.map.a.01.02' }],
    kpCounts: [{ grade_level: 7, n: 12 }, { grade_level: 9, n: 4 }],
  };

  it('knowledgeMap 匿名：两级树 + 比重算术 + byGrade 全键 + 无 mastery', async () => {
    const query = mockMapDb(MAP_FIXTURE);
    const svc = new CurriculumService(mockDb(query));

    const map = await svc.knowledgeMap('math');

    expect(map.subject.name).toBe('数学');
    expect(map.fields).toHaveLength(1);
    expect(map.fields[0].code).toBe('math.map.f.01');
    expect(map.areas).toHaveLength(4); // a.* 知识域 4（领域行不计入）
    const eq: any = map.areas.find((a: any) => a.code === 'math.map.a.01.02');
    expect(eq.fieldCode).toBe('math.map.f.01'); // 父领域 code 已解析
    expect(eq.prerequisites).toEqual(['math.map.a.01.01']); // DAG 边按 to_code 挂载
    expect(eq.mastery).toBeUndefined(); // 游客无 mastery
    // 比重算术锁形：k12=3 / total=4 → 0.75
    expect(map.stats).toEqual({
      total: 4,
      k12: 3,
      frontier: 1,
      coverageRatio: 0.75,
      byGrade: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 2, '8': 0, '9': 1, '10': 0, '11': 0, '12': 0 },
    });
    // published 过滤 + archived 不出（SQL 锁形）
    const [sqlAreas] = query.mock.calls[1] as [string];
    expect(sqlAreas).toContain("ka.status = 'published'");
    expect(sqlAreas).toContain('ontology.knowledge_area');
  });

  it('knowledgeMap 登录：mastery_snapshots 按年级聚合叠加各知识域', async () => {
    const query = mockMapDb({ ...MAP_FIXTURE, mastery: [{ grade_level: 7, avg_mastery: '62.5' }] });
    const svc = new CurriculumService(mockDb(query));

    const map = await svc.knowledgeMap('math', 'user-1');

    const [sqlMastery, paramsMastery] = query.mock.calls[4] as [string, unknown[]];
    expect(sqlMastery).toContain('mastery_snapshots');
    expect(paramsMastery[0]).toBe('user-1');
    const g7: any = map.areas.find((a: any) => a.code === 'math.map.a.01.01');
    expect(g7.mastery).toBe(62.5); // G7 落位知识域拿到该年级均值
    const g9: any = map.areas.find((a: any) => a.code === 'math.map.a.01.03');
    expect(g9.mastery).toBeUndefined(); // 无数据年级不硬造
    const frontier: any = map.areas.find((a: any) => a.scope === 'frontier');
    expect(frontier.mastery).toBeUndefined(); // 峰外无掌握度语义
  });

  it('knowledgeMap kpCount 叠加：题库层衔接锚点（G7=12 题）', async () => {
    const query = mockMapDb(MAP_FIXTURE);
    const svc = new CurriculumService(mockDb(query));

    const map = await svc.knowledgeMap('math');

    const g7: any = map.areas.find((a: any) => a.gradeLevel === 7);
    expect(g7.kpCount).toBe(12);
    const frontier: any = map.areas.find((a: any) => a.scope === 'frontier');
    expect(frontier.kpCount).toBe(0); // 峰外不锚 KP
  });

  it('knowledgeMap 学科不存在 → NotFoundException', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));

    await expect(svc.knowledgeMap('nosuch')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---- 学习路径（learningPath：先修闭包 + Kahn 拓扑排序去重 + 掌握度叠加） ----

  /** learningPath 的 mock 查询序：goal → closure → edges → [mastery] */
  function mockPathDb(rows: {
    goal?: any[];
    closure?: any[];
    edges?: any[];
    mastery?: any[];
  }) {
    return jest
      .fn()
      .mockResolvedValueOnce({ rows: rows.goal ?? [] })
      .mockResolvedValueOnce({ rows: rows.closure ?? [] })
      .mockResolvedValueOnce({ rows: rows.edges ?? [] })
      .mockResolvedValueOnce({ rows: rows.mastery ?? [] });
  }

  const goalRow = { id: 'G', name: '二次函数', subject: 'MATH', grade_level: 9 };

  it('learningPath 匿名：先修在前拓扑序、目标在后、无 mastery join', async () => {
    const query = mockPathDb({
      goal: [goalRow],
      closure: [
        { id: 'G', code: 'g', name: '二次函数', description: null, subject: 'MATH', grade_level: 9, chapter_name: '函数', depth: 0 },
        { id: 'B', code: 'b', name: '一次函数', description: null, subject: 'MATH', grade_level: 8, chapter_name: '函数', depth: 1 },
        { id: 'A', code: 'a', name: '平面直角坐标系', description: null, subject: 'MATH', grade_level: 7, chapter_name: '函数', depth: 2 },
      ],
      edges: [
        { from_kp: 'G', to_kp: 'B' }, // G 依赖 B
        { from_kp: 'B', to_kp: 'A' }, // B 依赖 A
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const path = await svc.learningPath('G');

    expect(path.steps.map((s) => s.id)).toEqual(['A', 'B', 'G']); // 先修在前
    const goal = path.steps.find((s) => s.isGoal);
    expect(goal?.id).toBe('G');
    expect(goal?.order).toBe(2);
    expect(path.steps[0].order).toBe(0);
    // 游客：3 条查询，无 mastery_snapshots
    expect(query).toHaveBeenCalledTimes(3);
    const [sqlClosure] = query.mock.calls[1] as [string];
    expect(sqlClosure).toContain('WITH RECURSIVE');
    expect(sqlClosure).toContain('ontology.kp_prerequisite');
    const [sqlEdges] = query.mock.calls[2] as [string];
    expect(sqlEdges).toContain('ANY($1::uuid[])');
    expect(path.steps.every((s) => s.mastery === undefined)).toBe(true);
  });

  it('learningPath 登录：mastery_snapshots 叠加各步骤掌握度（0–100）', async () => {
    const query = mockPathDb({
      goal: [goalRow],
      closure: [
        { id: 'G', code: 'g', name: '二次函数', description: null, subject: 'MATH', grade_level: 9, chapter_name: '函数', depth: 0 },
        { id: 'B', code: 'b', name: '一次函数', description: null, subject: 'MATH', grade_level: 8, chapter_name: '函数', depth: 1 },
      ],
      edges: [{ from_kp: 'G', to_kp: 'B' }],
      mastery: [{ knowledge_point_id: 'B', mastery_score: '85' }],
    });
    const svc = new CurriculumService(mockDb(query));

    const path = await svc.learningPath('G', 'user-1');

    const [sqlM, paramsM] = query.mock.calls[3] as [string, unknown[]];
    expect(sqlM).toContain('mastery_snapshots');
    expect(paramsM[0]).toBe('user-1');
    expect(path.steps.find((s) => s.id === 'B')?.mastery).toBe(85);
    expect(path.steps.find((s) => s.id === 'G')?.mastery).toBeUndefined(); // 无数据不硬造
  });

  it('learningPath 菱形依赖去重：汇点仅出现一次且先修优先', async () => {
    const query = mockPathDb({
      goal: [goalRow],
      closure: [
        { id: 'G', code: 'g', name: 'G', description: null, subject: 'MATH', grade_level: 9, chapter_name: null, depth: 0 },
        { id: 'C', code: 'c', name: 'C', description: null, subject: 'MATH', grade_level: 8, chapter_name: null, depth: 1 },
        { id: 'B', code: 'b', name: 'B', description: null, subject: 'MATH', grade_level: 7, chapter_name: null, depth: 1 },
        { id: 'A', code: 'a', name: 'A', description: null, subject: 'MATH', grade_level: 7, chapter_name: null, depth: 2 },
      ],
      edges: [
        { from_kp: 'G', to_kp: 'B' },
        { from_kp: 'G', to_kp: 'C' },
        { from_kp: 'B', to_kp: 'A' },
        { from_kp: 'C', to_kp: 'A' },
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const path = await svc.learningPath('G');
    const ids = path.steps.map((s) => s.id);

    expect(ids).toHaveLength(4); // 去重：A 只出现一次
    expect(new Set(ids).size).toBe(4);
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('G'));
    expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('G'));
  });

  it('learningPath 环安全：a↔b 互赖不无限递归、每点仅一次', async () => {
    const query = mockPathDb({
      goal: [{ id: 'A', name: 'A', subject: 'MATH', grade_level: 7 }],
      closure: [
        { id: 'A', code: 'a', name: 'A', description: null, subject: 'MATH', grade_level: 7, chapter_name: null, depth: 0 },
        { id: 'B', code: 'b', name: 'B', description: null, subject: 'MATH', grade_level: 7, chapter_name: null, depth: 1 },
      ],
      edges: [
        { from_kp: 'A', to_kp: 'B' },
        { from_kp: 'B', to_kp: 'A' },
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const path = await svc.learningPath('A');

    expect(path.steps.map((s) => s.id).sort()).toEqual(['A', 'B']); // 残留按确定性序追加，不丢
    // 闭包 SQL 带环保护
    const [sqlClosure] = query.mock.calls[1] as [string];
    expect(sqlClosure).toMatch(/NOT .* = ANY\(a\.path\)/);
  });

  it('learningPath 目标不存在 → NotFoundException', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));

    await expect(svc.learningPath('90000000-0000-0000-0000-0000000000ff')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  // ---- 随堂练习（knowledgePointQuestions：选择题含选项/答案/解析） ----

  it('knowledgePointQuestions 只出选择题、limit 钳制、SQL 锁形', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: 'q1', content: '3,4,5 能否构成直角三角形？', options: ['能', '不能'], answer: 'A', analysis: '勾股定理', difficulty: 1, type: 'multiple-choice' },
      ],
    });
    const svc = new CurriculumService(mockDb(query));

    const qs = await svc.knowledgePointQuestions('kp-1', 50);

    expect(qs).toHaveLength(1);
    expect(qs[0].answer).toBe('A');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('edu.questions');
    expect(sql).toContain('jsonb_array_length(options) >= 2');
    expect(params[0]).toBe('kp-1');
    expect(params[1]).toBe(20); // limit 上限钳制
  });

  it('knowledgePointQuestions 默认 limit=5，非数字回退 5', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));
    await svc.knowledgePointQuestions('kp-1', undefined as unknown as number);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe(5);
  });
});
