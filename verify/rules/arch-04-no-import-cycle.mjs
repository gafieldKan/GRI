/**
 * ARCH-04 无 import 环（level W→E 视存量；scope 通用）
 *
 * 口径：扫描目标源树（`services/api/src` 与 `packages/<pkg>/src`）内的**相对 import**（`./x`、`../x`），
 * 构 import 图、检出环。环 = 两块代码互相依赖 → 无法独立演进/复用（方案点名的真痛点：`organization ↔ world ↔ identity`）。
 *
 * 排除：`import type` / `export type`（编译期擦除，不构成运行期环）；`.spec.ts` / `.d.ts`；`node_modules` / `dist`。
 * 跨包（`@gri/*` 裸名）/ 内置不算（那是「依赖方向」问题，另条规则）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // 目录不存在 → 空（不崩）
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (
      e.isFile() &&
      (e.name.endsWith('.ts') || e.name.endsWith('.js') || e.name.endsWith('.mjs')) &&
      !e.name.endsWith('.spec.ts') &&
      !e.name.endsWith('.d.ts')
    ) {
      out.push(p);
    }
  }
  return out;
}

/** 提取一条源文件里的**相对** import 模块说明符（排除 `import type`/`export type`）。 */
function relSpecifiers(file) {
  const text = readFileSync(file, 'utf8');
  const out = new Set();
  // 三种形态：`import/export … from './x'`（**跨行**亦计，`[^;]` 含换行）；动态 `import('./x')`；副作用 `import './x'`。
  const re = /\b(?:import|export)\b[^;]*?\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)|\bimport\s+['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    // `import type` / `export type` → 编译期擦除，不构成运行期环（用**整条匹配**判，勿只取行首）
    if (/\b(?:import|export)\s+type\b/.test(m[0])) continue;
    out.add(spec);
  }
  return [...out];
}

/** 说明符 → 源文件路径（候选序：原样 / +.ts / /index.ts）；非本集合内文件 → null。 */
function resolveSpec(fromFile, spec, inGraph) {
  const base = resolve(dirname(fromFile), spec);
  for (const cand of [base, `${base}.ts`, join(base, 'index.ts'), `${base}.js`, join(base, 'index.js')]) {
    if (inGraph.has(cand)) return cand;
  }
  return null;
}

/** Tarjan 式找环：返回若干条环（每条为节点路径）。 */
function findCycles(graph) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...graph.keys()].map((k) => [k, WHITE]));
  const stack = [];
  const cycles = [];
  const seen = new Set(); // 环的规范化键，去重
  const visit = (u) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of graph.get(u) ?? []) {
      if (color.get(v) === GRAY) {
        // 回边 → 从栈中截出环
        const i = stack.indexOf(v);
        const cyc = stack.slice(i);
        const key = [...cyc].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cyc);
        }
      } else if (color.get(v) === WHITE) {
        visit(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };
  for (const n of graph.keys()) if (color.get(n) === WHITE) visit(n);
  return cycles;
}

function pkgSrcDirs(repo) {
  const pkgs = join(repo, 'packages');
  const out = [];
  let entries;
  try {
    entries = readdirSync(pkgs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const src = join(pkgs, e.name, 'src');
      try {
        if (readdirSync(src).length >= 0) out.push(src);
      } catch {
        /* 无 src → 跳过 */
      }
    }
  }
  return out;
}

export const arch04NoImportCycle = {
  id: 'ARCH-04',
  dimension: '架构',
  level: 'E', // 当前库绿（无相对 import 环）→ 定为阻断级：将来引入环即失败
  scope: '通用',
  doc: '无 import 环：源树内相对 import 图不得有环（环 = 两块代码互相依赖，无法独立演进/复用）。',
  async run({ repo }) {
    const roots = [join(repo, 'services/api/src'), ...pkgSrcDirs(repo)];
    const files = roots.flatMap((r) => walk(r));
    const inGraph = new Set(files);
    const graph = new Map();
    for (const f of files) {
      const edges = relSpecifiers(f)
        .map((s) => resolveSpec(f, s, inGraph))
        .filter(Boolean);
      graph.set(f, edges);
    }
    const cycles = findCycles(graph);
    return {
      ok: cycles.length === 0,
      findings: cycles.slice(0, 30).map((c) => c.map((x) => relative(repo, x).split(sep).join('/'))),
      note: cycles.length ? `检出 ${cycles.length} 个 import 环` : '无环',
    };
  },
};
