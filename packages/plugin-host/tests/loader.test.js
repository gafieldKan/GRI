import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { loadPlugins, PluginHost } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => join(here, 'fixtures', name);
test('loadPlugins: 扫目录 → 注册 → 同步装配，工具集合与诊断齐备', () => {
  const { host, tools, diagnostics } = loadPlugins({ dir: fx('plugins-ok') });
  assert.deepEqual(diagnostics.activated, ['good', 'second'], '按 kind 优先级 + 目录名序');
  assert.deepEqual(diagnostics.errors, []);
  assert.deepEqual(tools.map((t) => t.name), ['good.echo', 'second.ping']);
  // 非插件目录（无 plugin.json）不进 discovered，但**不被静默丢掉**：记入 ignored（非 error）
  assert.deepEqual(diagnostics.discovered.map((d) => d.dir), ['a-good', 'b-second']);
  assert.deepEqual(diagnostics.ignored.map((g) => g.dir), ['f-not-plugin']);
  assert.equal(diagnostics.ignored[0].code, 'PLUGIN_MANIFEST_MISSING');
  assert.equal(diagnostics.discovered[0].kind, 'agent.skill');
  assert.equal(host.isActive('good'), true);
  assert.deepEqual(host.resolve('demo.good').map((e) => e.manifest.id), ['good']);
});

test('loadPlugins: ESM 入口（默认 index.js）与 CJS 入口（自定义 index.cjs）都能载', async () => {
  const { tools } = loadPlugins({ dir: fx('plugins-ok') });
  const echo = tools.find((t) => t.name === 'good.echo'); // ESM default 导出
  const ping = tools.find((t) => t.name === 'second.ping'); // CJS module.exports
  assert.deepEqual(await echo.execute({}, { a: 1 }), { ok: true, args: { a: 1 } });
  assert.equal(await ping.execute({}, {}), 'pong');
});

test('loadPlugins: 坏插件不阻断启动（P5）—— 清单非法/入口爆炸各记一条，好插件照常', () => {
  const { tools, diagnostics } = loadPlugins({ dir: fx('plugins-broken') });
  assert.deepEqual(diagnostics.activated, ['good']); // g-good 照常装配
  assert.deepEqual(tools.map((t) => t.name), ['good.echo']);
  const byDir = Object.fromEntries(diagnostics.errors.map((e) => [e.dir, e]));
  assert.equal(byDir['c-bad-manifest'].code, 'UNKNOWN_KIND');
  assert.equal(byDir['d-bad-entry'].code, 'PLUGIN_LOAD_FAILED');
  assert.match(byDir['d-bad-entry'].message, /入口爆炸/);
});

test('loadPlugins: 工具撞名由宿主拒绝 —— 先到者留，冲突插件记诊断且无孤儿工具', () => {
  const { tools, diagnostics } = loadPlugins({ dir: fx('plugins-collide') });
  assert.deepEqual(diagnostics.activated, ['good']);
  assert.deepEqual(tools.map((t) => t.name), ['good.echo']);
  assert.equal(diagnostics.errors.length, 1);
  assert.equal(diagnostics.errors[0].id, 'collide');
  assert.match(diagnostics.errors[0].error, /撞名/);
});

test('loadPlugins: 目录缺失/未指定 → 记诊断、零工具，宿主仍可用（可再装）', () => {
  const miss = loadPlugins({ dir: fx('nope-not-here') });
  assert.equal(miss.diagnostics.errors[0].code, 'PLUGINS_DIR_MISSING');
  assert.deepEqual(miss.tools, []);
  // 宿主未被弄坏：还能继续注册装配
  miss.host.register({ id: 'later', kind: 'agent.skill' }, { tools: [{ name: 'later.t' }] });
  assert.deepEqual(miss.host.assembleSync().activated, ['later']);
  assert.deepEqual(miss.host.tools().map((t) => t.name), ['later.t']);

  const unset = loadPlugins({});
  assert.equal(unset.diagnostics.errors[0].code, 'PLUGINS_DIR_UNSET');
  assert.equal(unset.diagnostics.dir, null);
});

test('loadPlugins: 可复用传入的宿主，并透传 assemble 选项（requirePolicy 走同一 fail-closed）', () => {
  const host = new PluginHost();
  const r = loadPlugins({ dir: fx('plugins-ok'), host, assemble: { requirePolicy: true } });
  assert.equal(r.host, host);
  const policyErr = r.diagnostics.errors.find((e) => e.code === 'POLICY_REQUIRED');
  assert.ok(policyErr, '生产档缺 policy → 记 POLICY_REQUIRED（不是静默）');
  assert.deepEqual(r.diagnostics.activated, [], '前置校验 → 零激活（不半装配）');
  assert.deepEqual(host.diagnostics().active, []);
});

test('loadPlugins: 发现顺序确定性 —— 两次加载得到同一装配序列', () => {
  const a = loadPlugins({ dir: fx('plugins-ok') });
  const b = loadPlugins({ dir: fx('plugins-ok') });
  assert.deepEqual(a.diagnostics.activated, b.diagnostics.activated);
  assert.deepEqual(a.tools.map((t) => t.name), b.tools.map((t) => t.name));
});

test('loadPlugins: reservedTools 透传宿主 —— 撞宿主自有名的插件被拒并记诊断，他者照常（P5）', () => {
  const { tools, diagnostics } = loadPlugins({ dir: fx('plugins-ok'), reservedTools: ['good.echo'] });
  assert.deepEqual(diagnostics.activated, ['second'], 'a-good 撞宿主自有名 → 不入装配');
  assert.deepEqual(tools.map((t) => t.name), ['second.ping'], '被保护的宿主工具名没有被插件塞进来');
  const err = diagnostics.errors.find((e) => e.code === 'TOOL_NAME_RESERVED');
  assert.ok(err, '必须记 TOOL_NAME_RESERVED（不静默）');
  assert.equal(err.id, 'good');
});

test('loadPlugins: nameKey 透传宿主 —— 用清洗名顶替宿主自有工具同样被拒（等价键在多对一时才拦得住）', () => {
  const hyphen = (n) => String(n).replace(/[^a-zA-Z0-9_-]/g, '-');
  // 保留 `good-echo`（清洗名）：a-good 的 `good.echo` 清洗后同键 → 必须被拒
  const { tools, diagnostics } = loadPlugins({ dir: fx('plugins-ok'), reservedTools: ['good-echo'], nameKey: hyphen });
  assert.deepEqual(diagnostics.activated, ['second'], 'a-good 清洗名撞宿主 → 不入装配');
  assert.deepEqual(tools.map((t) => t.name), ['second.ping']);
  assert.equal(diagnostics.errors.find((e) => e.code === 'TOOL_NAME_RESERVED').id, 'good');
});

test('loadPlugins: entry 指向目录（含 "."）→ 拒绝（PLUGIN_ENTRY_NOT_FILE），不读其 package.json main', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-dir-'));
  try {
    // 目录外的「源码」：若不拦，entry:"." 会让 require 读 p/package.json 的 main 并加载它
    writeFileSync(join(tmp, 'evil.js'), 'module.exports = { tools: () => [{ name: "evil.tool" }] };');
    mkdirSync(join(tmp, 'p'));
    writeFileSync(join(tmp, 'p', 'plugin.json'), JSON.stringify({ id: 'p', kind: 'agent.skill', apiVersion: '1', entry: '.' }));
    writeFileSync(join(tmp, 'p', 'package.json'), JSON.stringify({ name: 'p', main: '../evil.js' }));
    const r = loadPlugins({ dir: tmp });
    assert.deepEqual(r.diagnostics.activated, [], '目录型 entry 的插件不得装配');
    assert.equal(r.diagnostics.errors[0].code, 'PLUGIN_ENTRY_NOT_FILE');
    assert.deepEqual(r.tools, [], '目录外的代码没有被加载（package.json main 绕过被堵死）');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 复用宿主 + 新键引入撞名 → 只记诊断（不抛），宿主**分毫未动**，已激活插件不重复装配', () => {
  const hyphen = (n) => String(n).replace(/[^a-zA-Z0-9_-]/g, '-');
  const first = loadPlugins({ dir: fx('plugins-ok') });
  assert.ok(first.tools.some((t) => t.name === 'good.echo'), '前提：首次以恒等键装载，good.echo 在表内');
  // 复用宿主 + 保留清洗名 `good-echo` + 传清洗键：新键下 `good.echo` 与保留名同键 → 改键必须被拒
  const again = loadPlugins({ dir: fx('plugins-ok'), host: first.host, reservedTools: ['good-echo'], nameKey: hyphen });
  assert.equal(again.host, first.host);
  assert.ok(
    again.diagnostics.errors.some((e) => e.code === 'TOOL_NAME_RESERVED'),
    '改键引入的撞名 → 记诊断（不是静默生效，也不是启动期崩溃）',
  );
  assert.deepEqual(again.diagnostics.activated, [], '复用宿主：配置失败 → 零激活');
  assert.deepEqual(again.diagnostics.discovered, [], '配置失败 → 不扫目录（fail-closed）');
  assert.equal(again.tools.filter((t) => t.name === 'good.echo').length, 1, '工具表不得因二次装载而重复');
  // 原子性：失败的改键**没有**把 `good-echo` 留在保留表上（否则下面的探针会被误拒）
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-atomic-'));
  try {
    mkdirSync(join(tmp, 'probe'));
    writeFileSync(join(tmp, 'probe', 'plugin.json'), JSON.stringify({ id: 'probe', kind: 'agent.skill', apiVersion: '1' }));
    writeFileSync(join(tmp, 'probe', 'index.js'), 'module.exports = { tools: () => [{ name: "good-echo" }] };');
    const r = loadPlugins({ dir: tmp, host: first.host });
    assert.deepEqual(r.diagnostics.activated, ['probe'], '保留表未被半改 —— 探针名照常装配');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 复用宿主 + 新键（不与已登记工具撞）→ 键确实生效，清洗名顶替照样被拒', () => {
  const hyphen = (n) => String(n).replace(/[^a-zA-Z0-9_-]/g, '-');
  const first = loadPlugins({ dir: fx('plugins-ok') }); // 已登记 good.echo / second.ping
  // 保留 `host-tool`（与已登记工具**不**撞）→ 改键成功
  const step = loadPlugins({ dir: fx('plugins-ok'), host: first.host, reservedTools: ['host-tool'], nameKey: hyphen });
  assert.ok(!step.diagnostics.errors.some((e) => e.code === 'TOOL_NAME_RESERVED'), '改键未引入撞名 → 不该有 TOOL_NAME_RESERVED 诊断');
  // 键真的换了：新插件提供 `host.tool` → 清洗后同键 `host-tool` → 必须被拒（复用不会让防线静默消失）
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-reuse-'));
  try {
    mkdirSync(join(tmp, 'hi'));
    writeFileSync(join(tmp, 'hi', 'plugin.json'), JSON.stringify({ id: 'hi', kind: 'agent.skill', apiVersion: '1' }));
    writeFileSync(join(tmp, 'hi', 'index.js'), 'module.exports = { tools: () => [{ name: "host.tool" }] };');
    const r = loadPlugins({ dir: tmp, host: first.host, reservedTools: ['host-tool'], nameKey: hyphen });
    assert.ok(
      r.diagnostics.errors.some((e) => e.code === 'TOOL_NAME_RESERVED'),
      '复用宿主上等价键同样拦得住清洗名顶替',
    );
    assert.deepEqual(r.diagnostics.activated, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 宿主配置失败 → **fail-closed**：目录里的插件一律不装载（防线未生效时绝不照装）', () => {
  const hyphen = (n) => String(n).replace(/[^a-zA-Z0-9_-]/g, '-');
  const host = new PluginHost();
  host.register({ id: 'seed', kind: 'agent.skill' }, { tools: [{ name: 'a.b' }] });
  host.assembleSync();
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-failclosed-'));
  try {
    mkdirSync(join(tmp, 'probe'));
    writeFileSync(join(tmp, 'probe', 'plugin.json'), JSON.stringify({ id: 'probe', kind: 'agent.skill', apiVersion: '1' }));
    writeFileSync(join(tmp, 'probe', 'index.js'), 'module.exports = { tools: () => [{ name: "a-b" }] };');
    // 调用方**明确**保留 `a-b` 并要清洗键；但宿主已有 `a.b`，换键会被拒（诊断）
    const r = loadPlugins({ dir: tmp, host, reservedTools: ['a-b'], nameKey: hyphen });
    assert.ok(r.diagnostics.errors.some((e) => e.code === 'TOOL_NAME_RESERVED'), '改键被拒 → 有诊断');
    assert.equal(r.diagnostics.dir, tmp, '复用宿主路径也要报出 dir（否则诊断里 dir:null，事后查无对证）');
    assert.deepEqual(r.diagnostics.discovered, [], '配置失败 → 连目录都不扫（fail-closed）');
    assert.deepEqual(r.diagnostics.activated, [], '零激活');
    assert.ok(!r.tools.some((t) => t.name === 'a-b'), '**防线未生效的插件绝不被装配**（否则 reservedTools/nameKey 等于摆设）');
    assert.ok(r.tools.some((t) => t.name === 'a.b'), '如实交出宿主当前状态（不假装空表）');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 顶层选项优先于 hostOptions 同名项（显式传参不被静默忽略）', () => {
  const r = loadPlugins({ dir: fx('plugins-ok'), hostOptions: { reservedTools: ['nothing-here'] }, reservedTools: ['good.echo'] });
  assert.deepEqual(r.diagnostics.activated, ['second'], '顶层 reservedTools 生效 → a-good 被拒、b-second 照常');
  assert.ok(r.diagnostics.errors.some((e) => e.code === 'TOOL_NAME_RESERVED'), '顶层保留名确实被应用');
});

test('loadPlugins: nameKey 非函数 → 只诊断（NAME_KEY_INVALID），不静默当恒等键、也不抛（P5）', () => {
  const r = loadPlugins({ dir: fx('plugins-ok'), nameKey: 'nope' });
  assert.equal(r.diagnostics.errors[0].code, 'NAME_KEY_INVALID');
  assert.deepEqual(r.diagnostics.activated, []);
  assert.equal(r.host, null, '配置非法 → 交出 null 宿主 + 诊断（不半建）');
  // 归一后的 dir 仍要报出：否则诊断里 dir:null，事后查无对证
  assert.ok(r.diagnostics.dir && r.diagnostics.dir.endsWith('plugins-ok'), `dir 应被归一报出，实得 ${r.diagnostics.dir}`);
});

test('loadPlugins: **falsy 非数组** reservedTools（0/""/false/NaN）→ 记 RESERVED_TOOLS_INVALID（不得当空表吞掉）', () => {
  for (const bad of [0, '', false, NaN]) {
    // 新建宿主路径
    const fresh = loadPlugins({ dir: fx('plugins-ok'), reservedTools: bad });
    assert.equal(fresh.diagnostics.errors[0].code, 'RESERVED_TOOLS_INVALID', `新建宿主 reservedTools=${String(bad)}`);
    assert.deepEqual(fresh.diagnostics.activated, []);
    // 复用宿主路径
    const host = new PluginHost();
    host.register({ id: 'seed', kind: 'agent.skill' }, { tools: [{ name: 'seed.t' }] });
    host.assembleSync();
    const r = loadPlugins({ dir: fx('plugins-ok'), host, reservedTools: bad });
    assert.equal(r.diagnostics.errors[0].code, 'RESERVED_TOOLS_INVALID', `复用宿主 reservedTools=${String(bad)}`);
    assert.deepEqual(r.diagnostics.activated, [], '配置失败 → fail-closed（不装配）');
  }
});

test('loadPlugins: host 不是宿主（含 falsy 非空值与病灶对象）→ 记 INVALID_HOST，绝不 TypeError（P5）', () => {
  for (const bad of ['nope', {}, 42, true, [], 0, false, '']) {
    const r = loadPlugins({ dir: fx('plugins-ok'), host: bad });
    assert.equal(r.diagnostics.errors[0].code, 'INVALID_HOST', `host=${JSON.stringify(bad)}`);
    assert.equal(r.host, null, '误传宿主 → 交 null（退回它会 TypeError）');
    assert.deepEqual(r.tools, []);
  }
  // 病灶宿主：属性访问抛错 / 方法抛错 —— 判定与读表都不得把异常漏出去
  const evil = [
    [new Proxy({}, { get() { throw new TypeError('nope'); } }), 'INVALID_HOST'],
    [{ get tools() { throw new TypeError('boom-getter'); } }, 'INVALID_HOST'],
    // 五个方法齐全但 register 返回垃圾：**算可用宿主**（判定只看形状），其失败降级为逐插件诊断
    [{ tools() { return []; }, register() { return undefined; }, assembleSync: () => ({ activated: [], errors: [] }), reserveTools() { return this; }, setNameKey() { return this; } }, 'PLUGIN_LOAD_FAILED'],
  ];
  for (const [h, code] of evil) {
    let r = null;
    assert.doesNotThrow(() => { r = loadPlugins({ dir: fx('plugins-ok'), host: h }); }, '病灶宿主不得让启动崩（P5）');
    assert.equal(r.diagnostics.errors[0].code, code);
    assert.deepEqual(r.tools, []);
  }
  // 真正的宿主照常（不误伤）
  assert.deepEqual(loadPlugins({ dir: fx('plugins-ok'), host: new PluginHost() }).diagnostics.errors, []);
});

test('loadPlugins: 病灶宿主 tools() 抛错 → 交空表不崩（safeTools 的两个调用点都要护住）', () => {
  const host = {
    tools() { throw new TypeError('boom-tools'); },
    register() { return { id: 'x' }; },
    assembleSync: () => ({ activated: [], errors: [] }),
    reserveTools() { return this; },
    setNameKey() { return this; },
  };
  // 走 finish 的那条（正常目录）+ 走 fail-closed 早退的那条（复用宿主配置失败）
  for (const opts of [{ dir: fx('plugins-ok'), host }, { dir: fx('plugins-ok'), host, reservedTools: 0 }]) {
    let r = null;
    assert.doesNotThrow(() => { r = loadPlugins(opts); }, 'tools() 抛错不得穿出（P5）');
    assert.deepEqual(r.tools, [], '交空表（不是异常，也不是非数组）');
  }
});

test('loadPlugins: 可用宿主的判定清单被钉住 —— 缺任一方法都算 INVALID_HOST（文案说五项就得真查五项）', () => {
  const base = {
    tools: () => [],
    register() { return { id: 'x' }; },
    assembleSync: () => ({ activated: [], errors: [] }),
    reserveTools() { return this; },
    setNameKey() { return this; },
  };
  for (const missing of ['tools', 'register', 'assembleSync', 'reserveTools', 'setNameKey']) {
    const host = { ...base };
    delete host[missing];
    const r = loadPlugins({ dir: fx('plugins-ok'), host });
    assert.equal(r.diagnostics.errors[0].code, 'INVALID_HOST', `缺 ${missing} → INVALID_HOST`);
    assert.equal(r.host, null);
    assert.deepEqual(r.tools, []);
  }
  assert.deepEqual(loadPlugins({ dir: fx('plugins-ok'), host: { ...base } }).diagnostics.errors, [], '五项齐全 → 不误伤');
});

test('loadPlugins: 抛出的值**自身带抛错 getter**（Proxy 错误）→ 诊断构造不得二次抛（P5）', () => {
  const evilErr = () => new Proxy({}, { get() { throw new Error('escaped!'); } });
  const ok = {
    tools: () => [],
    register() { return { id: 'x' }; },
    assembleSync: () => ({ activated: [], errors: [] }),
    reserveTools() { return this; },
    setNameKey() { return this; },
  };
  // 三个 catch 各来一发：诊断是在 catch 块里造的，若读 e.code/e.message 时不设防，异常就穿出去
  const cases = [
    ['safeHostFrom', { dir: fx('plugins-ok'), host: { ...ok, setNameKey() { throw evilErr(); } }, nameKey: (n) => n }, 'PLUGIN_HOST_INIT_FAILED'],
    ['逐插件', { dir: fx('plugins-ok'), host: { ...ok, register() { throw evilErr(); } } }, 'PLUGIN_LOAD_FAILED'],
    ['finish', { dir: fx('plugins-ok'), host: { ...ok, assembleSync() { throw evilErr(); } } }, 'ASSEMBLE_FAILED'],
  ];
  for (const [label, opts, code] of cases) {
    let r = null;
    assert.doesNotThrow(() => { r = loadPlugins(opts); }, `${label}：异常不得穿出 loadPlugins（P5）`);
    assert.equal(r.diagnostics.errors[0].code, code, `${label}：落到缺省码（抛错 getter 读不出 code）`);
    assert.equal(typeof r.diagnostics.errors[0].message, 'string', `${label}：仍要有可读 message（不静默）`);
  }
});

test('loadPlugins: 相对路径目录可用（createRequire 只收绝对路径 —— 不归一就是启动期崩溃，违 P5）', () => {
  const rel = relative(process.cwd(), fx('plugins-ok'));
  assert.ok(!rel.startsWith('/'), '前提：本用例传的确实是相对路径');
  const abs = loadPlugins({ dir: fx('plugins-ok') });
  const got = loadPlugins({ dir: rel });
  assert.deepEqual(got.diagnostics.activated, abs.diagnostics.activated);
  assert.deepEqual(got.tools.map((t) => t.name), abs.tools.map((t) => t.name));
  assert.ok(got.diagnostics.dir.startsWith('/'), 'diagnostics.dir 报绝对路径（归一后）');
  // 相对路径不存在时同理：只记诊断，不抛
  const miss = loadPlugins({ dir: 'no/such/plugins-dir' });
  assert.equal(miss.diagnostics.errors[0].code, 'PLUGINS_DIR_MISSING');
});

test('loadPlugins: dir 非字符串 → 只诊断（PLUGINS_DIR_INVALID），不抛（归一不得成为新崩溃点）', () => {
  for (const bad of [123, {}, [], true]) {
    const r = loadPlugins({ dir: bad });
    assert.equal(r.diagnostics.errors[0].code, 'PLUGINS_DIR_INVALID', `dir=${JSON.stringify(bad)}`);
    assert.deepEqual(r.diagnostics.activated, []);
  }
});

test(
  'loadPlugins: 插件目录不可读（EACCES）→ 记 PLUGINS_DIR_UNREADABLE，不崩（P5）',
  // root 无视文件权限位，非 root 才复现
  { skip: typeof process.getuid === 'function' && process.getuid() === 0 },
  () => {
    const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-eacces-'));
    const locked = join(tmp, 'locked');
    try {
      mkdirSync(locked);
      chmodSync(locked, 0o000);
      let r = null;
      assert.doesNotThrow(() => {
        r = loadPlugins({ dir: locked });
      }, '目录无读权限不得让宿主启动崩（P5）');
      assert.equal(r.diagnostics.errors[0].code, 'PLUGINS_DIR_UNREADABLE');
      assert.equal(r.diagnostics.dir, locked, '仍要报出是哪个目录');
      assert.deepEqual(r.tools, [], '零插件装配');
      assert.deepEqual(r.diagnostics.activated, []);
    } finally {
      chmodSync(locked, 0o755);
      rmSync(tmp, { recursive: true, force: true });
    }
  },
);

test('loadPlugins: entry 越出插件目录 → 拒绝该插件（PLUGIN_ENTRY_ESCAPE），不加载外部代码', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-escape-'));
  try {
    // 插件目录外的「源码」
    writeFileSync(join(tmp, 'outside.js'), 'module.exports = { tools: () => [{ name: "outside.t" }] };');
    mkdirSync(join(tmp, 'evil'));
    writeFileSync(join(tmp, 'evil', 'plugin.json'), JSON.stringify({ id: 'evil', kind: 'agent.skill', apiVersion: '1', entry: '../outside.js' }));
    const r = loadPlugins({ dir: tmp });
    assert.deepEqual(r.diagnostics.activated, [], '越界入口的插件不得装配');
    assert.equal(r.diagnostics.errors[0].code, 'PLUGIN_ENTRY_ESCAPE');
    assert.deepEqual(r.tools, [], '外部代码的工具没有被加载');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
