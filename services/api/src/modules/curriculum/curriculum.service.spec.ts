import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { DatabaseService } from '../../database/database.service';
import type { LearningChainSourceRow } from './learning-chain';

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

  // ---- 学科登顶双维度（summit-branches / summit-grades） ----

  const SUMMIT_SUBJECT = { id: 'sub-math', code: 'MATH', name: '数学' };
  const SUMMIT_BRANCHES = [
    { id: 'b-num', code: 'math.num', name: '数与算术', description: '数的认识与运算', clc: 'O12', curriculum: '数与代数', sort_order: 10, parent_id: null, k12_grade_min: 1, k12_grade_max: 9, kp_count: 2, mastery_sum: '162', mastery_count: 2 },
    { id: 'b-alg', code: 'math.alg', name: '代数', description: null, clc: 'O15', curriculum: '方程与不等式', sort_order: 20, parent_id: null, k12_grade_min: 7, k12_grade_max: 12, kp_count: 1, mastery_sum: '79', mastery_count: 1 },
    { id: 'b-seq', code: 'math.seq', name: '数列', description: null, clc: 'O15', curriculum: null, sort_order: 30, parent_id: null, k12_grade_min: 11, k12_grade_max: 12, kp_count: 0, mastery_sum: null, mastery_count: 0 },
    { id: 'b-logic', code: 'math.logic', name: '数理逻辑', description: null, clc: 'O14', curriculum: null, sort_order: 40, parent_id: null, k12_grade_min: 10, k12_grade_max: 12, kp_count: 0, mastery_sum: null, mastery_count: 0 },
    { id: 'b-combi', code: 'math.combi', name: '计数与组合', description: null, clc: 'O15', curriculum: null, sort_order: 50, parent_id: null, k12_grade_min: 11, k12_grade_max: 12, kp_count: 0, mastery_sum: null, mastery_count: 0 },
    { id: 'b-analysis', code: 'math.analysis', name: '数学分析', description: null, clc: 'O17', curriculum: null, sort_order: 60, parent_id: null, k12_grade_min: 10, k12_grade_max: 12, kp_count: 1, mastery_sum: '80', mastery_count: 1 },
    { id: 'b-ds', code: 'math.ds', name: '动力系统', description: '纯学科纵深', clc: 'O19', curriculum: null, sort_order: 61, parent_id: 'b-analysis', k12_grade_min: null, k12_grade_max: null, kp_count: 0, mastery_sum: null, mastery_count: 0 },
    { id: 'b-geometry', code: 'math.geometry', name: '几何', description: null, clc: 'O18', curriculum: null, sort_order: 70, parent_id: null, k12_grade_min: 1, k12_grade_max: 12, kp_count: 0, mastery_sum: null, mastery_count: 0 },
    { id: 'b-prosta', code: 'math.prosta', name: '概率统计', description: null, clc: 'O21', curriculum: null, sort_order: 80, parent_id: null, k12_grade_min: 5, k12_grade_max: 12, kp_count: 0, mastery_sum: null, mastery_count: 0 },
    { id: 'b-or', code: 'math.or', name: '运筹与决策', description: null, clc: 'O22/O23', curriculum: null, sort_order: 90, parent_id: null, k12_grade_min: 10, k12_grade_max: 12, kp_count: 0, mastery_sum: null, mastery_count: 0 },
    { id: 'b-comp', code: 'math.comp', name: '计算数学', description: null, clc: 'O24', curriculum: null, sort_order: 100, parent_id: null, k12_grade_min: 11, k12_grade_max: 12, kp_count: 0, mastery_sum: null, mastery_count: 0 },
  ];

  function mockSummitBranchesDb(branches: Array<Record<string, any>> = SUMMIT_BRANCHES) {
    return jest
      .fn()
      .mockResolvedValueOnce({ rows: [SUMMIT_SUBJECT] })
      .mockResolvedValueOnce({ rows: branches });
  }

  it('summitBranches 匿名：MATH 10 座峰 + 子树 KP 聚合 + 深积分峰顶 + 无 mastery', async () => {
    const query = mockSummitBranchesDb();
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.summitBranches('MATH');

    expect(out.subject.code).toBe('MATH');
    expect(out.peaks).toHaveLength(10);
    expect(out.threshold).toBe(80);
    const num: any = out.peaks.find((p: any) => p.code === 'math.num');
    expect(num.kpCount).toBe(2);
    expect(num.k12GradeMin).toBe(1);
    expect(num.k12GradeMax).toBe(9);
    expect(num.mastery).toBeUndefined();
    expect(num.reached).toBe(false);
    const analysis: any = out.peaks.find((p: any) => p.code === 'math.analysis');
    expect(analysis.children).toHaveLength(1);
    expect(analysis.children[0].code).toBe('math.ds');
    expect(analysis.children[0].isSummit).toBe(false);
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('ontology.knowledge_branch');
    expect(sql).toContain('textbook_chapter');
    expect(sql).toContain('mastery_snapshots');
    expect(params[1]).toBeNull();
  });

  it('summitBranches 登录：按分支子树 KP 聚合 mastery，>=80 才 reached', async () => {
    const branches = SUMMIT_BRANCHES.map((b) =>
      b.code === 'math.num'
        ? { ...b, kp_count: 3, mastery_sum: '240', mastery_count: 3 }
        : b,
    );
    const query = mockSummitBranchesDb(branches);
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.summitBranches('math', 'user-1');

    const num: any = out.peaks.find((p: any) => p.code === 'math.num');
    expect(num.mastery).toBe(80);
    expect(num.reached).toBe(true);
    const alg: any = out.peaks.find((p: any) => p.code === 'math.alg');
    expect(alg.mastery).toBe(79);
    expect(alg.reached).toBe(false);
    const [, params] = query.mock.calls[1] as [string, unknown[]];
    expect(params[1]).toBe('user-1');
  });

  it('summitBranches 学科不存在 → NotFoundException', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const svc = new CurriculumService(mockDb(query));

    await expect(svc.summitBranches('nosuch')).rejects.toBeInstanceOf(NotFoundException);
  });

  const STAGE_ROWS = [
    { stage_id: 'st1', stage_code: 'PRIMARY', stage_name: '小学', stage_sort: 1, grade_id: 'g1', grade_code: 'G1', grade_name: '一年级', grade_sort: 1 },
    { stage_id: 'st1', stage_code: 'PRIMARY', stage_name: '小学', stage_sort: 1, grade_id: 'g2', grade_code: 'G2', grade_name: '二年级', grade_sort: 2 },
    { stage_id: 'st2', stage_code: 'JUNIOR', stage_name: '初中', stage_sort: 2, grade_id: 'g7', grade_code: 'G7', grade_name: '七年级', grade_sort: 7 },
    { stage_id: 'st3', stage_code: 'SENIOR', stage_name: '高中', stage_sort: 3, grade_id: 'g10', grade_code: 'G10', grade_name: '高一', grade_sort: 10 },
  ];
  const GRADE_TEXTBOOKS = [
    { id: 't1', code: 'math.g1.pep', name: '人教版数学一年级上册', grade_code: 'G1', subject_code: 'MATH' },
    { id: 't7', code: 'math.g7.pep', name: '人教版数学七年级上册', grade_code: 'G7', subject_code: 'MATH' },
  ];
  const GRADE_CHAPTERS = [
    { id: 'c1', code: 'math.g1.pep.ch01', name: '准备课', sort_order: 1, textbook_id: 't1', parent_id: null, branch_id: 'b-num', branch_code: 'math.num', branch_name: '数与算术', kp_count: 2, mastery_sum: '162', mastery_count: 2 },
    { id: 'c1s1', code: 'math.g1.pep.ch01.s01', name: '数一数', sort_order: 1, textbook_id: 't1', parent_id: 'c1', branch_id: 'b-num', branch_code: 'math.num', branch_name: '数与算术', kp_count: 1, mastery_sum: '90', mastery_count: 1 },
    { id: 'c7', code: 'math.g7.pep.ch01', name: '有理数', sort_order: 1, textbook_id: 't7', parent_id: null, branch_id: 'b-num', branch_code: 'math.num', branch_name: '数与算术', kp_count: 1, mastery_sum: '72', mastery_count: 1 },
  ];

  function mockSummitGradesDb() {
    return jest
      .fn()
      .mockResolvedValueOnce({ rows: [SUMMIT_SUBJECT] })
      .mockResolvedValueOnce({ rows: STAGE_ROWS })
      .mockResolvedValueOnce({ rows: GRADE_TEXTBOOKS })
      .mockResolvedValueOnce({ rows: GRADE_CHAPTERS });
  }

  it('summitGrades 匿名：学段→年级→人教版册/章 + 每章所属分支', async () => {
    const query = mockSummitGradesDb();
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.summitGrades('MATH');

    expect(out.subject.code).toBe('MATH');
    expect(out.threshold).toBe(80);
    expect(out.stages[0].code).toBe('PRIMARY');
    expect(out.stages[0].grades.map((g: any) => g.code)).toEqual(['G1', 'G2']);
    const g1: any = out.stages[0].grades.find((g: any) => g.code === 'G1');
    expect(g1.textbooks).toHaveLength(1);
    expect(g1.textbooks[0].chapters[0].branch.code).toBe('math.num');
    expect(g1.textbooks[0].chapters[0].kpCount).toBe(2);
    expect(g1.textbooks[0].chapters[0].mastery).toBeUndefined();
    expect(g1.textbooks[0].chapters[0].reached).toBe(false);
    const [sql, params] = query.mock.calls[3] as [string, unknown[]];
    expect(sql).toContain('branch_id');
    expect(sql).toContain('mastery_snapshots');
    expect(params[1]).toBeNull();
  });

  it('summitGrades 登录：章/册/年级 mastery 聚合且 >=80 为 reached', async () => {
    const query = mockSummitGradesDb();
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.summitGrades('math', 'user-1');

    const g1: any = out.stages[0].grades.find((g: any) => g.code === 'G1');
    expect(g1.mastery).toBe(84);
    expect(g1.reached).toBe(true);
    expect(g1.textbooks[0].mastery).toBe(84);
    expect(g1.textbooks[0].reached).toBe(true);
    expect(g1.textbooks[0].chapters[0].mastery).toBe(81);
    expect(g1.textbooks[0].chapters[0].reached).toBe(true);
    const [, params] = query.mock.calls[3] as [string, unknown[]];
    expect(params[1]).toBe('user-1');
  });

  // ---- W5-a 学习链（learning-chain）与洞窟聚合（kp-cave） ----

  const CHAIN_SOURCE: LearningChainSourceRow[] = [
    {
      kpId: 'kp-1',
      kpCode: 'math.g1.pep.ch01.s01.kp01',
      kpName: '数一数',
      legacyId: 'math_count',
      prerequisites: [],
      chapterId: 's1',
      chapterCode: 'math.g1.pep.ch01.s01',
      chapterName: '1. 数一数',
      chapterParentId: 'c1',
      chapterSortOrder: 1,
      parentChapterCode: 'math.g1.pep.ch01',
      parentChapterName: '第一单元',
      parentChapterSortOrder: 1,
      textbookId: 't1',
      textbookCode: 'math.g1.pep',
      textbookSortOrder: 1,
      gradeId: 'g1',
      gradeCode: 'G1',
      gradeLevel: 1,
      gradeSortOrder: 1,
      branchId: 'b-num',
      branchCode: 'math.num',
      branchName: '数与算术',
      masteryScore: null,
    },
    {
      kpId: 'kp-2',
      kpCode: 'math.g1.pep.ch01.s01.kp02',
      kpName: '比多少',
      legacyId: 'math_compare',
      prerequisites: ['math_count'],
      chapterId: 's1',
      chapterCode: 'math.g1.pep.ch01.s01',
      chapterName: '1. 数一数',
      chapterParentId: 'c1',
      chapterSortOrder: 1,
      parentChapterCode: 'math.g1.pep.ch01',
      parentChapterName: '第一单元',
      parentChapterSortOrder: 1,
      textbookId: 't1',
      textbookCode: 'math.g1.pep',
      textbookSortOrder: 1,
      gradeId: 'g1',
      gradeCode: 'G1',
      gradeLevel: 1,
      gradeSortOrder: 1,
      branchId: 'b-num',
      branchCode: 'math.num',
      branchName: '数与算术',
      masteryScore: null,
    },
  ];

  function mockLearningChainDb(source = CHAIN_SOURCE, explicit: any[] = []) {
    return jest
      .fn()
      .mockResolvedValueOnce({ rows: [SUMMIT_SUBJECT] })
      .mockResolvedValueOnce({ rows: source })
      .mockResolvedValueOnce({ rows: explicit });
  }

  it('learningChain 要求 subject 且有 branch/grade 限定，禁止全量请求', async () => {
    const query = jest.fn();
    const svc = new CurriculumService(mockDb(query));

    await expect(svc.learningChain('MATH')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.learningChain('', 'math.num')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('learningChain 匿名按 branch 限定：无 mastery 键、显式优先、同节 seq、soft 标注引导', async () => {
    const source = [
      ...CHAIN_SOURCE,
      {
        ...CHAIN_SOURCE[0],
        kpId: 'kp-2b',
        kpCode: 'math.g1.pep.ch01.s01.kp03',
        kpName: '几个和第几',
        legacyId: 'math_ordinal',
        prerequisites: [],
        masteryScore: null,
      },
      {
        ...CHAIN_SOURCE[0],
        kpId: 'kp-3',
        kpCode: 'math.g2.pep.ch01.s01.kp01',
        kpName: '二年级数数',
        legacyId: 'math_count_g2',
        prerequisites: [],
        ancestorChapterCode: undefined,
        chapterId: 's2',
        chapterCode: 'math.g2.pep.ch01.s01',
        chapterName: '二年级第一节',
        chapterParentId: 'c2',
        parentChapterCode: 'math.g2.pep.ch01',
        textbookId: 't2',
        textbookCode: 'math.g2.pep',
        textbookSortOrder: 2,
        gradeId: 'g2',
        gradeCode: 'G2',
        gradeLevel: 2,
        gradeSortOrder: 2,
        masteryScore: null,
      },
    ];
    const query = mockLearningChainDb(source);
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.learningChain('math', 'math.num');

    expect(out.subject).toBe('MATH');
    expect(out.branch).toBe('math.num');
    expect(out.nodes).toHaveLength(2);
    expect(out.nodes[0].unit).toBe('section');
    expect(out.nodes[0].state).toBe('dim');
    expect(Object.prototype.hasOwnProperty.call(out.nodes[0], 'mastery')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out.nodes[0].kps[0], 'mastery')).toBe(false);
    expect(out.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'explicit', from: 'math.g1.pep.ch01.s01.kp01' }),
        expect.objectContaining({ kind: 'seq', reason: '同节序列' }),
        expect.objectContaining({ kind: 'soft', reason: expect.stringContaining('引导') }),
      ]),
    );
    expect(out.edges.every((edge: any) => edge.reason && edge.kind)).toBe(true);
    const [sqlSubject, paramsSubject] = query.mock.calls[0] as [string, unknown[]];
    expect(sqlSubject).toContain('ontology.subject');
    expect(paramsSubject).toEqual(['math']);
    const [sqlSource, paramsSource] = query.mock.calls[1] as [string, unknown[]];
    expect(sqlSource).toContain('ontology.knowledge_branch');
    expect(sqlSource).toContain('textbook_chapter');
    expect(sqlSource).not.toContain('t.sort_order');
    expect(sqlSource).toContain('NULL::numeric AS "masteryScore"');
    expect(paramsSource).toEqual(['MATH', 'math.num', null]);
  });

  it('learningChain 登录叠加 mastery；grade 限定落在年级而非 branch', async () => {
    const source = CHAIN_SOURCE.map((row, i) => ({
      ...row,
      masteryScore: i === 0 ? '90' : '70',
    }));
    const query = mockLearningChainDb(source);
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.learningChain('math', undefined, 'G1', 'user-1');

    expect(out.branch).toBeNull();
    expect(out.nodes[0].mastery).toBe(80);
    expect(out.nodes[0].state).toBe('lit');
    const [sqlSource, paramsSource] = query.mock.calls[1] as [string, unknown[]];
    expect(sqlSource).toContain('mastery_snapshots');
    expect(sqlSource).toContain('COALESCE(kp.grade_level, g.sort_order) = $3');
    expect(paramsSource).toEqual(['MATH', null, 1, 'user-1']);
  });

  const CAVE_KP_ID = '10000000-0000-0000-0000-000000000001';
  const CAVE_ROW = {
    id: CAVE_KP_ID,
    code: 'math.g1.pep.ch01.s01.kp01',
    name: '数一数',
    subject: 'math',
    gradeLevel: 1,
    chapterId: 's1',
    chapterCode: 'math.g1.pep.ch01.s01',
    chapterName: '1. 数一数',
    branchCode: 'math.num',
    masteryScore: null,
  };
  const CAVE_CHAIN_SOURCE: LearningChainSourceRow[] = [
    ...CHAIN_SOURCE,
    {
      ...CHAIN_SOURCE[0],
      kpId: 'kp-s2-1',
      kpCode: 'math.g1.pep.ch01.s02.kp01',
      kpName: '分一分',
      legacyId: 'math_sort',
      prerequisites: [],
      chapterId: 's2',
      chapterCode: 'math.g1.pep.ch01.s02',
      chapterName: '2. 分一分',
      chapterSortOrder: 2,
    },
  ];

  it('kpCave 匿名：公开题目入口/前置/下一节点，strips mastery 与个人聚合', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [CAVE_ROW] })
      .mockResolvedValueOnce({
        rows: [{ id: 'pre-1', code: 'math.g1.pep.ch01.s01.pre', name: '前置', source: 'canonical' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'q1', content: '题', options: ['A', 'B'], answer: 'A', analysis: null, difficulty: 1, type: 'multiple-choice' }],
      })
      .mockResolvedValueOnce({ rows: CAVE_CHAIN_SOURCE });
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.kpCave(CAVE_KP_ID);

    expect(out.kp.code).toBe(CAVE_ROW.code);
    expect(out.state).toBe('dim');
    expect(Object.prototype.hasOwnProperty.call(out, 'mastery')).toBe(false);
    expect(out.prerequisites[0]).toMatchObject({ code: 'math.g1.pep.ch01.s01.pre', kind: 'explicit' });
    expect(out.questions).toMatchObject({
      total: 1,
      entry: `/api/curriculum/knowledge-points/${CAVE_KP_ID}/questions`,
    });
    expect(out.next?.code).toBe('math.g1.pep.ch01.s02');
    expect(out.wrongQuestions).toBeUndefined();
    expect(out.reviews).toBeUndefined();
    expect(out.achievements).toBeUndefined();
    const [sqlMain, paramsMain] = query.mock.calls[0] as [string, unknown[]];
    expect(sqlMain).toContain('NULL::numeric AS "masteryScore"');
    expect(paramsMain).toEqual([CAVE_KP_ID, null]);
    const [sqlPrerequisites] = query.mock.calls[1] as [string];
    expect(sqlPrerequisites).toContain("jsonb_typeof(ref.value) = 'string'");
    const [sqlQuestions] = query.mock.calls[2] as [string];
    expect(sqlQuestions).toContain("jsonb_typeof(options) = 'array'");
  });

  it('kpCave 登录：mastery 三态 + 错题/复习/成就聚合', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...CAVE_ROW, masteryScore: '82' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: CAVE_CHAIN_SOURCE })
      .mockResolvedValueOnce({
        rows: [{
          id: 'wq-1',
          questionId: 'q1',
          content: '错题',
          wrongCount: 2,
          lastAttemptAt: '2026-10-18T00:00:00Z',
          total: 23,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          questionId: 'q1',
          content: '复习题',
          nextReview: '2026-10-19T00:00:00Z',
          total: 25,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ code: 'cave_lit', name: '洞窟点亮', description: null, unlockedAt: '2026-10-19T00:00:00Z' }],
      });
    const svc = new CurriculumService(mockDb(query));

    const out = await svc.kpCave(CAVE_KP_ID, 'user-1');

    expect(out.mastery).toBe(82);
    expect(out.state).toBe('lit');
    expect(out.wrongQuestions?.due).toBe(23);
    expect(out.reviews?.due).toBe(25);
    expect(out.achievements?.count).toBe(1);
    const [sqlWrong, paramsWrong] = query.mock.calls[4] as [string, unknown[]];
    expect(sqlWrong).toContain('edu.wrong_questions');
    expect(sqlWrong).toContain('COUNT(*) OVER()');
    expect(paramsWrong).toEqual(['user-1', CAVE_KP_ID, 20]);
    const [sqlReview, paramsReview] = query.mock.calls[5] as [string, unknown[]];
    expect(sqlReview).toContain('sq.next_review <= NOW()');
    expect(sqlReview).toContain('COUNT(*) OVER()');
    expect(paramsReview).toEqual(['user-1', CAVE_KP_ID, 20]);
  });

  it('kpCave kpId 缺失/非法 → NotFoundException，且不查库', async () => {
    const query = jest.fn();
    const svc = new CurriculumService(mockDb(query));

    await expect(svc.kpCave(undefined)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.kpCave('not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });
});
