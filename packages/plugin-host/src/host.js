/**
 * PluginHost —— 宿主装配器。核心保持小而稳：只认清单与契约，不认实现。
 *
 * 装配顺序：按 kind 优先级升序（见 DEFAULT_KINDS），**`policy`（鉴权/授权）恒最后**。
 * 可缺省性：`assemble({ skipKinds: ['policy'] })` 用于**组件测试**——不装策略插件时
 * `authorize()` 直接放行，其他组件的组装测试免去搭权限，提升测试效率。
 * 生产装配**恒含** policy（fail-closed）：生产档置 `assemble({ requirePolicy: true })`，
 * 缺 policy 即**拒绝装配**（抛 `POLICY_REQUIRED`）——把「后组装 ≠ 可缺省上线」从文档升为**代码闸门**。
 *
 * 装配有两个入口，**同一套语义**（排序/撞名/policy fail-closed）：`assemble()`（异步生命周期）与
 * `assembleSync()`（宿主启动期同步取工具定义；钩子返回 Promise 即拒绝，不降级）。
 */
import {
  parseManifest,
  assemblyOrder,
  DEFAULT_KINDS,
  HOST_API_VERSION,
} from './manifest.js';
import { CapabilityRegistry } from './capability-registry.js';

/** 宿主装配错误。`code` 供分支（不靠 message 文本）。 */
export class PluginHostError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PluginHostError';
    this.code = code;
  }
}

export class PluginHost {
  /**
   * @param {{kinds?: Record<string,number>, apiVersion?: string, context?: object, observability?: {event?: Function}}} [opts]
   */
  constructor(opts = {}) {
    this.kinds = opts.kinds || DEFAULT_KINDS;
    this.apiVersion = opts.apiVersion || HOST_API_VERSION;
    this.context = opts.context || {};
    this.observability = opts.observability || null;
    this.registry = new CapabilityRegistry();
    /** @type {Set<string>} 已激活插件 id */
    this._active = new Set();
    /** @type {Map<string,string>} tool 名 -> plugin id */
    this._toolOwners = new Map();
    /** @type {Array<object>} */
    this._tools = [];
    this._errors = [];
  }

  /** 注册一个插件（清单 + 可选实现）。撞名/非法清单 → 抛 PluginManifestError。 */
  register(manifestRaw, impl = null) {
    const manifest = parseManifest(manifestRaw, { kinds: this.kinds, apiVersion: this.apiVersion });
    this.registry.add(manifest, impl);
    this._emit('plugin.registered', { id: manifest.id, kind: manifest.kind });
    return manifest;
  }

  /** @param {Array<[object, any] | object>} entries */
  registerAll(entries) {
    for (const e of entries) {
      if (Array.isArray(e)) this.register(e[0], e[1] ?? null);
      else this.register(e, null);
    }
    return this;
  }

  /** 给插件的宿主接口（插件只经此拿宿主能力，不 import 宿主内部）。 */
  hostApi() {
    return {
      context: this.context,
      resolve: (capability) => this.resolve(capability),
      getByKind: (kind) => this.getByKind(kind),
      emit: (name, data) => this._emit(name, data),
    };
  }

  /**
   * 按序装配。install → activate；收集各插件提供的工具（撞名拒绝）。
   * @param {{skipKinds?: string[], requirePolicy?: boolean}} [opts]
   *   requirePolicy=true（生产档）：未被跳过且未提供 kind='policy' 插件 → 抛 `POLICY_REQUIRED`，
   *   且**在跑任何生命周期前**校验 —— 不半途生效（fail-closed）。
   * @returns {Promise<{activated: string[], skipped: string[], errors: object[]}>}
   */
  async assemble(opts = {}) {
    const skip = new Set(opts.skipKinds || []);
    const ordered = assemblyOrder(this.registry.all().map((e) => e.manifest), this.kinds);
    const activated = [];
    this._errors = [];

    // fail-closed 前置校验：发生在 install/activate 之前，避免「装了一半才报错」留下半装配状态。
    if (opts.requirePolicy) this._assertPolicyUsable(ordered, skip);

    for (const manifest of ordered) {
      if (skip.has(manifest.kind)) {
        this._emit('plugin.skipped', { id: manifest.id, kind: manifest.kind });
        continue;
      }
      const impl = this.registry.get(manifest.id)?.impl || null;
      try {
        await this._lifecycle(manifest, impl, 'install');
        await this._lifecycle(manifest, impl, 'activate');
        this._collectTools(manifest, impl);
        this._active.add(manifest.id);
        activated.push(manifest.id);
        this._emit('plugin.activated', { id: manifest.id, kind: manifest.kind });
      } catch (e) {
        const err = { id: manifest.id, kind: manifest.kind, error: e && e.message ? e.message : String(e) };
        this._errors.push(err);
        this._emit('plugin.error', err);
      }
    }
    // 后置校验（闭合 hole：policy 的 activate 抛错 → 未激活 → 仍会 fail-open）。
    // 生产档要求 policy 却因其激活期失败而不可用：**回滚本次已激活的插件**（不留半装配状态），再 fail-closed。
    if (opts.requirePolicy && !this.getByKind('policy').some((e) => typeof e.impl?.authorize === 'function')) {
      await this._rollback(activated);
      throw new PluginHostError(
        'POLICY_INACTIVE',
        'kind="policy" 插件未能激活（activate 失败）—— 授权闸门不可用；已回滚本次装配并拒绝（fail-closed）。',
      );
    }
    return { activated, skipped: Array.from(skip), errors: this._errors };
  }

  /**
   * **同步装配**：与 {@link assemble} 同语义（同一套 kind 排序 / 撞名拒绝 / policy fail-closed），
   * 但要求各插件的 `install`/`activate` **不返回 Promise**。用于宿主启动期**同步**取工具定义的场景
   * （NestJS 服务的 `toolDefs()` 是同步的，且单测以 `new Service(db)` 直接构造、不走异步生命周期）。
   *
   * 异步生命周期不予降级：钩子返回 thenable → 该插件**不入装配**并记 `ASYNC_LIFECYCLE_UNSUPPORTED`
   * 诊断（绝不半装配）。确需异步生命周期的宿主请改用 `assemble()`。
   *
   * @param {{skipKinds?: string[], requirePolicy?: boolean}} [opts]
   * @returns {{activated: string[], skipped: string[], errors: object[]}}
   */
  assembleSync(opts = {}) {
    const skip = new Set(opts.skipKinds || []);
    const ordered = assemblyOrder(this.registry.all().map((e) => e.manifest), this.kinds);
    const activated = [];
    this._errors = [];

    if (opts.requirePolicy) this._assertPolicyUsable(ordered, skip);

    for (const manifest of ordered) {
      if (skip.has(manifest.kind)) {
        this._emit('plugin.skipped', { id: manifest.id, kind: manifest.kind });
        continue;
      }
      const impl = this.registry.get(manifest.id)?.impl || null;
      try {
        this._lifecycleSync(manifest, impl, 'install');
        this._lifecycleSync(manifest, impl, 'activate');
        this._collectTools(manifest, impl);
        this._active.add(manifest.id);
        activated.push(manifest.id);
        this._emit('plugin.activated', { id: manifest.id, kind: manifest.kind });
      } catch (e) {
        const err = { id: manifest.id, kind: manifest.kind, error: e && e.message ? e.message : String(e) };
        if (e && e.code) err.code = e.code;
        this._errors.push(err);
        this._emit('plugin.error', err);
      }
    }
    // 后置校验（与 assemble 同 hole 闭合）：policy 激活期失败 → 回滚 + fail-closed。
    if (opts.requirePolicy && !this.getByKind('policy').some((e) => typeof e.impl?.authorize === 'function')) {
      this._rollbackSync(activated);
      throw new PluginHostError(
        'POLICY_INACTIVE',
        'kind="policy" 插件未能激活（activate 失败）—— 授权闸门不可用；已回滚本次装配并拒绝（fail-closed）。',
      );
    }
    return { activated, skipped: Array.from(skip), errors: this._errors };
  }

  isActive(id) {
    return this._active.has(id);
  }

  /** 仅返回**已激活**插件的条目。 */
  _activeEntries(filterFn = () => true) {
    return this.registry.all().filter((e) => this._active.has(e.manifest.id)).filter(filterFn);
  }

  /** 解析提供某能力的**已激活**插件。 */
  resolve(capability) {
    return this.registry.resolve(capability).filter((e) => this._active.has(e.manifest.id));
  }

  getByKind(kind) {
    return this.registry.getByKind(kind).filter((e) => this._active.has(e.manifest.id));
  }

  /** 已激活插件提供的工具定义（扁平）。 */
  tools() {
    return this._tools.slice();
  }

  /**
   * 授权闸门（横切）。**未装配 `policy` 插件 → 放行**（测试档默认）。
   * 生产档必须在装配时置 `requirePolicy:true`（否则缺 policy 会 fail-open）——见 `assemble()`。
   * 策略插件实现 `authorize(ctx, action) -> {allowed:boolean, reason?:string}`。
   * @returns {Promise<{allowed: boolean, reason?: string, by?: string}>}
   */
  async authorize(ctx, action) {
    const policies = this.getByKind('policy');
    if (policies.length === 0) return { allowed: true, reason: 'no-policy-assembled' };
    for (const { manifest, impl } of policies) {
      if (typeof impl?.authorize !== 'function') continue;
      const r = await impl.authorize(ctx, action);
      if (r && r.allowed === false) {
        return { allowed: false, reason: r.reason || 'denied', by: manifest.id };
      }
    }
    return { allowed: true };
  }

  /** 触发某生命周期钩子（仅订阅了该钩子的已激活插件）。 */
  async runHook(name, ctx) {
    const results = [];
    for (const { manifest, impl } of this._activeEntries((e) => e.manifest.hooks.includes(name))) {
      const fn = impl && (typeof impl[name] === 'function' ? impl[name] : impl.hooks && impl.hooks[name]);
      if (typeof fn !== 'function') continue;
      results.push({ plugin: manifest.id, value: await fn.call(impl, ctx, this.hostApi()) });
    }
    return results;
  }

  /**
   * 卸载：deactivate → uninstall；**无论钩子是否抛错，都保证从活动集/工具表摘除**（P5：不留半装配）。
   * 若被卸载插件的工具被他人依赖，诊断但不崩。钩子抛错 → 记为 warning（并走观测缝），不影响摘除。
   */
  async uninstall(id) {
    const entry = this.registry.get(id);
    if (!entry) return { ok: false, error: `未知插件: ${id}` };
    let warning;
    try {
      await this._lifecycle(entry.manifest, entry.impl, 'deactivate');
      await this._lifecycle(entry.manifest, entry.impl, 'uninstall');
    } catch (e) {
      warning = e && e.message ? e.message : String(e);
      this._emit('plugin.error', { id, error: warning });
    } finally {
      // 清理不依赖钩子成功：确保该插件不再活动、其工具全部移除（否则回滚会留半装配状态）。
      this._active.delete(id);
      this._tools = this._tools.filter((t) => this._toolOwners.get(t.name) !== id);
      for (const [tool, owner] of Array.from(this._toolOwners)) if (owner === id) this._toolOwners.delete(tool);
    }
    this._emit('plugin.uninstalled', { id, warning });
    return warning ? { ok: true, warning } : { ok: true };
  }

  /** 只读诊断（不含实现/密钥）。`policyAssembled=false` 表示授权当前 fail-open（仅测试档应如此）。 */
  diagnostics() {
    return {
      active: Array.from(this._active),
      errors: this._errors.slice(),
      tools: this._toolOwners.size,
      policyAssembled: this.getByKind('policy').length > 0,
      byKind: Object.fromEntries(Object.keys(this.kinds).map((k) => [k, this.getByKind(k).map((e) => e.manifest.id)])),
      trust: this._activeEntries().map((e) => ({ id: e.manifest.id, ...e.manifest.trust })),
    };
  }

  // ---- internals ----

  /**
   * policy 前置校验（fail-closed）：不仅要求**声明** kind='policy'，还要求其实现**真的提供 authorize**
   * —— 否则 stub 可蒙混过关（仍 fail-open）。`assemble` / `assembleSync` 共用同一份语义。
   */
  _assertPolicyUsable(ordered, skip) {
    const policyPlans = ordered.filter((m) => m.kind === 'policy' && !skip.has(m.kind));
    if (policyPlans.length === 0) {
      throw new PluginHostError(
        'POLICY_REQUIRED',
        '生产装配要求至少一个未被跳过的 kind="policy" 插件（fail-closed）。测试档请显式 requirePolicy:false 或 skipKinds:["policy"]。',
      );
    }
    const usable = policyPlans.some((m) => typeof this.registry.get(m.id)?.impl?.authorize === 'function');
    if (!usable) {
      throw new PluginHostError(
        'POLICY_NOT_IMPLEMENTED',
        'kind="policy" 插件存在但均未实现 authorize(ctx, action) —— 无法构成授权闸门，拒绝装配（fail-closed）。',
      );
    }
  }

  async _lifecycle(manifest, impl, phase) {
    const fn = impl && impl[phase];
    if (typeof fn === 'function') await fn.call(impl, this.hostApi());
  }

  /** 同步生命周期：钩子返回 thenable 即拒绝（不降级、不半装配）。 */
  _lifecycleSync(manifest, impl, phase) {
    const fn = impl && impl[phase];
    if (typeof fn !== 'function') return;
    const r = fn.call(impl, this.hostApi());
    if (r && typeof r.then === 'function') {
      throw new PluginHostError(
        'ASYNC_LIFECYCLE_UNSUPPORTED',
        `插件 ${manifest.id} 的 ${phase} 返回 Promise —— 同步装配不支持异步生命周期，请改用 assemble()。`,
      );
    }
  }

  /** 回滚已激活插件（逆序卸载）：fail-closed 后置校验失败时清场，避免留半装配状态。best-effort，不抛。 */
  async _rollback(ids) {
    for (const id of [...ids].reverse()) {
      try {
        await this.uninstall(id);
      } catch {
        /* 回滚不掩盖原始错误（POLICY_INACTIVE） */
      }
    }
  }

  /** {@link _rollback} 的同步版：同样的「摘除优先、钩子失败不掩盖原始错误」。 */
  _rollbackSync(ids) {
    for (const id of [...ids].reverse()) {
      const entry = this.registry.get(id);
      try {
        if (entry) {
          this._lifecycleSync(entry.manifest, entry.impl, 'deactivate');
          this._lifecycleSync(entry.manifest, entry.impl, 'uninstall');
        }
      } catch {
        /* 回滚不掩盖原始错误（POLICY_INACTIVE） */
      } finally {
        this._active.delete(id);
        this._tools = this._tools.filter((t) => this._toolOwners.get(t.name) !== id);
        for (const [tool, owner] of Array.from(this._toolOwners)) if (owner === id) this._toolOwners.delete(tool);
      }
    }
  }

  _collectTools(manifest, impl) {
    if (!impl) return;
    const raw = typeof impl.tools === 'function' ? impl.tools({ host: this.hostApi() }) : impl.tools;
    const tools = Array.isArray(raw) ? raw : [];
    // 先整体校验（撞名/无名）再提交 —— 避免半提交后插件报错却留下孤儿工具
    const seen = new Set();
    for (const t of tools) {
      const name = t && t.name;
      if (!name) throw new Error(`插件 ${manifest.id} 提供了无名工具`);
      if (seen.has(name)) throw new Error(`插件 ${manifest.id} 内工具名重复: ${name}`);
      seen.add(name);
      const owner = this._toolOwners.get(name);
      if (owner && owner !== manifest.id) {
        throw new Error(`工具名撞名，拒绝加载: ${name}（已被 ${owner} 提供，冲突插件 ${manifest.id}）`);
      }
    }
    for (const t of tools) {
      this._toolOwners.set(t.name, manifest.id);
      this._tools.push(t);
    }
  }

  _emit(name, data) {
    if (this.observability && typeof this.observability.event === 'function') {
      try {
        this.observability.event(name, data);
      } catch {
        /* 观测失败不影响装配 */
      }
    }
  }
}
