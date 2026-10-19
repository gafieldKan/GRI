export type LearningState = 'dim' | 'half' | 'lit';

export interface LearningChainSourceRow {
  kpId: string;
  kpCode: string;
  kpName: string;
  legacyId?: string | null;
  chapterId: string;
  chapterCode: string;
  chapterName: string;
  chapterParentId: string | null;
  chapterSortOrder: number | null;
  parentChapterCode: string | null;
  parentChapterName: string | null;
  parentChapterSortOrder: number | null;
  textbookId: string;
  textbookCode: string;
  textbookSortOrder: number | null;
  gradeId: string;
  gradeCode: string;
  gradeLevel: number;
  gradeSortOrder: number | null;
  branchId: string;
  branchCode: string;
  branchName: string;
  masteryScore?: number | string | null;
  prerequisites?: unknown;
}

export interface LearningChainKp {
  code: string;
  name: string;
  mastery?: number;
  state: LearningState;
}

export interface LearningChainNode {
  code: string;
  name: string;
  grade: string;
  chapter: string;
  chapterName: string;
  unit: 'section' | 'chapter';
  kps: LearningChainKp[];
  mastery?: number;
  state: LearningState;
}

export type LearningEdgeKind = 'explicit' | 'seq' | 'soft';

export interface LearningChainEdge {
  from: string;
  to: string;
  kind: LearningEdgeKind;
  reason: string;
}

export interface ExplicitLearningEdge {
  from: string;
  to: string;
  reason: string;
}

export interface LearningChainResult {
  nodes: LearningChainNode[];
  edges: LearningChainEdge[];
  summary: {
    total: number;
    lit: number;
    next: string | null;
  };
}

interface InternalNode extends Omit<LearningChainNode, 'kps'> {
  key: string;
  chapterCode: string;
  parentChapterCode: string | null;
  chapterSortOrder: number | null;
  parentChapterSortOrder: number | null;
  textbookCode: string;
  textbookSortOrder: number | null;
  gradeLevel: number;
  gradeSortOrder: number | null;
  kps: Array<LearningChainKp & { sortOrder: number }>;
}

function numeric(value: string | null | undefined): number {
  if (value == null || value === '') return Number.MAX_SAFE_INTEGER;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function kpNumber(code: string): number {
  const match = code.match(/kp(\d+)(?!.*\d)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function summarize(nodes: LearningChainNode[]): LearningChainResult['summary'] {
  const lit = nodes.filter((node) => node.state === 'lit').length;
  return {
    total: nodes.length,
    lit,
    next: nodes.find((node) => node.state !== 'lit')?.code ?? null,
  };
}

function stateFor(mastery: number | undefined): LearningState {
  if (mastery == null) return 'dim';
  return mastery >= 80 ? 'lit' : 'half';
}

export function resolveJsonbPrerequisites(
  source: LearningChainSourceRow[],
): ExplicitLearningEdge[] {
  const byReference = new Map<string, LearningChainSourceRow[]>();
  for (const row of source) {
    for (const reference of [row.kpCode, row.legacyId ?? null]) {
      const value = reference?.trim();
      if (!value) continue;
      const matches = byReference.get(value) ?? [];
      matches.push(row);
      byReference.set(value, matches);
    }
  }

  const edges: ExplicitLearningEdge[] = [];
  for (const row of source) {
    if (!Array.isArray(row.prerequisites)) continue;
    for (const raw of row.prerequisites) {
      if (typeof raw !== 'string') continue;
      const reference = raw.trim();
      const matches = byReference.get(reference);
      if (!reference || matches?.length !== 1) continue;
      const prerequisite = matches[0];
      if (prerequisite.kpCode === row.kpCode) continue;
      edges.push({
        from: prerequisite.kpCode,
        to: row.kpCode,
        reason: `显式前置 ${prerequisite.kpName}`,
      });
    }
  }

  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildBranchChain(
  source: LearningChainSourceRow[],
  explicitEdges: ExplicitLearningEdge[] = [],
  options: { includeMastery?: boolean } = {},
): LearningChainResult {
  const includeMastery = options.includeMastery === true;
  const byNode = new Map<string, InternalNode>();
  const chapterIdsWithSections = new Set(
    source
      .filter((row) => row.chapterParentId != null)
      .map((row) => row.chapterParentId as string),
  );

  for (const row of source) {
    if (!row.kpCode || !row.chapterCode) continue;
    if (row.chapterParentId == null && chapterIdsWithSections.has(row.chapterId)) continue;
    const isSection = row.chapterParentId != null && row.parentChapterCode != null;
    const nodeCode = row.chapterCode;
    const nodeKey = `${row.gradeId}\u0000${row.chapterId}`;
    let node = byNode.get(nodeKey);
    if (!node) {
      node = {
        key: nodeKey,
        code: nodeCode,
        name: isSection ? row.chapterName : row.chapterName,
        grade: row.gradeCode,
        chapter: isSection ? row.parentChapterCode! : row.chapterCode,
        chapterName: isSection ? row.parentChapterName ?? row.chapterName : row.chapterName,
        unit: isSection ? 'section' : 'chapter',
        state: 'dim',
        chapterCode: row.chapterCode,
        parentChapterCode: row.parentChapterCode,
        chapterSortOrder: row.chapterSortOrder,
        parentChapterSortOrder: row.parentChapterSortOrder,
        textbookCode: row.textbookCode,
        textbookSortOrder: row.textbookSortOrder,
        gradeLevel: row.gradeLevel,
        gradeSortOrder: row.gradeSortOrder,
        kps: [],
      };
      byNode.set(nodeKey, node);
    }

    const mastery =
      includeMastery && row.masteryScore != null && Number.isFinite(Number(row.masteryScore))
        ? Number(row.masteryScore)
        : undefined;
    const kp: LearningChainKp & { sortOrder: number } = {
      code: row.kpCode,
      name: row.kpName,
      state: mastery == null ? 'dim' : stateFor(mastery),
      sortOrder: kpNumber(row.kpCode),
    };
    if (mastery != null) kp.mastery = mastery;
    node.kps.push(kp);
  }

  const orderedInternal = [...byNode.values()]
    .sort((a, b) => {
      return (
        numeric(String(a.gradeSortOrder ?? a.gradeLevel)) -
          numeric(String(b.gradeSortOrder ?? b.gradeLevel)) ||
        a.gradeLevel - b.gradeLevel ||
        numeric(String(a.textbookSortOrder)) - numeric(String(b.textbookSortOrder)) ||
        compareText(a.textbookCode, b.textbookCode) ||
        numeric(String(a.parentChapterSortOrder ?? a.chapterSortOrder)) -
          numeric(String(b.parentChapterSortOrder ?? b.chapterSortOrder)) ||
        compareText(a.chapter, b.chapter) ||
        numeric(String(a.chapterSortOrder)) - numeric(String(b.chapterSortOrder)) ||
        compareText(a.code, b.code)
      );
    });
  const nodes = orderedInternal.map((node) => {
      node.kps.sort((a, b) => a.sortOrder - b.sortOrder || compareText(a.code, b.code));
      const available = includeMastery
        ? node.kps.flatMap((kp) => (kp.mastery == null ? [] : [kp.mastery]))
        : [];
      const aggregate =
        available.length > 0
          ? Number((available.reduce((sum, value) => sum + value, 0) / available.length).toFixed(2))
          : undefined;
      const output: LearningChainNode = {
        code: node.code,
        name: node.name,
        grade: node.grade,
        chapter: node.chapter,
        chapterName: node.chapterName,
        unit: node.unit,
        kps: node.kps.map((kp) => {
          const outputKp: LearningChainKp = {
            code: kp.code,
            name: kp.name,
            state: kp.state,
          };
          if (kp.mastery != null) outputKp.mastery = kp.mastery;
          return outputKp;
        }),
        state: stateFor(aggregate),
      };
      if (aggregate != null) output.mastery = aggregate;
      return output;
    });

  const kpCodes = new Set(nodes.flatMap((node) => node.kps.map((kp) => kp.code)));
  const explicit = explicitEdges
    .filter((edge) => kpCodes.has(edge.from) && kpCodes.has(edge.to) && edge.from !== edge.to)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      kind: 'explicit' as const,
      reason: edge.reason.trim() || `显式前置 ${edge.from}`,
    }));
  const explicitKeys = new Set(explicit.map((edge) => `${edge.from}\u0000${edge.to}`));

  const orderedKps = orderedInternal.flatMap((node) =>
    node.kps.map((kp) => ({
      code: kp.code,
      gradeLevel: node.gradeLevel,
      nodeCode: node.code,
      parentChapterCode: node.parentChapterCode,
    })),
  );
  const seq: LearningChainEdge[] = [];
  for (let i = 1; i < orderedKps.length; i++) {
    const previous = orderedKps[i - 1];
    const current = orderedKps[i];
    if (previous.gradeLevel !== current.gradeLevel) continue;
    const key = `${previous.code}\u0000${current.code}`;
    if (explicitKeys.has(key)) continue;
    const reason =
      previous.nodeCode === current.nodeCode
        ? '同节序列'
        : previous.parentChapterCode != null &&
            previous.parentChapterCode === current.parentChapterCode
          ? '同章 kp 序'
          : '同年级课程序列';
    seq.push({ from: previous.code, to: current.code, kind: 'seq', reason });
  }

  return {
    nodes,
    edges: [...explicit, ...seq],
    summary: summarize(nodes),
  };
}

export function buildSoftEdges(
  nodes: LearningChainNode[],
  existingEdges: LearningChainEdge[],
): LearningChainEdge[] {
  const existing = new Set(existingEdges.map((edge) => `${edge.from}\u0000${edge.to}`));
  const soft: LearningChainEdge[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const previous = nodes[i - 1];
    const current = nodes[i];
    if (previous.grade === current.grade) continue;
    const previousGrade = Number(previous.grade.match(/\d+/)?.[0]);
    const currentGrade = Number(current.grade.match(/\d+/)?.[0]);
    if (!Number.isFinite(previousGrade) || !Number.isFinite(currentGrade)) continue;
    if (currentGrade <= previousGrade) continue;
    const from = previous.kps.at(-1)?.code;
    const to = current.kps[0]?.code;
    if (!from || !to || existing.has(`${from}\u0000${to}`)) continue;
    soft.push({
      from,
      to,
      kind: 'soft',
      reason: `跨年级引导性衔接：${previous.grade} → ${current.grade}（非精确前置）`,
    });
  }
  return soft;
}
