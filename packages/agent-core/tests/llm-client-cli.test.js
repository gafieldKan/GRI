import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LlmClient } from '../src/index.js';

/**
 * B-3b：LlmClient 的 provider='cli' 分支（「换脑子」接入点）。
 * 覆盖：cli 路由走 CliBackendRegistry（不发 HTTP）、isRealKey 视为真、
 * 失败（抛错 / timedOut / 空文本 / 未注入 registry）一律明确上抛（不得静默返回空）。
 */

/** cli 路由的 resolveConfig 桩：provider='cli' + cliBackend=backend id。 */
const cliCfg = (backend = 'claude-code') => async () => ({
  provider: 'cli',
  cliBackend: backend,
  model: backend,
  apiKey: '',
  baseUrl: 'http://should-not-be-called',
});

/** 桩 registry：记下 run 调用，回注结果（函数则按入参产出）。 */
function stubRegistry(result) {
  const calls = [];
  return {
    calls,
    async run(id, opts) {
      calls.push({ id, opts });
      return typeof result === 'function' ? result(id, opts) : result;
    },
  };
}

/** 临时接管 global.fetch，返回 { restore, hits }；用于断言「未发 HTTP」。 */
function spyFetch() {
  const orig = globalThis.fetch;
  const hits = [];
  globalThis.fetch = async (...args) => {
    hits.push(args);
    throw new Error('unexpected fetch（cli 路由不该发 HTTP）');
  };
  return { hits, restore: () => { globalThis.fetch = orig; } };
}

test('llm-cli: cli 路由走 stub registry → content=text，未发 HTTP', async () => {
  const spy = spyFetch();
  try {
    const reg = stubRegistry({ text: 'OK', error: null, timedOut: false });
    const llm = new LlmClient(cliCfg('claude-code'), reg);
    const out = await llm.chat(
      [{ role: 'system', content: 'sys' }, { role: 'user', content: '你好' }],
      'entity=abc',
      { tools: [{ type: 'function', function: { name: 'x' } }] },
    );
    assert.equal(out.content, 'OK');
    assert.equal(out.usage, null);
    assert.equal(out.toolCalls, null);
    assert.equal(spy.hits.length, 0, 'cli 路由不得发 HTTP');
    // 后端 id 与 prompt（默认取本轮 user message）都对
    assert.equal(reg.calls[0].id, 'claude-code');
    assert.equal(reg.calls[0].opts.prompt, '你好');
  } finally {
    spy.restore();
  }
});

test('llm-cli: isRealKey 对 cli 路由视为真（不落 mock）', async () => {
  const llm = new LlmClient(cliCfg('codex'), stubRegistry({ text: 'x' }));
  assert.equal(await llm.isRealKey('entity=abc'), true);
});

test('llm-cli: registry.run 抛错 → chat 明确上抛（不静默返回空）', async () => {
  const spy = spyFetch();
  try {
    const reg = stubRegistry(() => { throw new Error('boom'); });
    const llm = new LlmClient(cliCfg(), reg);
    await assert.rejects(
      () => llm.chat([{ role: 'user', content: 'q' }], 'default'),
      /boom/,
    );
  } finally {
    spy.restore();
  }
});

test('llm-cli: timedOut / error → chat 明确上抛', async () => {
  const spy = spyFetch();
  try {
    const timedOut = new LlmClient(cliCfg(), stubRegistry({ text: '', timedOut: true, error: '超时（>1ms）已杀进程组' }));
    await assert.rejects(
      () => timedOut.chat([{ role: 'user', content: 'q' }], 'default'),
      /CLI 后端 'claude-code' 调用失败/,
    );
    const errored = new LlmClient(cliCfg(), stubRegistry({ text: '', error: '前置未就绪', timedOut: false }));
    await assert.rejects(
      () => errored.chat([{ role: 'user', content: 'q' }], 'default'),
      /前置未就绪/,
    );
  } finally {
    spy.restore();
  }
});

test('llm-cli: 正常退出但空文本 → 明确上抛（不得静默返回空）', async () => {
  const spy = spyFetch();
  try {
    const llm = new LlmClient(cliCfg(), stubRegistry({ text: '   ', error: null, timedOut: false }));
    await assert.rejects(
      () => llm.chat([{ role: 'user', content: 'q' }], 'default'),
      /空文本/,
    );
  } finally {
    spy.restore();
  }
});

test('llm-cli: 未注入 registry → 明确抛错（不静默降级）', async () => {
  const llm = new LlmClient(cliCfg('hermes')); // 第二参缺省 → null
  await assert.rejects(
    () => llm.chat([{ role: 'user', content: 'q' }], 'default'),
    /未注入 CliBackendRegistry/,
  );
});
