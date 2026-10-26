import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

test('loadPlugins: 插件声明 skill（SKILL.md）→ 正文随 skills 交出（宿主自行并入 prompt）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-skill-'));
  try {
    mkdirSync(join(tmp, 'tea'));
    writeFileSync(
      join(tmp, 'tea', 'plugin.json'),
      JSON.stringify({ id: 'tea', kind: 'agent.skill', apiVersion: '1', skill: './SKILL.md' }),
    );
    writeFileSync(join(tmp, 'tea', 'SKILL.md'), '---\nname: tea\ndescription: 沏茶\n---\n\n先温杯，再投茶。\n');
    const r = loadPlugins({ dir: tmp });
    assert.deepEqual(r.diagnostics.errors, []);
    assert.deepEqual(r.diagnostics.activated, ['tea']);
    assert.equal(r.skills.length, 1);
    assert.equal(r.skills[0].id, 'tea');
    assert.equal(r.skills[0].dir, 'tea');
    assert.match(r.skills[0].markdown, /先温杯，再投茶。/);
    assert.ok(r.skills[0].path.endsWith('SKILL.md'), '报出正文来源路径（事后可查）');
    assert.equal(r.diagnostics.discovered[0].entry, null, '纯内容插件（无 index.js）合法：无实现，entry 报 null');
    // 没写 skill 的插件不贡献技能（memory 插件即此形态）
    assert.deepEqual(loadPlugins({ dir: fx('plugins-ok') }).skills, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 声明的 skill 读不出来 → **拒绝该插件**（不是静默少一段正文）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-skill-bad-'));
  try {
    writeFileSync(join(tmp, 'outside.md'), '---\nname: stolen\n---\n外部正文');
    const mk = (id, skill) => {
      mkdirSync(join(tmp, id));
      writeFileSync(join(tmp, id, 'plugin.json'), JSON.stringify({ id, kind: 'agent.skill', apiVersion: '1', skill }));
      writeFileSync(join(tmp, id, 'index.js'), 'module.exports = { tools: () => [] };');
    };
    mk('a-escape', '../outside.md'); // 目录监狱
    mk('b-missing', './NOPE.md'); // 声明了却不存在
    mk('c-dir', './.'); // 指向目录
    const r = loadPlugins({ dir: tmp });
    assert.deepEqual(r.diagnostics.activated, [], '三例都不装配');
    assert.deepEqual(r.skills, [], '外部正文没有被读进来');
    const byDir = Object.fromEntries(r.diagnostics.errors.map((e) => [e.dir, e.code]));
    assert.equal(byDir['a-escape'], 'PLUGIN_SKILL_ESCAPE');
    assert.equal(byDir['b-missing'], 'PLUGIN_SKILL_MISSING');
    assert.equal(byDir['c-dir'], 'PLUGIN_SKILL_NOT_FILE');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 显式声明 entry 却不存在 → PLUGIN_ENTRY_MISSING（与「没声明、也没有缺省入口」区分开）', () => {
  const declared = mkdtempSync(join(tmpdir(), 'gri-ph-entry-miss-'));
  const implicit = mkdtempSync(join(tmpdir(), 'gri-ph-entry-none-'));
  try {
    mkdirSync(join(declared, 'p'));
    writeFileSync(join(declared, 'p', 'plugin.json'), JSON.stringify({ id: 'p', kind: 'agent.skill', apiVersion: '1', entry: './nope.js' }));
    const r = loadPlugins({ dir: declared });
    assert.deepEqual(r.diagnostics.activated, []);
    assert.equal(r.diagnostics.errors[0].code, 'PLUGIN_ENTRY_MISSING', '声明了却没有 → 响亮报错，不静默降级成无实现');

    // 对照：同样没有入口文件、但**没声明** entry → 纯内容插件，照常装配
    mkdirSync(join(implicit, 'q'));
    writeFileSync(join(implicit, 'q', 'plugin.json'), JSON.stringify({ id: 'q', kind: 'agent.skill', apiVersion: '1' }));
    const r2 = loadPlugins({ dir: implicit });
    assert.deepEqual(r2.diagnostics.errors, []);
    assert.deepEqual(r2.diagnostics.activated, ['q']);
  } finally {
    rmSync(declared, { recursive: true, force: true });
    rmSync(implicit, { recursive: true, force: true });
  }
});

// ── 以下是「独立复验」第二轮补的用例：每一例都对应一个**能存活于旧测试**的变异体 ──

test('loadPlugins: **符号链接越狱** —— skill/entry 指向目录外的链接一律拒（字符串前缀判不出链接）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-symlink-'));
  try {
    // 目录外的真身：正文与代码都**不该**被读到
    writeFileSync(join(tmp, 'secret.md'), '---\nname: stolen\n---\nSECRET-CONTENT');
    writeFileSync(join(tmp, 'outside.js'), 'module.exports = { tools: () => [{ name: "stolen.t" }] };');
    for (const id of ['a', 'b']) {
      mkdirSync(join(tmp, id));
      writeFileSync(join(tmp, id, 'plugin.json'), JSON.stringify({ id, kind: 'agent.skill', apiVersion: '1', skill: './link.md' }));
      symlinkSync(join(tmp, 'secret.md'), join(tmp, id, 'link.md'), 'file');
    }
    mkdirSync(join(tmp, 'c'));
    writeFileSync(join(tmp, 'c', 'plugin.json'), JSON.stringify({ id: 'c', kind: 'agent.skill', apiVersion: '1', entry: './link.js' }));
    symlinkSync(join(tmp, 'outside.js'), join(tmp, 'c', 'link.js'), 'file');

    const r = loadPlugins({ dir: tmp });
    // **只判字符串前缀是抓不住符号链接的**：本用例存在的意义就是钉住 realpath 那一层
    assert.deepEqual(r.skills, [], '目录外正文一个字都没被读进来');
    assert.deepEqual(r.tools, [], '目录外代码没有被加载');
    assert.deepEqual(r.diagnostics.activated, [], '三个插件都不装配');
    const byDir = Object.fromEntries(r.diagnostics.errors.map((e) => [e.dir, e.code]));
    assert.equal(byDir['a'], 'PLUGIN_SKILL_ESCAPE');
    assert.equal(byDir['b'], 'PLUGIN_SKILL_ESCAPE');
    assert.equal(byDir['c'], 'PLUGIN_ENTRY_ESCAPE');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 目录内**以点开头的合法文件**（`..weird.md`）不被误判为越界', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-dotfile-'));
  try {
    mkdirSync(join(tmp, 'p'));
    writeFileSync(join(tmp, 'p', 'plugin.json'), JSON.stringify({ id: 'p', kind: 'agent.skill', apiVersion: '1', skill: './..weird.md' }));
    writeFileSync(join(tmp, 'p', '..weird.md'), '---\nname: p\n---\n正文');
    const r = loadPlugins({ dir: tmp });
    // `rel.startsWith('..')` 会把**目录内**的 `..weird.md` 当成越界 —— 必须按 `../` 整段比
    assert.deepEqual(r.diagnostics.errors, []);
    assert.deepEqual(r.diagnostics.activated, ['p']);
    assert.equal(r.skills.length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 清单是**符号链接**指向目录外 → 拒绝（清单也不得把读取指到目录之外）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-mfsym-'));
  try {
    writeFileSync(join(tmp, 'outside.json'), JSON.stringify({ id: 'outsider', kind: 'agent.skill', apiVersion: '1' }));
    mkdirSync(join(tmp, 'p'));
    symlinkSync(join(tmp, 'outside.json'), join(tmp, 'p', 'plugin.json'), 'file');
    const r = loadPlugins({ dir: tmp });
    assert.deepEqual(r.diagnostics.activated, [], '目录外清单不得被采纳');
    assert.equal(r.diagnostics.errors[0].code, 'PLUGIN_MANIFEST_ESCAPE');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: **命名管道（FIFO）** → 拒该插件并诊断，绝不在启动期挂死（readFileSync 会永久阻塞）', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-fifo-'));
  const mkfifo = (p) => {
    try {
      execFileSync('mkfifo', [p]);
      return true;
    } catch {
      return false;
    }
  };
  try {
    mkdirSync(join(tmp, 'a'));
    if (!mkfifo(join(tmp, 'a', 'plugin.json'))) {
      t.skip('本机无 mkfifo，跳过 FIFO 用例');
      return;
    }
    mkdirSync(join(tmp, 'b'));
    writeFileSync(join(tmp, 'b', 'plugin.json'), JSON.stringify({ id: 'b', kind: 'agent.skill', apiVersion: '1', skill: './SKILL.md' }));
    mkfifo(join(tmp, 'b', 'SKILL.md'));
    mkdirSync(join(tmp, 'c'));
    writeFileSync(join(tmp, 'c', 'plugin.json'), JSON.stringify({ id: 'c', kind: 'agent.skill', apiVersion: '1', entry: './index.js' }));
    mkfifo(join(tmp, 'c', 'index.js'));

    // 本用例要证的是**活性**（不挂死），而挂死是**同步阻塞**：同进程内 node:test 的超时定时器
    // 也一起被阻塞、根本不会触发 —— 所以只能在**子进程**里跑，用进程级窗口把它抓成一次失败。
    // （否则回归时 CI 不是红，而是永远不返回：最差的失败模式。）
    const script = `
      const m = await import(process.env.PH_ENTRY);
      const r = m.loadPlugins({ dir: process.env.PH_DIR });
      console.log(JSON.stringify({
        activated: r.diagnostics.activated,
        byDir: Object.fromEntries(r.diagnostics.errors.map((e) => [e.dir, e.code])),
        skills: r.skills.length,
        tools: r.tools.length,
      }));
    `;
    let out;
    try {
      out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, PH_DIR: tmp, PH_ENTRY: join(here, '..', 'src', 'index.js') },
      });
    } catch (e) {
      if (e.code === 'ETIMEDOUT' || e.signal) {
        assert.fail('loadPlugins 在 FIFO 上**挂死**了（活性被破坏：readFileSync 阻塞在命名管道上）');
      }
      throw e;
    }
    const got = JSON.parse(out.trim().split('\n').pop());
    assert.equal(got.byDir.a, 'PLUGIN_MANIFEST_NOT_FILE');
    assert.equal(got.byDir.b, 'PLUGIN_SKILL_NOT_FILE');
    assert.equal(got.byDir.c, 'PLUGIN_ENTRY_NOT_FILE');
    assert.deepEqual(got.activated, []);
    assert.equal(got.skills, 0, 'FIFO 的正文没有被读（也读不出）');
    assert.equal(got.tools, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 入口**存在且加载成功但导出 falsy**（0/null/false/""/undefined）→ 不是 PLUGIN_ENTRY_MISSING', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-falsy-'));
  try {
    for (const [id, src] of [
      ['z', 'module.exports = 0;'],
      ['n', 'module.exports = null;'],
      ['f', 'module.exports = false;'],
      // `''` 与 `undefined` 与前三者同类：**文件在、require 成功**，只是导出不是对象。
      // `module.exports = undefined` 会让 require 拿到 undefined（不是「文件缺失」的 MODULE_NOT_FOUND）。
      ['e', "module.exports = '';"],
      ['u', 'module.exports = undefined;'],
    ]) {
      mkdirSync(join(tmp, id));
      writeFileSync(join(tmp, id, 'plugin.json'), JSON.stringify({ id, kind: 'agent.skill', apiVersion: '1', entry: './index.js' }));
      writeFileSync(join(tmp, id, 'index.js'), src);
    }
    const r = loadPlugins({ dir: tmp });
    // 「入口在不在」与「入口导出什么」是两码事：文件明明在、也 require 成功了，
    // 报「声明的 entry 不存在」会把排查方向指错。
    assert.deepEqual(r.diagnostics.errors, []);
    assert.deepEqual(r.diagnostics.activated.sort(), ['e', 'f', 'n', 'u', 'z']);
    assert.equal(r.diagnostics.discovered.find((d) => d.id === 'z').entry.endsWith('index.js'), true, 'entry 如实报出路径');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: SKILL.md 首个字节是 BOM → 装载器剥掉（否则下游 `^---` 锚定的解析整条失配）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-bom-'));
  try {
    mkdirSync(join(tmp, 'p'));
    writeFileSync(join(tmp, 'p', 'plugin.json'), JSON.stringify({ id: 'p', kind: 'agent.skill', apiVersion: '1', skill: './SKILL.md' }));
    writeFileSync(join(tmp, 'p', 'SKILL.md'), '\uFEFF---\nname: p\ndescription: d\n---\n正文\n', 'utf8');
    const r = loadPlugins({ dir: tmp });
    assert.deepEqual(r.diagnostics.errors, []);
    assert.equal(r.skills.length, 1);
    assert.equal(r.skills[0].markdown.charCodeAt(0), 45, '首字符已是 `-`（frontmatter 锚点可匹配）');
    assert.ok(!r.skills[0].markdown.includes('\uFEFF'), 'BOM 不在正文里');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: entry/skill 写了却**类型不对** → PLUGIN_*_INVALID（不静默当「没写」，也不抛 Node 内部码）', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-badtype-'));
  try {
    mkdirSync(join(tmp, 'a'));
    writeFileSync(join(tmp, 'a', 'plugin.json'), JSON.stringify({ id: 'a', kind: 'agent.skill', apiVersion: '1', entry: 5 }));
    mkdirSync(join(tmp, 'b'));
    writeFileSync(join(tmp, 'b', 'plugin.json'), JSON.stringify({ id: 'b', kind: 'agent.skill', apiVersion: '1', skill: {} }));
    const r = loadPlugins({ dir: tmp });
    const byDir = Object.fromEntries(r.diagnostics.errors.map((e) => [e.dir, e.code]));
    assert.equal(byDir['a'], 'PLUGIN_ENTRY_INVALID');
    assert.equal(byDir['b'], 'PLUGIN_SKILL_INVALID');
    assert.deepEqual(r.diagnostics.activated, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: 工具被拒（撞宿主保留名）的插件**连技能正文一起丢** —— 不留下「指令还在、工具没了」的错位', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-rejected-skill-'));
  try {
    mkdirSync(join(tmp, 'hybrid'));
    writeFileSync(
      join(tmp, 'hybrid', 'plugin.json'),
      JSON.stringify({ id: 'hybrid', kind: 'agent.skill', apiVersion: '1', skill: './SKILL.md', entry: './index.js' }),
    );
    writeFileSync(join(tmp, 'hybrid', 'SKILL.md'), '---\nname: hybrid\n---\n请用 host.taken 工具做事。');
    writeFileSync(join(tmp, 'hybrid', 'index.js'), 'module.exports = { tools: () => [{ name: "host.taken" }] };');
    const r = loadPlugins({ dir: tmp, reservedTools: ['host.taken'] });
    const reservedErr = r.diagnostics.errors.find((e) => e.code === 'TOOL_NAME_RESERVED');
    assert.ok(reservedErr, '撞保留名 → 该插件被拒（TOOL_NAME_RESERVED）');
    // **钉住 finish() 的 `dir` 回填**：装配期错误由**宿主**产出，只带 `id`/`kind`/`error`/`code`、
    // **不带 dir**（host.js:304）。若回填被去掉，运维就只能拿 id 去猜目录名 —— 本断言令该回归变红。
    assert.equal(reservedErr.dir, 'hybrid', '装配期错误须按 id 回填出目录名');
    assert.deepEqual(r.diagnostics.activated, [], '撞名插件不装配');
    // 正文与工具**同进退**：否则模型会读到「用 host.taken」的指令，而该工具刚被丢弃
    assert.deepEqual(r.skills, [], '被拒插件的正文不得交出');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: assemble.skipKinds 跳过的插件**也不交出正文** —— 没被装配的东西不该进 prompt', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-skip-skill-'));
  try {
    mkdirSync(join(tmp, 's'));
    writeFileSync(join(tmp, 's', 'plugin.json'), JSON.stringify({ id: 's', kind: 'agent.skill', apiVersion: '1', skill: './SKILL.md' }));
    writeFileSync(join(tmp, 's', 'SKILL.md'), '---\nname: s\n---\n这段指令不该在未装配时进提示词。');
    // 跳过整个 `agent.skill` 类：插件没被装配 → 它的正文一并丢（与「装配期被拒」同一判据的推论）。
    const r = loadPlugins({ dir: tmp, assemble: { skipKinds: ['agent.skill'] } });
    assert.deepEqual(r.diagnostics.errors, []);
    assert.deepEqual(r.diagnostics.activated, [], '被跳过的插件不激活');
    assert.deepEqual(r.skills, [], '未装配的正文不得交出');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadPlugins: assembleSync **整体抛错** → ASSEMBLE_FAILED 且零激活 ⇒ 所有正文都不交出', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gri-ph-assemble-throw-'));
  try {
    mkdirSync(join(tmp, 's'));
    writeFileSync(join(tmp, 's', 'plugin.json'), JSON.stringify({ id: 's', kind: 'agent.skill', apiVersion: '1', skill: './SKILL.md' }));
    writeFileSync(join(tmp, 's', 'SKILL.md'), '---\nname: s\n---\n装配整体失败时，这段指令不该进 prompt。');
    // 宿主：register 如实回清单（使 discovered/skills 记到 id `s`），assembleSync 直接抛。
    const host = {
      tools: () => [],
      register: (raw) => raw,
      assembleSync() {
        throw new Error('boom');
      },
      reserveTools() {
        return this;
      },
      setNameKey() {
        return this;
      },
    };
    const r = loadPlugins({ dir: tmp, host });
    // 「正文与工具同进退」的边界推论：装配整体失败 → 零激活 → **全部**正文落空（无一被装配）。
    // 这条判据写在 finish()/README，故须有用例钉住，免得日后被当成 bug 改回去。
    assert.equal(r.diagnostics.errors.some((e) => e.code === 'ASSEMBLE_FAILED'), true);
    assert.deepEqual(r.diagnostics.activated, [], '整体抛错 → 零激活');
    assert.deepEqual(r.skills, [], '装配整体失败 → 所有正文都不交出');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

