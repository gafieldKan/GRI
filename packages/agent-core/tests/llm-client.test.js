import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LlmClient } from '../src/index.js';

const cfg = async () => ({ apiKey: '', model: 'm', multimodalModel: 'mm', baseUrl: 'http://x' });
const l = new LlmClient(cfg);

test('llm: isRealKey 判定 nvapi- 前缀', async () => {
  const noKey = new LlmClient(async () => ({ apiKey: '' }));
  assert.equal(await noKey.isRealKey('default'), false);
  const yesKey = new LlmClient(async () => ({ apiKey: 'nvapi-x' }));
  assert.equal(await yesKey.isRealKey('default'), true);
});

test('llm: parseJSON 三层降级', () => {
  assert.equal(l.parseJSON('{"a":1}').a, 1);
  assert.equal(l.parseJSON('前缀 {"b":2} 后缀').b, 2);
  assert.equal(l.parseJSON('不是 JSON'), null);
  assert.equal(l.parseJSON(null), null);
});

test('llm: validateAnswer 选择/填空/essay', () => {
  const choice = { type: 'choice', answer: 'B', explanation: '因为' };
  assert.equal(l.validateAnswer(choice, 'B').correct, true);
  assert.equal(l.validateAnswer(choice, '我选择：B').correct, true);
  assert.equal(l.validateAnswer(choice, 'A').correct, false);

  const fill = { type: 'fill', answer: '3' };
  assert.equal(l.validateAnswer(fill, '3.0').correct, true, '数值容差');
  assert.equal(l.validateAnswer(fill, '5').correct, false);

  const essay = { type: 'essay', answer: '' };
  assert.equal(l.validateAnswer(essay, '我的理解：…').valid, true);

  // text 分支 + 空题目分支（W2.4 覆盖搬迁：原 tuition llm.service.spec 覆盖过，随该类删除）
  const text = { type: 'text', answer: 'a的平方', explanation: 'ok' };
  assert.equal(l.validateAnswer(text, 'a的平方').correct, true);
  assert.equal(l.validateAnswer({ type: 'text', answer: 'x=2', explanation: '' }, '其他答案').correct, false);

  assert.equal(l.validateAnswer(null, 'A').valid, false); // 空题目 → 不合规
});

test('llm: extractNumber / normalizeText', () => {
  assert.equal(l.extractNumber('约 -42.5 分'), -42.5);
  assert.equal(l.extractNumber('无数字'), null);
  assert.equal(l.normalizeText(' 答案是 3 ，'), '答案是3');
});

// 以下两条为 W2.4 归一后的**覆盖搬迁**：原 tuition `llm.service.spec` 覆盖了 chat/多模态的网络行为，
// 该类已删、其实现即本客户端（ESM，api 侧 jest 无法直载）→ 覆盖就近落在本文件（真源实现）。

test('llm: chat POST 到兼容端点；content 空回落 reasoning_content；429 指数退避重试', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  try {
    let n = 0;
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      n++;
      if (n === 1) return { ok: false, status: 429, text: async () => 'rate limited' };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { reasoning_content: '先推理（无 content）' } }] }) };
    };
    const client = new LlmClient(async () => ({ apiKey: 'nvapi-x', model: 'm', baseUrl: 'http://x', multimodalModel: 'mm' }));
    const res = await client.chat([{ role: 'user', content: 'hi' }], 'default', { maxRetries: 2, baseDelayMs: 1 });
    assert.equal(res.content, '先推理（无 content）'); // content 空 → reasoning_content 兜底
    assert.equal(calls.length, 2); // 429 重试一次后成功
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer nvapi-x');
    assert.equal(JSON.parse(calls[0].init.body).model, 'm');
  } finally {
    globalThis.fetch = orig;
  }
});

test('llm: chatMultimodal 无 key → 抛 NO_LLM_KEY（调用方回退 mock，不静默）', async () => {
  const client = new LlmClient(async () => ({ apiKey: '', model: 'm', baseUrl: 'http://x', multimodalModel: 'mm' }));
  await assert.rejects(() => client.chatMultimodal('data:image/png;base64,AAA', '识别'), /NO_LLM_KEY/);
});