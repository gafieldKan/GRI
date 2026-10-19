import {
  buildBranchChain,
  buildSoftEdges,
  resolveJsonbPrerequisites,
  type LearningChainSourceRow,
} from './learning-chain';

function row(overrides: Partial<LearningChainSourceRow> = {}): LearningChainSourceRow {
  return {
    kpId: 'kp-1',
    kpCode: 'math.g1.pep.ch01.s01.kp01',
    kpName: '知识点 1',
    chapterId: 's1',
    chapterCode: 'math.g1.pep.ch01.s01',
    chapterName: '第一节',
    chapterParentId: 'c1',
    chapterSortOrder: 1,
    parentChapterCode: 'math.g1.pep.ch01',
    parentChapterName: '第一章',
    parentChapterSortOrder: 1,
    textbookId: 't1',
    textbookCode: 'math.g1.pep',
    textbookSortOrder: 1,
    gradeId: 'g1',
    gradeCode: 'G1',
    gradeLevel: 1,
    gradeSortOrder: 1,
    branchId: 'b1',
    branchCode: 'math.num',
    branchName: '数与算术',
    ...overrides,
  };
}

describe('learning-chain 推导器', () => {
  it('按年级→册→章→节→kpNN 全序生成节节点，章无子节时降级为章节点', () => {
    const source = [
      row({
        kpId: 'kp-10',
        kpCode: 'math.g1.pep.ch01.s02.kp10',
        chapterId: 's2',
        chapterCode: 'math.g1.pep.ch01.s02',
        chapterName: '第二节',
        chapterSortOrder: 2,
      }),
      row({
        kpId: 'kp-2',
        kpCode: 'math.g1.pep.ch01.s02.kp02',
        chapterId: 's2',
        chapterCode: 'math.g1.pep.ch01.s02',
        chapterName: '第二节',
        chapterSortOrder: 2,
      }),
      row(),
      row({
        kpId: 'kp-fallback',
        kpCode: 'math.g1.pep.ch03.kp01',
        chapterId: 'c3',
        chapterCode: 'math.g1.pep.ch03',
        chapterName: '第三章',
        chapterParentId: null,
        chapterSortOrder: 3,
        parentChapterCode: null,
        parentChapterName: null,
        parentChapterSortOrder: null,
      }),
    ];

    const chain = buildBranchChain(source);

    expect(chain.nodes.map((node) => node.code)).toEqual([
      'math.g1.pep.ch01.s01',
      'math.g1.pep.ch01.s02',
      'math.g1.pep.ch03',
    ]);
    expect(chain.nodes[1].kps.map((kp) => kp.code)).toEqual([
      'math.g1.pep.ch01.s02.kp02',
      'math.g1.pep.ch01.s02.kp10',
    ]);
    expect(chain.nodes[0]).toMatchObject({
      unit: 'section',
      chapter: 'math.g1.pep.ch01',
      chapterName: '第一章',
    });
    expect(chain.nodes[2]).toMatchObject({
      unit: 'chapter',
      chapter: 'math.g1.pep.ch03',
      chapterName: '第三章',
    });
  });

  it('章存在子节时不以章节点重复承载章上的知识点', () => {
    const source = [
      row({
        kpId: 'kp-root',
        kpCode: 'math.g1.pep.ch01.kp01',
        chapterId: 'c1',
        chapterCode: 'math.g1.pep.ch01',
        chapterName: '第一章',
        chapterParentId: null,
        chapterSortOrder: 1,
        parentChapterCode: null,
        parentChapterName: null,
        parentChapterSortOrder: null,
      }),
      row(),
    ];

    const chain = buildBranchChain(source);

    expect(chain.nodes.map((node) => node.code)).toEqual(['math.g1.pep.ch01.s01']);
    expect(chain.nodes[0].kps.map((kp) => kp.code)).toEqual([
      'math.g1.pep.ch01.s01.kp01',
    ]);
  });

  it('匿名不输出任何 mastery 键，登录按 >=80 生成三态并聚合节掌握度', () => {
    const source = [
      row({ kpId: 'kp-1', kpCode: 'math.g1.pep.ch01.s01.kp01', masteryScore: 90 }),
      row({ kpId: 'kp-2', kpCode: 'math.g1.pep.ch01.s01.kp02', masteryScore: 70 }),
    ];

    const anonymous = buildBranchChain(source, [], { includeMastery: false });
    expect(Object.prototype.hasOwnProperty.call(anonymous.nodes[0], 'mastery')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(anonymous.nodes[0].kps[0], 'mastery')).toBe(false);
    expect(anonymous.nodes[0].state).toBe('dim');
    expect(anonymous.nodes[0].kps.map((kp) => kp.state)).toEqual(['dim', 'dim']);

    const personalized = buildBranchChain(source, [], { includeMastery: true });
    expect(personalized.nodes[0].mastery).toBe(80);
    expect(personalized.nodes[0].state).toBe('lit');
    expect(personalized.nodes[0].kps[0]).toMatchObject({ mastery: 90, state: 'lit' });
    expect(personalized.nodes[0].kps[1]).toMatchObject({ mastery: 70, state: 'half' });
    expect(personalized.summary).toEqual({
      total: 1,
      lit: 1,
      next: null,
    });
  });

  it('显式边优先覆盖同端点 seq 边，方向为先修→学习者，且 reason 非空', () => {
    const source = [
      row({ kpId: 'kp-1', kpCode: 'math.g1.pep.ch01.s01.kp01' }),
      row({ kpId: 'kp-2', kpCode: 'math.g1.pep.ch01.s01.kp02' }),
    ];

    const chain = buildBranchChain(
      source,
      [
        {
          from: 'math.g1.pep.ch01.s01.kp01',
          to: 'math.g1.pep.ch01.s01.kp02',
          reason: '显式前置 知识点 1',
        },
      ],
      { includeMastery: false },
    );

    expect(chain.edges).toEqual([
      {
        from: 'math.g1.pep.ch01.s01.kp01',
        to: 'math.g1.pep.ch01.s01.kp02',
        kind: 'explicit',
        reason: '显式前置 知识点 1',
      },
    ]);
  });

  it('JSONB 先修只接受可精确解析的字符串引用，歧义/不可解析项忽略', () => {
    const source = [
      row({ kpId: 'kp-1', kpCode: 'a', kpName: 'A' }),
      row({
        kpId: 'kp-2',
        kpCode: 'b',
        kpName: 'B',
        prerequisites: ['a', 42, { code: 'a' }, null],
      }),
    ];

    expect(resolveJsonbPrerequisites(source)).toEqual([
      { from: 'a', to: 'b', reason: '显式前置 A' },
    ]);
  });

  it('soft 边只连接跨年级骨架邻点，明确标注引导性且不覆盖已有边', () => {
    const source = [
      row({ kpId: 'kp-1', kpCode: 'math.g1.pep.ch01.s01.kp01' }),
      row({
        kpId: 'kp-2',
        kpCode: 'math.g2.pep.ch01.s01.kp01',
        textbookCode: 'math.g2.pep',
        textbookSortOrder: 2,
        gradeId: 'g2',
        gradeCode: 'G2',
        gradeLevel: 2,
        gradeSortOrder: 2,
      }),
    ];
    const chain = buildBranchChain(source);

    const soft = buildSoftEdges(chain.nodes, chain.edges);
    expect(soft).toHaveLength(1);
    expect(soft[0]).toMatchObject({
      from: 'math.g1.pep.ch01.s01.kp01',
      to: 'math.g2.pep.ch01.s01.kp01',
      kind: 'soft',
    });
    expect(soft[0].reason).toContain('引导');

    const explicit = [
      {
        from: 'math.g1.pep.ch01.s01.kp01',
        to: 'math.g2.pep.ch01.s01.kp01',
        kind: 'explicit' as const,
        reason: '显式前置 A',
      },
    ];
    expect(buildSoftEdges(chain.nodes, explicit)).toEqual([]);
  });
});
