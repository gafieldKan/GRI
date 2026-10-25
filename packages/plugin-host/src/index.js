/**
 * @gri/plugin-host —— GRI 插件宿主（「一切皆插件」的落地基座）。
 *
 * 核心保持小而稳：只认**清单**（`plugin.json`）与**契约**（能力/生命周期/信任边界），不认实现。
 * 装配顺序显式可配；**鉴权/授权（kind='policy'）恒最后组装且可缺省**——组件测试免搭权限。
 *
 * 见 `docs/PLUGIN_ARCHITECTURE.md`（总则）、`docs/AGENT_SKILL_PLUGIN_CONTRACT.md`（P-3 契约）。
 */
export {
  DEFAULT_KINDS,
  HOST_API_VERSION,
  PluginManifestError,
  parseManifest,
  assemblyOrder,
} from './manifest.js';
export { CapabilityRegistry } from './capability-registry.js';
export { PluginHost, PluginHostError } from './host.js';
export { loadPlugins } from './loader.js';
