import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIST_UNRESOLVED_WRONG_SQL,
  REVIEW_CANDIDATES_SQL,
  PLAN_FOR_USER_SQL,
  UPSERT_WRONG_QUESTION_SQL,
  DAILY_MASTERY_SERIES_SQL,
  QUESTIONS_BY_SUBJECT_SQL,
  STUDENT_ROW_BY_USER_SQL,
  DAILY_ANSWER_AGGREGATE_SQL,
} from './repository';

/**
 * `edu.*` 内联 SQL 的判据：SQL 关键字紧跟 `edu.`（`FROM edu.` / `JOIN edu.` / `INTO edu.` / `UPDATE edu.`）。
 * 注释与工具描述里的 `edu.sr_queue`、`edu.learning_plans` 等**业务文案**不命中 —— 本判据只抓真语句。
 */
const INLINE_EDU_SQL = /(FROM|JOIN|INTO|UPDATE)\s+edu\./;

/** 某模块目录下的生产源码（排除 `*.spec.ts` —— 测试假库自带 SQL 属测试装置，非生产直取）。 */
function moduleSources(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts'))
    .map((e) => ({ file: e.name, text: readFileSync(join(dir, e.name), 'utf8') }));
}

/**
 * W2.1 出口判据的可执行版：「`edu.*` 单一领域组件」不是靠约定，而是靠这条断言守着。
 * 任何人往**受守卫模块**里再写一句内联 `edu.*` SQL，本用例即红。
 * 扫描面 = 模块顶层 `.ts`（排除 spec）。**注**：`tuition` 的直取在 `agents/` 子目录（须递归，待 W2.1c-3 收口后纳入）；
 * `curriculum` 待 W2.1c-2。
 */
const GUARDED_MODULES = ['agent', 'identity', 'twin'];

describe('edu-core 单一领域所有者（W2.1 / W2.1c）', () => {
  it.each(GUARDED_MODULES)('%s 模块生产源码零直取 edu.*（一律经 edu-core）', (mod) => {
    const dir = join(__dirname, '..', mod);
    const sources = moduleSources(dir);
    // 防路径错致假绿：扫描面必须非空
    expect(sources.length).toBeGreaterThan(0);
    const offenders = sources.filter((s) => INLINE_EDU_SQL.test(s.text)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it('edu-core 承载读写语句，且逐 entity 隔离谓词在内（所有权铁律不被搬丢）', () => {
    expect(LIST_UNRESOLVED_WRONG_SQL).toContain('wq.user_id = $1');
    expect(REVIEW_CANDIDATES_SQL).toContain('ar.user_id = $1');
    expect(PLAN_FOR_USER_SQL).toContain('id = $1 AND user_id = $2');
    expect(UPSERT_WRONG_QUESTION_SQL).toContain('ON CONFLICT (user_id, question_id)');
    expect(DAILY_MASTERY_SERIES_SQL).toContain('ar.user_id = $1');
    expect(QUESTIONS_BY_SUBJECT_SQL).toContain('FROM edu.questions q');
    // W2.1c-1：identity/twin 收敛进来的语句同样带 entity 谓词
    expect(STUDENT_ROW_BY_USER_SQL).toContain('user_id = $1');
    expect(DAILY_ANSWER_AGGREGATE_SQL).toContain('user_id = $1');
  });
});
