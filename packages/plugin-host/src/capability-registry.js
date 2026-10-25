/**
 * CapabilityRegistry —— 能力索引（capability → [plugin]）+ 插件 id 唯一性。
 *
 * 「依赖倒置」的落点：宿主只写 `registry.resolve('world.scene')`，不 pin 具体实现；
 * 同 kind 多插件按 provides 匹配共存。撞名（同 id）→ 拒绝并诊断（对标 OpenClaw 重名拒绝）。
 */
import { PluginManifestError } from './manifest.js';

export class CapabilityRegistry {
  constructor() {
    /** @type {Map<string, {manifest: object, impl: any}>} */
    this._byId = new Map();
    /** @type {Map<string, Set<string>>} capability -> plugin ids */
    this._byCapability = new Map();
    /** @type {Map<string, Set<string>>} kind -> plugin ids */
    this._byKind = new Map();
  }

  /**
   * @param {object} manifest 已 parseManifest 的清单
   * @param {any} impl 插件实现（可空——清单即可声明能力）
   */
  add(manifest, impl = null) {
    const { id, kind, provides } = manifest;
    if (this._byId.has(id)) {
      throw new PluginManifestError('DUPLICATE_PLUGIN_ID', `插件 id 撞名，拒绝加载: ${id}`);
    }
    this._byId.set(id, { manifest, impl });

    if (!this._byKind.has(kind)) this._byKind.set(kind, new Set());
    this._byKind.get(kind).add(id);

    for (const cap of provides) {
      if (!this._byCapability.has(cap)) this._byCapability.set(cap, new Set());
      this._byCapability.get(cap).add(id);
    }
    return this;
  }

  has(id) {
    return this._byId.has(id);
  }

  get(id) {
    return this._byId.get(id) || null;
  }

  /** @returns {Array<{manifest: object, impl: any}>} 提供该能力的插件（按注册序） */
  resolve(capability) {
    const ids = this._byCapability.get(capability);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._byId.get(id));
  }

  /** @returns {Array<{manifest: object, impl: any}>} */
  getByKind(kind) {
    const ids = this._byKind.get(kind);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._byId.get(id));
  }

  all() {
    return Array.from(this._byId.values());
  }

  /** 供诊断/清单：能力 → 提供者 id 列表。 */
  capabilityIndex() {
    const out = {};
    for (const [cap, ids] of this._byCapability) out[cap] = Array.from(ids);
    return out;
  }

  /** id → 该插件声明的能力/依赖/信任描述（不含实现、不含密钥）。 */
  describe(id) {
    const entry = this._byId.get(id);
    if (!entry) return null;
    const { manifest } = entry;
    return {
      id: manifest.id,
      name: manifest.name,
      kind: manifest.kind,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      provides: manifest.provides,
      requires: manifest.requires,
      trust: manifest.trust,
    };
  }
}
