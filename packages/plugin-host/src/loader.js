/**
 * 目录加载器 —— 把 `plugins/<id>/plugin.json`（+ 入口实现）变成**已装配**的宿主。
 *
 * 定位：`PluginHost` 只认清单与契约、**不负责 import**（见 manifest.js 头注）；「从目录发现插件」
 * 是宿主的活，故落在本文件——**通用**且可被任何宿主（api / codegen / 未来其它进程）复用。
 *
 * 三条设计约束：
 * 1. **同步**：宿主启动期常需要**同步**拿到工具定义（如 NestJS 服务的 `toolDefs()`、单测
 *    `new Service(db)`），故不用 `assemble()`（异步生命周期），而走 `assembleSync()`。
 *    入口因此须是 CJS 或无顶层 await 的 ESM（Node ≥22 的 `require(esm)` 可同步载入）。
 * 2. **不升错**（P5）：**任何**单点失败（目录缺失 / 清单非法 / 入口抛错 / 工具撞名）一律只记入
 *    `diagnostics.errors` 并跳过该插件，宿主照常启动。缺的工具**在诊断里可见**，绝不静默。
 * 3. **确定性**：按目录名排序发现，装配顺序由 `assemblyOrder` 的 kind 优先级 + 注册序决定。
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { PluginHost, PluginHostError, errorInfo } from './host.js';
import { parseManifest } from './manifest.js';

/**
 * 同步扫描并装配一个插件目录。
 *
 * @param {object} opts
 * @param {string} [opts.dir] 插件根目录（其每个子目录含一份 `plugin.json`）
 * @param {PluginHost} [opts.host] 复用既有宿主（缺省新建）
 * @param {object} [opts.hostOptions] 新建宿主时的选项（kinds / context / observability…）；
 *   复用既有宿主时，其中的 `reservedTools` / `nameKey` 仍会被补上（顶层同名参数优先）
 * @param {string[]} [opts.reservedTools] 宿主**自有**工具名 —— 插件不得占用（透传 `PluginHost.reservedTools`）
 * @param {Function} [opts.nameKey] 工具名**等价键**（透传 `PluginHost.nameKey`）——多对一时用它判撞名
 * @param {object} [opts.assemble] 传给 `assembleSync()` 的选项（`skipKinds` / `requirePolicy`）
 * @param {string} [opts.manifestFile='plugin.json'] 清单文件名
 * @param {string} [opts.entryFile='index.js'] 清单未写 `entry` 时的入口名
 * @returns {{host: PluginHost, tools: any[], skills: {id: string, dir: string, path: string, markdown: string}[], diagnostics: {dir: string|null, discovered: object[], activated: string[], ignored: object[], errors: object[]}}}
 */
export function loadPlugins(opts = {}) {
  opts = opts || {}; // 显式 `null` 也不得崩（与 `dir` 非字符串同类：P5 —— 配置容错不成为崩溃点）
  const manifestFile = opts.manifestFile || 'plugin.json';
  const entryFile = opts.entryFile || 'index.js';
  // **绝对化**：`createRequire` 只收绝对路径（相对路径会直接抛 ERR_INVALID_ARG_VALUE，
  // 那是**宿主启动期崩溃**而非诊断，违 P5）。故在入口处一次归一，之后一律用 dir。
  // 非字符串（误传数字/对象）同样**只诊断不抛** —— 归一本身也不得成为新的崩溃点。
  // **归一提到取宿主之前**：宿主配置失败时也要如实报出 dir（否则诊断里 `dir:null`，事后查无对证）。
  let dir = null;
  if (typeof opts.dir === 'string' && opts.dir) dir = resolve(opts.dir);
  const dirSet = typeof opts.dir === 'string' && Boolean(opts.dir);

  // 取宿主：**不得抛**（P5）。复用宿主时补 `nameKey`/保留表可能因「新键引入撞名」而拒绝 ——
  // 那是调用方的配置错误，但同样只记诊断，不能让宿主**启动期崩溃**。
  // `host` 不是宿主（字符串/普通对象）同样只记诊断：`host.tools()` 会 TypeError，那也违 P5。
  const { host, error: hostError } = safeHostFrom(opts);
  const errors = hostError ? [hostError] : [];
  if (!host) {
    return { host: null, tools: [], skills: [], diagnostics: { dir, discovered: [], activated: [], ignored: [], errors } };
  }

  // **宿主配置失败 → 不再继续装载**（安全上比「照装」正确）：调用方要求的 `reservedTools` / `nameKey`
  // 没生效，此时若照常扫目录并装配，插件就会在**防线静默缺失**的情况下进入工具表（撞名可顶替宿主工具）。
  // 故 fail-closed：零发现/零激活，只把宿主**当前**状态如实交出 + 诊断（不静默、不半配置生效）。
  if (hostError) {
    return { host, tools: safeTools(host), skills: [], diagnostics: { dir, discovered: [], activated: [], ignored: [], errors } };
  }

  const discovered = [];
  const ignored = [];
  const skills = [];

  if (opts.dir != null && opts.dir !== '' && !dirSet) {
    errors.push({ code: 'PLUGINS_DIR_INVALID', message: `插件目录必须是字符串路径，收到 ${typeof opts.dir}（零插件装配，宿主照常启动）` });
    return finish(host, null, discovered, ignored, errors, skills, opts.assemble || {});
  }
  if (!dir) {
    errors.push({ code: 'PLUGINS_DIR_UNSET', message: '未指定插件目录（dir）—— 零插件装配' });
    return finish(host, null, discovered, ignored, errors, skills, opts.assemble || {});
  }
  // 目录「存在/是目录/可读」三件事都可能抛 IO 异常（EACCES 等）—— 宿主启动期**不得**因权限问题崩溃，
  // 与「目录不存在」同类处理：记诊断、零插件、宿主照常（P5）。
  let entries;
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      errors.push({ code: 'PLUGINS_DIR_MISSING', dir, message: `插件目录不存在：${dir}（零插件装配，宿主照常启动）` });
      return finish(host, dir, discovered, ignored, errors, skills, opts.assemble || {});
    }
    entries = readdirSync(dir);
  } catch (e) {
    const info = errorInfo(e);
    errors.push({
      code: 'PLUGINS_DIR_UNREADABLE',
      dir,
      message: `插件目录不可读：${dir}（${info.message}；零插件装配，宿主照常启动）`,
    });
    return finish(host, dir, discovered, ignored, errors, skills, opts.assemble || {});
  }

  // 以插件根目录为基准的 require：入口文件里的裸模块（如 '@gri/agent-core'）按**入口自身位置**向上解析。
  const req = createRequire(join(dir, '__plugin_loader__.js'));

  for (const name of entries.sort()) {
    const pluginDir = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(pluginDir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue; // 文件（README / .gitkeep…）→ 非插件，静默跳过
    if (!existsSync(join(pluginDir, manifestFile))) {
      // 目录却无清单：记入 **ignored（非 error）**——两难的正解：
      // 既不静默（否则「插件目录整个不见了」事后查无对证），也不误报成装载失败
      // （共享资源目录 / 依赖目录是合法的，本就不是插件）。
      ignored.push({ dir: name, code: 'PLUGIN_MANIFEST_MISSING', message: `${name}/ 下无 ${manifestFile}，按非插件目录跳过` });
      continue;
    }

    try {
      const manifestPath = join(pluginDir, manifestFile);
      // 清单**本身**也走目录监狱：entry/skill 都守了「不得指到目录之外」，清单不守则同一漏洞
      // 从最上游开着 —— `plugin.json` 若是符号链接，读到的就是目录外的清单（它是**数据**，
      // 不该能把「读哪个文件」指到插件目录之外）。越界 → 拒绝该插件并诊断。
      if (!isInside(pluginDir, manifestPath)) {
        throw new PluginHostError('PLUGIN_MANIFEST_ESCAPE', `${name}/${manifestFile} 越出插件目录（符号链接？）`);
      }
      // **非普通文件一律不读**：命名管道（FIFO）会让 `existsSync` 为真、`readFileSync` **永久阻塞** ——
      // 宿主启动期**挂死且零诊断**（比抛错更糟：连诊断都没有，违 P5）。目录/设备文件同理。
      if (!isRegularFile(manifestPath)) {
        throw new PluginHostError('PLUGIN_MANIFEST_NOT_FILE', `${name}/${manifestFile} 不是普通文件（目录/FIFO/设备？）`);
      }
      const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
      // **先校验清单再执行入口**：不合法清单绝不触发入口代码（否则等于让坏插件先跑一遍）。
      parseManifest(raw, { kinds: host.kinds, apiVersion: host.apiVersion });
      // 路径字段**显式校验类型**：`parseManifest` 把非字符串归一成 `null`（=没写），
      // 但「写了却写错类型」是配置错误，静默当成「没写」就把错误吞了；且直接读 `raw.*`
      // 交给 `resolve` 会抛 `ERR_INVALID_ARG_TYPE`（那是 Node 内部码，不是本包的诊断码）。
      const declaredEntry = declaredPath(raw.entry, 'entry', raw.id);
      const entry = resolve(pluginDir, declaredEntry || `./${entryFile}`);
      // 入口必须**落在插件目录内**：清单是数据，不该能把代码指到目录之外（否则「本地目录、manifest-first」
      // 的信任模型被一句 `"entry": "../../x.js"` 绕过）。越界 → 拒绝该插件并诊断，绝不静默加载外部代码。
      if (!isInside(pluginDir, entry)) {
        throw new PluginHostError('PLUGIN_ENTRY_ESCAPE', `插件 ${raw.id} 的 entry 越出插件目录: ${raw.entry}`);
      }
      // 入口必须是**普通文件**：`entry: "."`（或任何指向目录的值）会让 `require(dir)` 去读该目录的
      // `package.json` 的 `main` —— 那条路径**不经本 jail**（`main` 可写 `../../evil.js` 或绝对路径），
      // 「入口落在目录内」的判定会被整条绕过。故指向目录一律拒绝（符号链接越界另有 realpath 兜底）。
      // 非普通文件（FIFO：`require` 会永久阻塞在 open 上）同样拒绝 —— 同「清单不得是 FIFO」一条道理。
      if (existsSync(entry) && !isRegularFile(entry)) {
        throw new PluginHostError(
          'PLUGIN_ENTRY_NOT_FILE',
          `插件 ${raw.id} 的 entry 不是普通文件（指向目录时 require 会改读其 package.json 的 main，绕过目录监狱）: ${declaredEntry}`,
        );
      }
      // 技能正文（`skill: "./SKILL.md"`）：与 entry 同理走**目录监狱** —— 清单是数据，
      // 不该能把读取指到目录之外；且必须**存在**且是**普通文件**（FIFO 会阻塞读、目录读不了）。
      // 读到的正文随 `skills` 交出（宿主自行并入 prompt）。
      // 声明了 skill 却读不出来 → 拒该插件（不是静默少一段正文：技能正文往往就是该插件存在的理由）。
      const declaredSkill = declaredPath(raw.skill, 'skill', raw.id);
      let skillPath = null;
      let skillDoc = null;
      if (declaredSkill) {
        skillPath = resolve(pluginDir, declaredSkill);
        if (!isInside(pluginDir, skillPath)) {
          throw new PluginHostError('PLUGIN_SKILL_ESCAPE', `插件 ${raw.id} 的 skill 越出插件目录: ${declaredSkill}`);
        }
        if (!existsSync(skillPath)) {
          throw new PluginHostError('PLUGIN_SKILL_MISSING', `插件 ${raw.id} 声明的 skill 不存在: ${declaredSkill}`);
        }
        if (!isRegularFile(skillPath)) {
          throw new PluginHostError('PLUGIN_SKILL_NOT_FILE', `插件 ${raw.id} 的 skill 不是普通文件: ${declaredSkill}`);
        }
        // 剥掉首字节 BOM：BOM 是**编码签名**不是正文，却会让下游按 `^---` 锚定的 frontmatter 解析
        // 整个失配（`agent-core` 的 `parseSkillMarkdown`）—— 技能被静默丢弃，而「存为 UTF-8 带 BOM」
        // 是极常见的编辑器默认。在读字节的**边界**上剥掉，正文与解析器都干净。
        skillDoc = stripBom(readFileSync(skillPath, 'utf8'));
      }
      // **「入口文件在不在」与「入口加载出的值是什么」是两件事** —— 先取存在性，再加载：
      // 一个*存在且加载成功*但导出 falsy（`module.exports = 0 / null / '' / false`）的入口，
      // 不该被误报成「声明的 entry 不存在」（那是另一码事，且会误导排查方向）。
      const entryExists = existsSync(entry);
      const loaded = entryExists ? req(entry) : null;
      // **纯内容插件**（只有 `plugin.json` + `SKILL.md`，无代码）是合法形态：没写 `entry` 且目录里
      // 也没有缺省入口文件 → 视作无实现（`impl = null`），不由 `MODULE_NOT_FOUND` 把它整个拒掉。
      // 但**显式声明**了 `entry` 却不存在是配置错误 —— 那要响亮报出，不静默降级成无实现。
      if (!entryExists && declaredEntry) {
        throw new PluginHostError('PLUGIN_ENTRY_MISSING', `插件 ${raw.id} 声明的 entry 不存在: ${declaredEntry}`);
      }
      // 入口存在但导出 falsy（空实现）→ 同样按**无实现**处理（无工具/无钩子），不算错误。
      const impl = entryExists && loaded ? (loaded.default || loaded) || null : null;
      const manifest = host.register(raw, impl);
      discovered.push({ id: manifest.id, dir: name, kind: manifest.kind, entry: entryExists ? entry : null });
      if (skillDoc != null) skills.push({ id: manifest.id, dir: name, path: skillPath, markdown: skillDoc });
    } catch (e) {
      const info = errorInfo(e);
      errors.push({ dir: name, code: info.code || 'PLUGIN_LOAD_FAILED', message: info.message });
    }
  }

  return finish(host, dir, discovered, ignored, errors, skills, opts.assemble || {});
}

/**
 * 取宿主：复用传入的，否则新建（`reservedTools` / `nameKey` 可写在**顶层**或 `hostOptions` 里）。
 * 顶层选项**优先**于 `hostOptions` 同名项（显式参数更具体；反过来会让显式传参被静默忽略）。
 * 可能抛（见 {@link safeHostFrom}）。
 */
function hostFrom(opts) {
  const ho = opts.hostOptions || null;
  // 用 `!= null` 而非 `||`：`[]` / `''` 是**已提供**的值，不能被当成「没传」而悄悄回落到 hostOptions。
  const reserved = opts.reservedTools != null ? opts.reservedTools : ho && ho.reservedTools;
  const nameKey = opts.nameKey != null ? opts.nameKey : ho && ho.nameKey;
  // `nameKey` 是配置：给了却不是函数 → 响亮报错（否则「传了清洗键却没生效」会静默丢掉防线）。
  // 缺省（null/undefined）则合法 —— 表示「保持宿主现状 / 恒等键」。
  if (nameKey != null && typeof nameKey !== 'function') {
    throw new PluginHostError('NAME_KEY_INVALID', `工具名等价键必须是函数，收到 ${typeof nameKey}`);
  }
  // 用 `!= null` 而非真值判断：`0` / `''` / `false` / `NaN` 是**明确传了**的值 —— 真值判断会把它们
  // 当成「没传」，于是调用方**本该被拒的宿主被悄悄丢掉**、换成一个全新（且没有保留名/等价键）的宿主。
  if (opts.host != null) {
    if (!isUsableHost(opts.host)) {
      throw new PluginHostError(
        'INVALID_HOST',
        `host 必须是 PluginHost（需 tools/register/assembleSync/reserveTools/setNameKey），收到 ${describe(opts.host)}`,
      );
    }
    // 复用宿主时也要把保留表/等价键补上 —— 否则「传了 reservedTools / nameKey 却没生效」是个静默的坑
    // （清洗名防线凭空消失，`agent-delegate` 又能顶替 `agent.delegate`）。
    // 传了 nameKey 就**一步**把保留表并进改键（`setNameKey(fn, reserved)`）：换键时按**新键**重算保留名
    // 并与已登记工具比对，从而把「新键下某插件工具其实已被宿主保留」抓出来；且**校验在前、提交在后**
    // → 拒绝时宿主分毫未动（原子），不留半配置状态。
    // **一律把 `reserved` 交给宿主校验**（`== null ? [] : reserved`）：`0` / `''` / `false` 这类
    // falsy 非数组若走 `|| []` / `if (reserved)`，会被**当成空表吞掉** —— 调用方以为保留生效了。
    const rsv = reserved == null ? [] : reserved;
    if (typeof nameKey === 'function') opts.host.setNameKey(nameKey, rsv);
    else opts.host.reserveTools(rsv);
    return opts.host;
  }
  const hostOptions = { ...(opts.hostOptions || {}) };
  if (opts.reservedTools != null) hostOptions.reservedTools = opts.reservedTools;
  if (opts.nameKey != null) hostOptions.nameKey = opts.nameKey;
  // `reservedTools` 的类型校验在 PluginHost 构造器里（非数组 → RESERVED_TOOLS_INVALID，不静默变成单字符集）。
  return new PluginHost(hostOptions);
}

/**
 * 是否是**可用的**宿主（`PluginHost` 或其等价物）：P5 要求任何单点失败只诊断、不抛。
 * 复用路径还会调 `reserveTools` / `setNameKey`，故五个方法都得有（否则会以 `PLUGIN_HOST_INIT_FAILED`
 * 之类的模糊码报出来，而不是说清「你给的 host 不对」）。
 * 属性访问本身也可能抛（Proxy / 抛错 getter）→ **整个判定不得抛**：判定抛了，兜底就白设了。
 */
function isUsableHost(h) {
  try {
    return (
      !!h &&
      typeof h === 'object' &&
      typeof h.tools === 'function' &&
      typeof h.register === 'function' &&
      typeof h.assembleSync === 'function' &&
      typeof h.reserveTools === 'function' &&
      typeof h.setNameKey === 'function'
    );
  } catch {
    return false;
  }
}

/** 诊断文案用的类型描述（对象也报出构造名，便于定位误传的是谁）。不得抛（同 {@link isUsableHost}）。 */
function describe(v) {
  if (v == null) return String(v);
  try {
    if (typeof v === 'object') return v.constructor ? v.constructor.name : 'object';
    return typeof v;
  } catch {
    return 'object';
  }
}

/** 读宿主现有工具表，**不得抛**（P5）：病灶宿主（方法抛错）也只交空表，不让启动崩。 */
function safeTools(host) {
  try {
    const t = host.tools();
    // 声明是 `any[]`；非数组（病灶宿主返回垃圾）一律交空表，别把非数组塞进调用方的 `for/of` 里。
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

/** {@link hostFrom} 的**不抛**包装（P5）：抛错时退回传入的宿主（未被半改）并交出诊断。 */
function safeHostFrom(opts) {
  try {
    return { host: hostFrom(opts), error: null };
  } catch (e) {
    const info = errorInfo(e);
    return {
      // 传入的宿主**必须是可用宿主**才退回：误传字符串/普通对象时退回它，后续 `host.tools()` 会 TypeError。
      host: isUsableHost(opts.host) ? opts.host : null,
      error: { code: info.code || 'PLUGIN_HOST_INIT_FAILED', message: info.message },
    };
  }
}

/**
 * `target` 是否落在 `dir` 之内。
 *
 * 两层判定，缺一不可：
 * 1. **路径层**：`relative` 语义（不能用字符串前缀 —— `/x/ab` 是 `/x/abc` 的前缀但不是其父目录）。
 *    注意 `rel === '..'` 与 `rel.startsWith('../')` 都要判：只判 startsWith('..') 会把
 *    **目录内**名为 `..weird.js` 的合法文件误判为越界。
 * 2. **真实路径层**：符号链接可把入口指到目录之外，字符串判定看不出来 → 再比 `realpathSync`。
 */
function isInside(dir, target) {
  const rel = relative(dir, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  try {
    const realRel = relative(realpathSync(dir), realpathSync(target));
    return !(realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel));
  } catch {
    return true; // 目标暂时不存在 → 交给 require 去报（有诊断，不静默）
  }
}

/**
 * 是否**普通文件**（排除目录 / FIFO / 设备 / socket）。
 *
 * 为什么必须判定：`existsSync` 对**命名管道**（FIFO）也为真，而 `readFileSync` 打开 FIFO 会
 * **永久阻塞**——宿主在启动期挂死，且**零诊断**（比抛错更糟：连一条错误都没有）。判定本身不得抛（P5）。
 */
function isRegularFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * 剥掉首字节 UTF-8 BOM。
 * BOM 是**编码签名**不是内容，却会让「以 `^---` 锚定 frontmatter」的解析器整条失配
 * （`agent-core` 的 `parseSkillMarkdown`）→ 技能被丢弃，而「另存为 UTF-8（带 BOM）」是常见编辑器默认。
 * 在**读字节的边界**（本装载器）剥掉，下游拿到的正文与解析器预期一致。
 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 清单里的**路径字段**（`entry` / `skill`）取值：
 * `null`/缺省 → `null`（=没写）；**写了但类型不对** → 抛 `PLUGIN_<FIELD>_INVALID`。
 *
 * 为什么不能只靠 `parseManifest` 的归一：它把非字符串归一成 `null` —— 于是「写了却写错类型」
 * 被静默当成「没写」（配置错误被吞掉）；且直接拿原值给 `resolve` 会抛 `ERR_INVALID_ARG_TYPE`
 * （Node 内部码，落在诊断里既不是本包的码、也说不清是谁写错了）。
 */
function declaredPath(v, field, id) {
  if (v == null) return null;
  if (typeof v !== 'string' || !v.trim()) {
    throw new PluginHostError(
      `PLUGIN_${field.toUpperCase()}_INVALID`,
      `插件 ${id} 的 ${field} 必须是非空字符串，收到 ${describe(v)}`,
    );
  }
  return v;
}

/** 装配 + 汇总诊断（装配抛错也**不升**：记入 errors，宿主照常返回）。 */
function finish(host, dir, discovered, ignored, errors, skills, assembleOpts) {
  let activated = [];
  try {
    const res = host.assembleSync(assembleOpts);
    activated = res.activated;
    for (const er of res.errors) {
      // 装配期错误由**宿主**产出，只认 id、**不带 dir** —— 但诊断要能定位到「哪个目录」，
      // 否则运维只能拿 id 去猜目录名。这里按 id 回填 dir（查不到就保持原样，不编造）。
      const d = discovered.find((x) => x.id === er.id);
      errors.push(d && er.dir == null ? { ...er, dir: d.dir } : er);
    }
  } catch (e) {
    const info = errorInfo(e);
    errors.push({ code: info.code || 'ASSEMBLE_FAILED', message: info.message });
  }
  // **只交出「被激活」插件的技能正文**。注册与装配是两件事：一个插件可能登记成功、却因工具撞名
  // （`TOOL_NAME_RESERVED` / 清洗名塌陷）在装配期被拒 —— 若照旧把它声明的正文交出去，模型就会读到
  // 「用 X 工具…」的指令，而那个工具**刚被丢弃**：提示词与工具表互相打脸，且用户无从察觉。
  // 被拒的插件，连正文一起丢（工具与正文同进退）。
  //
  // **这条判据的边界（写清楚，免得被当成 bug）**：正文跟着「装配结果」走，所以
  // ①`assembleSync` 整体抛错 → 零激活 → **所有**正文都不交出；②`assemble: { skipKinds }` 跳过的插件
  // 也不交出正文。两者都是同一句话的推论：**没被装配的东西，不该往 prompt 里放**（否则提示词会描述
  // 一个不存在的世界）。api 侧现按档传 `assemble`（生产 `requirePolicy`、非生产 `skipKinds:['policy']`，
  // 见 `services/api/src/modules/agent/agent-plugins.ts`），故本判据在 api 套件中已外显（authz 技能若有，测试档不交）。
  const liveSkills = skills.filter((s) => activated.includes(s.id));
  return { host, tools: safeTools(host), skills: liveSkills, diagnostics: { dir, discovered, activated, ignored, errors } };
}
