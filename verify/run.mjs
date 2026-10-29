/**
 * 规则登记器 · 运行器（P0）—— 跑 `registry.mjs` 里每条规则 → **统一机读报告** + 人读摘要 + 退出码。
 *
 * 退出码：任一 **E 级** 未过 → 1（阻断）；否则 0（W/I 只告警）。
 * 用法：`node verify/run.mjs`（`--json` 只输出报告 JSON）。根 `package.json` 挂 `npm run verify`。
 * 报告落 `verify/verify-report.json`（机读；供人工审阅/后续抽产品）。
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RULES } from './registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

async function main() {
  const results = [];
  for (const r of RULES) {
    const t0 = Date.now();
    let res;
    try {
      res = await r.run({ repo: REPO });
    } catch (e) {
      res = { ok: false, findings: [{ error: e && e.message ? e.message : String(e) }] };
    }
    results.push({
      id: r.id,
      dimension: r.dimension,
      level: r.level,
      scope: r.scope,
      ok: !!res.ok,
      ms: Date.now() - t0,
      note: res.note ?? null,
      findings: res.findings ?? [],
    });
  }
  const report = {
    at: new Date().toISOString(),
    summary: {
      total: results.length,
      pass: results.filter((x) => x.ok).length,
      fail: results.filter((x) => !x.ok).length,
      blocked: results.filter((x) => !x.ok && x.level === 'E').length,
    },
    rules: results,
  };
  writeFileSync(join(__dirname, 'verify-report.json'), JSON.stringify(report, null, 2) + '\n');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report));
  } else {
    for (const r of results) {
      const mark = r.ok ? '✓' : r.level === 'E' ? '✗' : '⚠';
      console.log(`${mark} [${r.level}] ${r.id}（${r.dimension}/${r.scope}）${r.ms}ms${r.note ? ` — ${r.note}` : ''}`);
      if (!r.ok) for (const f of r.findings.slice(0, 10)) console.log('    · ' + (typeof f === 'string' ? f : JSON.stringify(f)));
    }
    const s = report.summary;
    console.log(`\n合计 ${s.total} · 通过 ${s.pass} · 未过 ${s.fail}（其中阻断 ${s.blocked}）→ verify/verify-report.json`);
  }
  process.exit(report.summary.blocked > 0 ? 1 : 0);
}

main();
