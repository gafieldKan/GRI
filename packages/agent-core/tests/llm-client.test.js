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
});

test('llm: extractNumber / normalizeText', () => {
  assert.equal(l.extractNumber('约 -42.5 分'), -42.5);
  assert.equal(l.extractNumber('无数字'), null);
  assert.equal(l.normalizeText(' 答案是 3 ，'), '答案是3');
});