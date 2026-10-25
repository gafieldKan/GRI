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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { PluginHost } from './host.js';
import { parseManifest } from './manifest.js';

/**
 * 同步扫描并装配一个插件目录。
 *
 * @param {object} opts
 * @param {string} [opts.dir] 插件根目录（其每个子目录含一份 `plugin.json`）
 * @param {PluginHost} [opts.host] 复用既有宿主（缺省新建；`hostOptions` 仅在新建时生效）
 * @param {object} [opts.hostOptions] 传给 `new PluginHost()` 的选项（kinds / context / observability…）
 * @param {object} [opts.assemble] 传给 `assembleSync()` 的选项（`skipKinds` / `requirePolicy`）
 * @param {string} [opts.manifestFile='plugin.json'] 清单文件名
 * @param {string} [opts.entryFile='index.js'] 清单未写 `entry` 时的入口名
 * @returns {{host: PluginHost, tools: any[], diagnostics: {dir: string|null, discovered: object[], activated: string[], errors: object[]}}}
 */
export function loadPlugins(opts = {}) {
  const manifestFile = opts.manifestFile || 'plugin.json';
  const entryFile = opts.entryFile || 'index.js';
  const host = opts.host || new PluginHost(opts.hostOptions || {});
  const discovered = [];
  const errors = [];

  if (!opts.dir) {
    errors.push({ code: 'PLUGINS_DIR_UNSET', message: '未指定插件目录（dir）—— 零插件装配' });
    return finish(host, null, discovered, errors, opts.assemble || {});
  }
  if (!existsSync(opts.dir) || !statSync(opts.dir).isDirectory()) {
    errors.push({ code: 'PLUGINS_DIR_MISSING', dir: opts.dir, message: `插件目录不存在：${opts.dir}（零插件装配，宿主照常启动）` });
    return finish(host, opts.dir, discovered, errors, opts.assemble || {});
  }

  // 以插件根目录为基准的 require：入口文件里的裸模块（如 '@gri/agent-core'）按**入口自身位置**向上解析。
  const req = createRequire(join(opts.dir, '__plugin_loader__.js'));

  for (const name of readdirSync(opts.dir).sort()) {
    const pluginDir = join(opts.dir, name);
    let isDir = false;
    try {
      isDir = statSync(pluginDir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir || !existsSync(join(pluginDir, manifestFile))) continue; // 非插件目录 → 静默跳过

    try {
      const raw = JSON.parse(readFileSync(join(pluginDir, manifestFile), 'utf8'));
      // **先校验清单再执行入口**：不合法清单绝不触发入口代码（否则等于让坏插件先跑一遍）。
      parseManifest(raw, { kinds: host.kinds, apiVersion: host.apiVersion });
      const entry = resolve(pluginDir, raw.entry || `./${entryFile}`);
      const loaded = req(entry);
      const impl = (loaded && loaded.default) || loaded || null;
      const manifest = host.register(raw, impl);
      discovered.push({ id: manifest.id, dir: name, kind: manifest.kind, entry });
    } catch (e) {
      errors.push({
        dir: name,
        code: (e && e.code) || 'PLUGIN_LOAD_FAILED',
        message: e && e.message ? e.message : String(e),
      });
    }
  }

  return finish(host, opts.dir, discovered, errors, opts.assemble || {});
}

/** 装配 + 汇总诊断（装配抛错也**不升**：记入 errors，宿主照常返回）。 */
function finish(host, dir, discovered, errors, assembleOpts) {
  let activated = [];
  try {
    const res = host.assembleSync(assembleOpts);
    activated = res.activated;
    for (const er of res.errors) errors.push(er);
  } catch (e) {
    errors.push({ code: (e && e.code) || 'ASSEMBLE_FAILED', message: e && e.message ? e.message : String(e) });
  }
  return { host, tools: host.tools(), diagnostics: { dir, discovered, activated, errors } };
}
