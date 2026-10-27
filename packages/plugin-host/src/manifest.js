/**
 * Plugin manifest —— `plugin.json` 的解析与校验（manifest-first：宿主只认清单，不认实现）。
 *
 * **本 `parseManifest` 即 `plugin.json` 的正式 schema 基线**（裁决见 `docs/AGENT_SKILL_PLUGIN_CONTRACT.md` §五 #3）；
 * P-1/P-2/P-4 一律共用，不再各立 manifest 方言。字段/默认/校验码由本函数与 `tests/plugin-host.test.js` 锁定。
 *
 * 形状（`docs/PLUGIN_ARCHITECTURE.md` §2.1 + `docs/AGENT_SKILL_PLUGIN_CONTRACT.md` 的必需子集）：
 * {
 *   "id": "tutor-math",              // 必填，唯一，kebab/dotted（小写字母数字 + . -）
 *   "name": "数学辅导技能",           // 可选，人读名
 *   "kind": "agent.skill",           // 必填，决定由谁装配（见 DEFAULT_KINDS）
 *   "apiVersion": "1",               // 必填，类别契约的语义版本；宿主按此拒绝不兼容插件
 *   "version": "1.0.0",              // 可选，插件自身版本
 *   "description": "…",              // 可选
 *   "entry": "./index.js",           // 可选，入口（加载器用；本包不负责 import）
 *   "skill": "./SKILL.md",           // 可选（agent.skill），正文并入 system prompt
 *   "tools": ["question.lookup"],    // 可选，本插件**依赖**的工具名（由 host 解析后提供）
 *   "provides": ["teaching.math"],   // 可选，声明的能力（capability）——宿主据此装配
 *   "requires": ["edu.domain"],      // 可选，依赖的宿主/其他插件能力（能力依赖，非路径依赖）
 *   "hooks": ["onTurn"],             // 可选，订阅的生命周期钩子
 *   "config": { "schema": "./config.schema.json", "secretRefs": [] },  // 可选
 *   "trust": { "boundary": "in-process", "network": false, "filesystem": "none" } // 可选，信任边界描述符
 * }
 */

/** 默认插件类别 + 装配优先级（数字小者先装；`policy` 恒最后）。 */
export const DEFAULT_KINDS = Object.freeze({
  'knowledge.content': 10,
  'knowledge.taxonomy': 10,
  'world.scene': 20,
  'agent.skill': 30,
  'agent.engine': 40,
  'auth.identity': 50,
  'integration': 50,
  // 鉴权/授权是横切关注点：**最后一个装**（可缺省 → 组件测试免搭权限）
  'policy': 900,
});

/** 宿主支持的契约版本。插件 apiVersion 与宿主不一致 → 拒绝加载。 */
export const HOST_API_VERSION = '1';

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** 清单校验失败。`code` 供调用方分支（不靠 message 文本）。 */
export class PluginManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PluginManifestError';
    this.code = code;
  }
}

function asStringArray(v, field, id) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) {
    throw new PluginManifestError('INVALID_FIELD', `插件 ${id} 的 ${field} 必须是非空字符串数组`);
  }
  return v.map((s) => s.trim());
}

/**
 * 解析并校验一个清单对象（已是对象；读文件的加载器自行 JSON.parse）。
 * @param {object} raw
 * @param {{ kinds?: Record<string, number>, apiVersion?: string, source?: string }} [opts]
 * @returns {object} 规范化清单（冻结）
 */
export function parseManifest(raw, opts = {}) {
  const kinds = opts.kinds || DEFAULT_KINDS;
  const hostApiVersion = opts.apiVersion || HOST_API_VERSION;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PluginManifestError('NOT_AN_OBJECT', '插件清单必须是对象');
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) throw new PluginManifestError('MISSING_ID', '插件清单缺 id');
  if (!ID_RE.test(id)) {
    throw new PluginManifestError('INVALID_ID', `插件 id 非法（应为 kebab/dotted 小写）: ${id}`);
  }

  const kind = typeof raw.kind === 'string' ? raw.kind.trim() : '';
  if (!kind) throw new PluginManifestError('MISSING_KIND', `插件 ${id} 缺 kind`);
  if (!Object.prototype.hasOwnProperty.call(kinds, kind)) {
    throw new PluginManifestError('UNKNOWN_KIND', `插件 ${id} 的 kind 不在宿主支持集: ${kind}`);
  }

  const apiVersion = raw.apiVersion == null ? hostApiVersion : String(raw.apiVersion);
  if (apiVersion !== hostApiVersion) {
    throw new PluginManifestError(
      'INCOMPATIBLE_API_VERSION',
      `插件 ${id} apiVersion=${apiVersion} 与宿主 ${hostApiVersion} 不兼容`,
    );
  }

  const trust = raw.trust && typeof raw.trust === 'object' && !Array.isArray(raw.trust) ? raw.trust : {};
  const config = raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config) ? raw.config : {};

  return Object.freeze({
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    kind,
    apiVersion,
    version: raw.version != null ? String(raw.version) : '0.0.0',
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    entry: typeof raw.entry === 'string' ? raw.entry : null,
    skill: typeof raw.skill === 'string' ? raw.skill : null,
    tools: asStringArray(raw.tools, 'tools', id),
    provides: asStringArray(raw.provides, 'provides', id),
    requires: asStringArray(raw.requires, 'requires', id),
    hooks: asStringArray(raw.hooks, 'hooks', id),
    config: Object.freeze({
      schema: typeof config.schema === 'string' ? config.schema : null,
      secretRefs: asStringArray(config.secretRefs, 'config.secretRefs', id),
    }),
    trust: Object.freeze({
      boundary: typeof trust.boundary === 'string' ? trust.boundary : 'in-process',
      network: trust.network === true,
      filesystem: typeof trust.filesystem === 'string' ? trust.filesystem : 'none',
    }),
    source: opts.source || null,
  });
}

/** 装配顺序：按 kind 优先级升序，稳定排序（同 kind 保注册序）。 */
export function assemblyOrder(manifests, kinds = DEFAULT_KINDS) {
  return manifests
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const pa = kinds[a.m.kind] ?? 500;
      const pb = kinds[b.m.kind] ?? 500;
      return pa - pb || a.i - b.i;
    })
    .map((x) => x.m);
}
