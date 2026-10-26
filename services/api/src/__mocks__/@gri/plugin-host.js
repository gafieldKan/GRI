/**
 * `@gri/plugin-host` 的 jest 测试替身（手动 mock，对本目录下所有 spec 自动生效）。
 *
 * 为什么需要：`@gri/plugin-host` 是 ESM（`type: module`），jest 的 CJS 模块注册表不解析
 * node_modules 里的 `export` 语法 —— 与 `@gri/agent-core` 同因（见各 agent spec 的 `jest.mock`）。
 *
 * 替身**只覆盖 api 真正消费的那一面**：`loadPlugins`（api 只 import 这一个符号），
 * 含它返回的 `skills`（插件 `skill: "./SKILL.md"` 的正文）—— api 侧靠它装载 tutor 技能正文。
 * PluginHost / 能力注册表 / 撞名拒绝 / policy fail-closed 等语义的正确性由
 * `packages/plugin-host` 的 `node --test` 套件覆盖，不在此重复。
 *
 * 替身**不豁免失败**：目录缺失 / 未指定 / 非字符串 dir / 坏清单（含非法 id） / 坏入口（越界、指向目录） /
 * 工具撞名，一律记入 `diagnostics.errors`（与真件同 code），使 api 侧仍能断言「缺插件给诊断（不静默）」。
 *
 * 已知的**有意简化**（真件行为更严，但 api 侧不触）：
 * 1. 装配顺序按目录名而非 kind 优先级；
 * 2. 不跑插件的 `tools` 工厂抛错路径 / `install`/`activate` 生命周期（真件装配期会跑）；
 * 3. `manifestFile` / `entryFile` 未模拟（api 恒用缺省 `plugin.json` / `index.js`）。
 *    **`opts.assemble` 已模拟**（`skipKinds` / `requirePolicy`，含 `diagnostics().policyAssembled`）——
 *    api 侧现已传它（生产档 `requirePolicy`，非生产档 `skipKinds:['policy']`，见 `agent-plugins.ts`），
 *    故替身必须同语义，否则「测试档不装 policy」这条行为在 api 套件里根本不被覆盖
 *    （会静默 fail-open 到「policy 也装上」——正是 W2.7 之前替身漏掉的那条）；
 * 4. **不支持复用宿主**（`opts.host` / 换键 / 补保留表），也不做 `host` 可用性校验（`INVALID_HOST`）
 *    —— api 恒新建宿主。**但 `reservedTools` / `nameKey` 的类型校验已实现**（fail-closed，见下），
 *    因为那是**安全路径**：替身若放行非法配置而照装插件，就比真件更松。
 * 真件语义以 `packages/plugin-host` 的套件为准。
 *
 * **替身不得比真件更松**（第一轮独立复验的教训）：目录监狱（含 **realpath 层**的符号链接判定）、
 * 清单/skill/entry 的「必须是普通文件」、路径字段的类型校验、BOM 剥离、目录不可读的 EACCES ——
 * 这些**安全与活性**相关的判定在替身里同样实现。否则 api 套件会在「真件已堵、替身还漏」的
 * 情况下保持全绿：独立复验实证过替身曾**真的读入符号链接指向的目录外正文**。
 * 唯一仍除外的实件差异：入口用 **jest 的 `require`** 而非 `createRequire`，使插件里
 * `require('@gri/agent-core')` 落到本 spec 的 mock 上（真件在生产用 createRequire，本就走真模块）。
 * 本文件与 `../plugins/` 均已列入 jest `transformIgnorePatterns`（纯 CJS，无需转译，也免去 ts-jest 警告）。
 */
const { existsSync, readdirSync, readFileSync, realpathSync, statSync } = require('node:fs');
const { join, resolve, relative, isAbsolute, sep } = require('node:path');

/** 与真件 `DEFAULT_KINDS` 同名同集（真件的完整校验由 plugin-host 的 node --test 覆盖）。 */
const KINDS = ['knowledge.content', 'knowledge.taxonomy', 'world.scene', 'agent.skill', 'agent.engine', 'auth.identity', 'integration', 'policy'];
const HOST_API_VERSION = '1';
// 与真件 manifest.js 同一 id 规则（防「api spec 用坏 id 也绿、真件却拒」的替身漂移）。
const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** 诊断里的 `dir`：非空字符串才报（与真件同口径 —— 配置失败时也要能对出「是哪个目录配错了」）。 */
function dirForDiag(d) {
  return typeof d === 'string' && d ? d : null;
}

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

/** `target` 是否落在 `dir` 内（与真件**同两层语义**：路径层 + realpath 层）。
 *  realpath 层不可省：符号链接能把 skill/entry 指到目录之外，字符串前缀判不出来。 */
function isInside(dir, target) {
  const rel = relative(dir, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  try {
    const realRel = relative(realpathSync(dir), realpathSync(target));
    return !(realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel));
  } catch {
    return true; // 目标暂时不存在 → 交给 require/read 去报（有诊断，不静默）
  }
}

/** 是否**普通文件**（排除目录 / FIFO / 设备）：FIFO 会让 `readFileSync` 永久阻塞（与真件同判）。 */
function isRegularFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 剥首字节 BOM（与真件同：BOM 是编码签名，会让 `^---` 锚定的 frontmatter 解析整条失配）。 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 清单路径字段（entry/skill）取值：缺省 → null；**写了却类型不对** → 响亮报错（不静默当「没写」）。 */
function declaredPath(v, field, id) {
  if (v == null) return null;
  if (typeof v !== 'string' || !v.trim()) {
    throw Object.assign(new Error(`插件 ${id} 的 ${field} 必须是非空字符串，收到 ${typeof v}`), {
      code: `PLUGIN_${field.toUpperCase()}_INVALID`,
    });
  }
  return v;
}

function loadPlugins(opts = {}) {
  const discovered = [];
  const ignored = [];
  const errors = [];
  const tools = [];
  const activated = [];
  const skills = [];
  // W2.7：模拟 `opts.assemble`（skipKinds / requirePolicy）—— 语义对齐真件 `host.js` 的 `assembleSync`：
  //   - `skipKinds` 里的 kind：该插件**入 discovered 但不激活**（真件：注册后装配期跳过）；
  //   - `requirePolicy` 且无**可用** policy（存在 kind=policy、未被跳过、实现 `authorize`）→ fail-closed：
  //     零激活零工具 + 记 `POLICY_REQUIRED`（真件在装配**前**抛，被 loader 的 `finish()` 吞成诊断）。
  const assembleOpts = opts.assemble && typeof opts.assemble === 'object' ? opts.assemble : {};
  const skip = new Set(Array.isArray(assembleOpts.skipKinds) ? assembleOpts.skipKinds : []);
  const requirePolicy = Boolean(assembleOpts.requirePolicy); // 真件按**真值**判（`if (opts.requirePolicy)`），故同此
  let policyActive = false; // 至少一个**可用**（有 authorize）的 policy 插件被激活 → 授权闸门真在岗
  const host = {
    tools: () => tools.slice(),
    diagnostics: () => ({ active: activated.slice(), errors: errors.slice(), policyAssembled: policyActive }),
  };
  // 与真件同：`nameKey` 传了却不是函数 → 配置错误，响亮记诊断（不静默当恒等键，也不抛）。
  if (opts.nameKey != null && typeof opts.nameKey !== 'function') {
    errors.push({ code: 'NAME_KEY_INVALID', message: `工具名等价键必须是函数，收到 ${typeof opts.nameKey}` });
    return { host: null, tools: [], skills: [], diagnostics: { dir: dirForDiag(opts.dir), discovered, activated: [], ignored, errors } };
  }
  // 与真件同：`reservedTools` 非字符串数组 → **配置失败即 fail-closed**（连目录都不扫、零激活）。
  // 替身不得比真件更松：真件在宿主构造器里就拒（`new Set('abc')` 会把保留表静默变成单字符集，
  // 想保护的名字一个都没护上）；替身若静默当 `[]` 并照装插件，就等于在**安全路径上更宽松**。
  // （`0`/`''`/`false` 这类 falsy 非数组同样报错，不得被当成「空表」吞掉。）
  if (opts.reservedTools != null && (!Array.isArray(opts.reservedTools) || opts.reservedTools.some((x) => typeof x !== 'string'))) {
    errors.push({ code: 'RESERVED_TOOLS_INVALID', message: `宿主自有工具名必须是字符串数组，收到 ${typeof opts.reservedTools}` });
    return { host: null, tools: [], skills: [], diagnostics: { dir: dirForDiag(opts.dir), discovered, activated: [], ignored, errors } };
  }
  const dir = opts.dir;
  // 与真件同：按**等价键**判撞名（`nameKey` 缺省恒等）。api 传的是 agent-core 的清洗名规则，
  // 使 `agent-delegate` 与 `agent.delegate` 视为同名（模型眼里它们就是同一个 function 名）。
  const nameKey = typeof opts.nameKey === 'function' ? opts.nameKey : (n) => String(n);
  const reservedKeys = new Set((opts.reservedTools || []).map(nameKey));

  const empty = (d) => ({ host, tools: [], skills: [], diagnostics: { dir: d, discovered, activated: [], ignored, errors } });
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
  // 目录「存在/是目录/可读」都可能抛 IO 异常（EACCES）—— 与真件同：记 PLUGINS_DIR_UNREADABLE，
  // 零插件、**不崩**（替身不得比真件更松：真件此处不抛）。readdirSync 也须在同一 try 内。
  let entries;
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      errors.push({ code: 'PLUGINS_DIR_MISSING', dir, message: `插件目录不存在：${dir}` });
      return empty(dir);
    }
    entries = readdirSync(dir);
  } catch (e) {
    errors.push({ code: 'PLUGINS_DIR_UNREADABLE', dir, message: `插件目录不可读：${dir}（${e.message}）` });
    return empty(dir);
  }

  const claimed = new Set();
  const seenIds = new Set();
  for (const name of entries.sort()) {
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
      const manifestPath = join(pluginDir, 'plugin.json');
      // 与真件同：清单本身也走目录监狱，且必须**普通文件**（FIFO 会永久阻塞读）。
      if (!isInside(pluginDir, manifestPath)) {
        throw Object.assign(new Error(`${name}/plugin.json 越出插件目录（符号链接？）`), { code: 'PLUGIN_MANIFEST_ESCAPE' });
      }
      if (!isRegularFile(manifestPath)) {
        throw Object.assign(new Error(`${name}/plugin.json 不是普通文件（目录/FIFO/设备？）`), { code: 'PLUGIN_MANIFEST_NOT_FILE' });
      }
      const raw = checkManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
      const declaredEntry = declaredPath(raw.entry, 'entry', raw.id);
      const entry = resolve(pluginDir, declaredEntry || './index.js');
      // 与真件同：entry 越界 / 不是普通文件 → 拒绝（目录型 entry 会让 require 改读其 package.json main）。
      if (!isInside(pluginDir, entry)) {
        throw Object.assign(new Error(`插件 ${raw.id} 的 entry 越出插件目录: ${declaredEntry}`), { code: 'PLUGIN_ENTRY_ESCAPE' });
      }
      if (existsSync(entry) && !isRegularFile(entry)) {
        throw Object.assign(new Error(`插件 ${raw.id} 的 entry 不是普通文件: ${declaredEntry}`), { code: 'PLUGIN_ENTRY_NOT_FILE' });
      }
      // 技能正文（与真件同码）：越界 / 不存在 / 非普通文件 → 拒绝该插件（不让教学正文静默蒸发）。
      const declaredSkill = declaredPath(raw.skill, 'skill', raw.id);
      let skillPath = null;
      let skillDoc = null;
      if (declaredSkill) {
        skillPath = resolve(pluginDir, declaredSkill);
        if (!isInside(pluginDir, skillPath)) throw Object.assign(new Error(`插件 ${raw.id} 的 skill 越出插件目录: ${declaredSkill}`), { code: 'PLUGIN_SKILL_ESCAPE' });
        if (!existsSync(skillPath)) throw Object.assign(new Error(`插件 ${raw.id} 声明的 skill 不存在: ${declaredSkill}`), { code: 'PLUGIN_SKILL_MISSING' });
        if (!isRegularFile(skillPath)) throw Object.assign(new Error(`插件 ${raw.id} 的 skill 不是普通文件: ${declaredSkill}`), { code: 'PLUGIN_SKILL_NOT_FILE' });
        skillDoc = stripBom(readFileSync(skillPath, 'utf8'));
      }
      // 与真件同：「入口文件在不在」与「入口导出什么」是两件事 —— 存在却导出 falsy 不算缺失。
      const entryExists = existsSync(entry);
      const loaded = entryExists ? require(entry) : null;
      if (!entryExists && declaredEntry) throw Object.assign(new Error(`插件 ${raw.id} 声明的 entry 不存在: ${declaredEntry}`), { code: 'PLUGIN_ENTRY_MISSING' });
      const impl = entryExists && loaded ? (loaded.default || loaded) || null : null;
      // 撞 id（真件由注册表在 register 时拒）→ 记 DUPLICATE_PLUGIN_ID，且**不入 discovered**（与真件同序）。
      if (seenIds.has(raw.id)) throw Object.assign(new Error(`插件 id 撞名: ${raw.id}`), { code: 'DUPLICATE_PLUGIN_ID' });
      seenIds.add(raw.id);
      discovered.push({ id: raw.id, dir: name, kind: raw.kind, entry: entryExists ? entry : null });
      // W2.7：装配期跳过的 kind（真件 `assembleSync` 的 `skip.has(kind)`）—— 已登记（入 discovered）、
      // 但不激活、不取工具、不交正文（正文跟着「装配结果」走，见 loader `finish()` 的 liveSkills）。
      if (skip.has(raw.kind)) continue;
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
      // 可用 policy（kind=policy 且实现了 authorize）→ 替身据以汇报 `policyAssembled`。
      // **替身此处比真件更严**：真件 `diagnostics().policyAssembled` 只判「有激活的 kind=policy」
      // （`host.js`），**不查** authorize（authorize 只在 `_assertPolicyUsable` 的前置校验里查）。
      // 更严是安全方向——只会让测试在真件本可通过处报错，绝不会掩盖 fail-open；且 api 只在
      // `requirePolicy` 档读该标志，真件在该档已由前置+后置校验保证「要么有**可用** policy、要么零装配」。
      if (raw.kind === 'policy' && typeof impl?.authorize === 'function') policyActive = true;
      if (skillDoc != null) skills.push({ id: raw.id, dir: name, path: skillPath, markdown: skillDoc });
    } catch (e) {
      errors.push({ dir: name, code: e.code || 'PLUGIN_LOAD_FAILED', message: e.message });
    }
  }
  // fail-closed 复核：生产档要 policy 却没有可用的 → 真件在装配循环**前**抛（故什么都没装上），
  // 替身同效：零激活零工具零正文 + 记 `POLICY_REQUIRED`（api 侧据此 `policyAssembled===false` 拒绝启动）。
  if (requirePolicy && !policyActive) {
    errors.push({ code: 'POLICY_REQUIRED', message: '生产装配要求至少一个未被跳过的 kind="policy" 插件（fail-closed）。测试档请显式 requirePolicy:false 或 skipKinds:["policy"]。' });
    activated.length = 0;
    tools.length = 0;
    skills.length = 0;
  }
  return { host, tools, skills, diagnostics: { dir, discovered, activated, ignored, errors } };
}

module.exports = { loadPlugins };
