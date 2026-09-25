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
});
