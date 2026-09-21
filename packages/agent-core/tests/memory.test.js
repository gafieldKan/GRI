import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, storeFrom } from '../src/index.js';

function fakeStore() {
  const rows = []; // {entity_id, fact_key, value, strength, updated_at}
  return storeFrom(async (text, params = []) => {
    if (/SELECT value, strength, updated_at/.test(text)) {
      const r = rows.find((x) => x.entity_id === params[0] && x.fact_key === params[1]);
      return { rows: r ? [r] : [] };
    }
    if (/SELECT fact_key, value, strength, updated_at/.test(text)) {
      const mine = rows.filter((x) => x.entity_id === params[0]);
      mine.sort((a, b) => b.strength - a.strength);
      return { rows: mine.slice(0, params[1] || 50) };
    }
    if (/INSERT INTO agent\.memory/.test(text)) {
      const parsed = JSON.parse(params[2]);
      const exist = rows.find((x) => x.entity_id === params[0] && x.fact_key === params[1]);
      if (exist) {
        exist.value = parsed;
        exist.strength = Math.max(exist.strength, params[3]);
      } else {
        rows.push({ entity_id: params[0], fact_key: params[1], value: parsed, strength: params[3], updated_at: new Date() });
      }
      return { rows: [], rowCount: 1 };
    }
    if (/DELETE FROM agent\.memory/.test(text)) {
      const i = rows.findIndex((x) => x.entity_id === params[0] && x.fact_key === params[1]);
      if (i >= 0) rows.splice(i, 1);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

test('memory: 读/写/删/列出', async () => {
  const m = new MemoryStore(fakeStore());
  await m.set('studentA', 'fact.home', '农民家庭', 1);
  await m.set('studentA', 'mastery.kp1', { level: 80 }, 3);
  assert.equal(await m.get('studentA', 'fact.home'), '农民家庭');
  const list = await m.list('studentA');
  assert.equal(list.length, 2);
  assert.equal(list[0].key, 'mastery.kp1'); // strength 高在前
  await m.delete('studentA', 'fact.home');
  assert.equal(await m.get('studentA', 'fact.home'), null);
});

test('memory: get 往返返回解析后的对象(JSONB), 保持字段(状态机续课/基线依赖它)', async () => {
  const m = new MemoryStore(fakeStore());
  await m.set('studentA', 'lesson:kp-1', { stage: 'assess', kpId: 'kp-1', baseline: 55, lastQuestion: 'q-9' }, 1);
  const got = await m.get('studentA', 'lesson:kp-1');
  // 必须是对象(不是 JSON 串),字段逐一带回 —— lesson.current/submit 据此跨消息续课、回授掌握度
  assert.deepEqual(got, { stage: 'assess', kpId: 'kp-1', baseline: 55, lastQuestion: 'q-9' });
  assert.equal(got.baseline, 55);
});

test('memory: 按 entity 隔离，他人读不到', async () => {
  const m = new MemoryStore(fakeStore());
  await m.set('studentA', 'fact.private', 'A 的私有记忆', 5);
  assert.equal(await m.get('studentB', 'fact.private'), null, '他人 read 不得');
  assert.deepEqual(await m.list('studentB'), [], '他人 list 不得');
});

test('memory: 拒绝敏感 key', async () => {
  const m = new MemoryStore(fakeStore());
  await assert.rejects(() => m.set('a', 'token.key', 'x'), /敏感/);
  await assert.rejects(() => m.set('a', 'apiKey', 'x'), /敏感/);
});

test('memory: digest 拼进 prompt 串', async () => {
  const m = new MemoryStore(fakeStore());
  await m.set('studentA', 'pref.lang', 'zh', 4);
  await m.set('studentA', 'fact.home', '农民家庭', 2);
  const d = await m.digest('studentA');
  assert.ok(d.includes('pref.lang=zh'));
  assert.ok(d.includes('fact.home=农民家庭'));
});

test('memory: 空记忆 digest 为空串', async () => {
  const m = new MemoryStore(fakeStore());
  assert.equal(await m.digest('nobody'), '');
});