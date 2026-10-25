/**
 * `@gri/plugin-host` 的 jest 测试替身（手动 mock，对本目录下所有 spec 自动生效）。
 *
 * 为什么需要：`@gri/plugin-host` 是 ESM（`type: module`），jest 的 CJS 模块注册表不解析
 * node_modules 里的 `export` 语法 —— 与 `@gri/agent-core` 同因（见各 agent spec 的 `jest.mock`）。
 *
 * 替身**只覆盖 api 真正消费的那一面**：`loadPlugins`（api 只 import 这一个符号）。
 * PluginHost / 能力注册表 / 撞名拒绝 / policy fail-closed 等语义的正确性由
 * `packages/plugin-host` 的 `node --test` 套件覆盖，不在此重复。
 *
 * 替身**不豁免失败**：目录缺失 / 未指定 / 非字符串 dir / 坏清单（含非法 id） / 坏入口（越界、指向目录） /
 * 工具撞名，一律记入 `diagnostics.errors`（与真件同 code），使 api 侧仍能断言「缺插件给诊断（不静默）」。
 *
 * 已知的**有意简化**（真件行为更严，但 api 侧不触）：
 * 1. 装配顺序按目录名而非 kind 优先级；
 * 2. 不做 realpath 层的符号链接越界判定；
 * 3. 不跑插件的 `tools` 工厂抛错路径 / `install`/`activate` 生命周期（真件装配期会跑）；
 * 4. `opts.assemble`（`requirePolicy` / `skipKinds`）与 `manifestFile` / `entryFile` 未模拟
 *    （api 侧不传；policy fail-closed 的语义由 plugin-host 的 node --test 覆盖）；
 * 5. **不支持复用宿主**（`opts.host` / 换键 / 补保留表 / 配置失败 fail-closed），也不做 `host` 可用性
 *    校验（`INVALID_HOST`）与 `reservedTools` 的类型校验（`RESERVED_TOOLS_INVALID`）—— api 恒新建宿主
 *    且只传正确的字符串数组。
 * 真件语义以 `packages/plugin-host` 的套件为准。
 *
 * 与真件的唯一实现差异：入口用 **jest 的 `require`** 而非 `createRequire`，使插件里
 * `require('@gri/agent-core')` 落到本 spec 的 mock 上（真件在生产用 createRequire，本就走真模块）。
 * 本文件与 `../plugins/` 均已列入 jest `transformIgnorePatterns`（纯 CJS，无需转译，也免去 ts-jest 警告）。
 */
const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { join, resolve, relative, isAbsolute, sep } = require('node:path');

/** 与真件 `DEFAULT_KINDS` 同名同集（真件的完整校验由 plugin-host 的 node --test 覆盖）。 */
const KINDS = ['knowledge.content', 'knowledge.taxonomy', 'world.scene', 'agent.skill', 'agent.engine', 'auth.identity', 'integration', 'policy'];
const HOST_API_VERSION = '1';
// 与真件 manifest.js 同一 id 规则（防「api spec 用坏 id 也绿、真件却拒」的替身漂移）。
const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** 清单最小校验（id / kind / apiVersion）—— 与真件同 code，使「坏清单 → 诊断」在 api 侧同样成立。 */
function checkManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error('插件清单必须是对象'), { code: 'NOT_AN_OBJECT' });
  if (!raw.id) throw Object.assign(new Error('插件清单缺 id'), { code: 'MISSING_ID' });
  if (!ID_RE.test(raw.id)) throw Object.assign(new Error(`插件 id 非法（应为 kebab/dotted 小写）: ${raw.id}`), { code: 'INVALID_ID' });
  if (!raw.kind) throw Object.assign(new Error(`插件 ${raw.id} 缺 kind`), { code: 'MISSING_KIND' });
  if (!KINDS.includes(raw.kind)) throw Object.assign(new Error(`插件 ${raw.id} 的 kind 不在宿主支持集: ${raw.kind}`), { code: 'UNKNOWN_KIND' });
  const apiVersion = raw.apiVersion == null ? HOST_API_VERSION : String(raw.apiVersion);
  if (apiVersion !== HOST_API_VERSION) throw Object.assign(new Error(`插件 ${raw.id} apiVersion=${apiVersion} 与宿主不兼容`), { code: 'INCOMPATIBLE_API_VERSION' });
  return raw;
}

/** `target` 是否落在 `dir` 内（与真件同语义；替身只做字符串层，realpath 层由真件覆盖）。 */
function isInside(dir, target) {
  const rel = relative(dir, target);
  return !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

function loadPlugins(opts = {}) {
  const discovered = [];
  const ignored = [];
  const errors = [];
  const tools = [];
  const activated = [];
  const host = { tools: () => tools.slice(), diagnostics: () => ({ active: activated.slice(), errors: errors.slice() }) };
  // 与真件同：`nameKey` 传了却不是函数 → 配置错误，响亮记诊断（不静默当恒等键，也不抛）。
  if (opts.nameKey != null && typeof opts.nameKey !== 'function') {
    errors.push({ code: 'NAME_KEY_INVALID', message: `工具名等价键必须是函数，收到 ${typeof opts.nameKey}` });
    return { host: null, tools: [], diagnostics: { dir: null, discovered, activated: [], ignored, errors } };
  }
  const dir = opts.dir;
  // 与真件同：按**等价键**判撞名（`nameKey` 缺省恒等）。api 传的是 agent-core 的清洗名规则，
  // 使 `agent-delegate` 与 `agent.delegate` 视为同名（模型眼里它们就是同一个 function 名）。
  const nameKey = typeof opts.nameKey === 'function' ? opts.nameKey : (n) => String(n);
  const reservedKeys = new Set((opts.reservedTools || []).map(nameKey));

  const empty = (d) => ({ host, tools: [], diagnostics: { dir: d, discovered, activated: [], ignored, errors } });
  // 与真件同：非字符串 → PLUGINS_DIR_INVALID（只诊断不抛），空 → UNSET，不存在/非目录 → MISSING。
  if (typeof dir !== 'string') {
    if (dir == null) {
      errors.push({ code: 'PLUGINS_DIR_UNSET', message: '未指定插件目录（dir）' });
      return empty(null);
    }
    errors.push({ code: 'PLUGINS_DIR_INVALID', message: `插件目录必须是字符串路径，收到 ${typeof dir}` });
    return empty(null);
  }
  if (!dir) {
    errors.push({ code: 'PLUGINS_DIR_UNSET', message: '未指定插件目录（dir）' });
    return empty(null);
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    errors.push({ code: 'PLUGINS_DIR_MISSING', dir, message: `插件目录不存在：${dir}` });
    return empty(dir);
  }

  const claimed = new Set();
  const seenIds = new Set();
  for (const name of readdirSync(dir).sort()) {
    const pluginDir = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(pluginDir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    if (!existsSync(join(pluginDir, 'plugin.json'))) {
      // 与真件同形：目录无清单 → 记入 ignored（非 error），既不静默也不误报。
      ignored.push({ dir: name, code: 'PLUGIN_MANIFEST_MISSING', message: `${name}/ 下无 plugin.json，按非插件目录跳过` });
      continue;
    }
    try {
      const raw = checkManifest(JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8')));
      const entry = resolve(pluginDir, raw.entry || './index.js');
      // 与真件同：entry 越界 / 指向目录 → 拒绝（否则目录型 entry 会让 require 改读其 package.json main）。
      if (!isInside(pluginDir, entry)) {
        throw Object.assign(new Error(`插件 ${raw.id} 的 entry 越出插件目录: ${raw.entry}`), { code: 'PLUGIN_ENTRY_ESCAPE' });
      }
      if (existsSync(entry) && statSync(entry).isDirectory()) {
        throw Object.assign(new Error(`插件 ${raw.id} 的 entry 指向目录: ${raw.entry}`), { code: 'PLUGIN_ENTRY_NOT_FILE' });
      }
      const loaded = require(entry);
      const impl = (loaded && loaded.default) || loaded || null;
      // 撞 id（真件由注册表在 register 时拒）→ 记 DUPLICATE_PLUGIN_ID，且**不入 discovered**（与真件同序）。
      if (seenIds.has(raw.id)) throw Object.assign(new Error(`插件 id 撞名: ${raw.id}`), { code: 'DUPLICATE_PLUGIN_ID' });
      seenIds.add(raw.id);
      discovered.push({ id: raw.id, dir: name, kind: raw.kind });
      // 工具校验模拟**装配期**（真件在 assembleSync 的 `_collectTools`）：失败时该插件**已注册**，
      // 故**仍在 discovered 里**（与真件同），只是不入 activated。
      const rawTools = typeof impl?.tools === 'function' ? impl.tools({ host: {} }) : impl?.tools;
      const defs = Array.isArray(rawTools) ? rawTools : [];
      const seen = new Set();
      for (const t of defs) {
        if (!t || !t.name) throw Object.assign(new Error(`插件 ${raw.id} 提供了无名工具`), { code: 'TOOL_NAME_MISSING' });
        const key = nameKey(t.name);
        if (seen.has(key)) throw Object.assign(new Error(`插件 ${raw.id} 内工具名重复: ${t.name}`), { code: 'TOOL_NAME_DUPLICATE' });
        seen.add(key);
        if (reservedKeys.has(key)) {
          throw Object.assign(new Error(`工具名与宿主自有工具冲突，拒绝加载: ${t.name}（插件 ${raw.id}）`), { code: 'TOOL_NAME_RESERVED' });
        }
        if (claimed.has(key)) {
          throw Object.assign(new Error(`工具名撞名，拒绝加载: ${t.name}（冲突插件 ${raw.id}）`), { code: 'TOOL_NAME_CONFLICT' });
        }
      }
      for (const t of defs) {
        claimed.add(nameKey(t.name));
        tools.push(t);
      }
      activated.push(raw.id);
    } catch (e) {
      errors.push({ dir: name, code: e.code || 'PLUGIN_LOAD_FAILED', message: e.message });
    }
  }
  return { host, tools, diagnostics: { dir, discovered, activated, ignored, errors } };
}

module.exports = { loadPlugins };
