import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseManifest, CapabilityRegistry } from '../src/index.js';

/**
 * P-1：`world-art` 显性化为 `world.scene` 插件（**画法零改动** —— 只补清单 + 接能力注册表）。
 * 本测试锁定该清单对 `@gri/plugin-host` 的 schema 基线（`parseManifest`）合法，且注册表中解析为
 * `world.scene` 提供者。清单与实现（`packages/world-art/src/art.js`）同目录、随件走。
 */
const manifestPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'world-art', 'plugin.json');

test('P-1: packages/world-art/plugin.json 是合法 world.scene 插件清单', () => {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const m = parseManifest(raw);
  assert.equal(m.id, 'world-art');
  assert.equal(m.kind, 'world.scene');
  assert.equal(m.apiVersion, '1');
  assert.deepEqual(m.provides, ['world.scene']);
  assert.equal(m.trust.boundary, 'in-process');
  assert.equal(m.trust.network, false);
});

test('P-1: 该插件在能力注册表中解析为 world.scene 提供者', () => {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const reg = new CapabilityRegistry();
  reg.add(parseManifest(raw));
  assert.deepEqual(reg.capabilityIndex()['world.scene'], ['world-art']);
});
