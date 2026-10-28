/**
 * socratic —— 苏格拉底话术模板库（W2.4b：自 `modules/tuition/agents/socratic-templates.ts` 迁出）。
 *
 * 内容：`socratic.render(key, ctx)` —— 按 `{subject,type,difficulty,stage}` 取模板 + 回退链 + 变量插值。
 * 逻辑**逐字**自原 `SocraticTemplates` 迁入；改为**自包含**（不 import 任何业务模块，契约 §一红线）。
 *
 * 跨边界判错（W2.4b 一处真等价点）：错误类**自带 `name`**（'MissingTemplateError' /
 * 'MissingTemplateVariableError'）—— 消费方（宿主 controller）在**插件边界外**，`instanceof` 因类身份不同会失效，
 * 故按 `error.name` 判；宿主已同步改判。
 */
const ANY = '*';

/** 全局 stage 基模板（所有槽位的最终回退）。 */
const BASE_TEMPLATES = {
  hint:
    '关于「{knowledgePoint}」，先别急着要答案。你已经尝试 {attemptCount} 次了——回忆一下相关的定义或公式，' +
    '从题目给出的已知条件入手，说说你想到的第一步。',
  scaffold:
    '我们把它拆成小步骤，按你 {studentLevel} 的水平完全能跟上：①先圈出已知条件；' +
    '②回忆「{knowledgePoint}」的核心公式；③把条件代入并化简。你先完成前两步，卡住了我再给下一步。',
  solution:
    '好，我们一起完整解一遍「{knowledgePoint}」。你之前尝试了 {attemptCount} 次，这里的突破口是：先理清已知与所求，' +
    '再套用核心公式逐步推导，最后得出结果。看完请遮住答案，自己独立再做一遍。',
};

/** 该键无任何模板（含回退链）可用。`name` 供跨边界判错。 */
class MissingTemplateError extends Error {
  constructor(key) {
    super(`无匹配模板：${key.subject}/${key.type}/${key.difficulty}/${key.stage}`);
    this.name = 'MissingTemplateError';
    this.key = key;
  }
}

/** 模板引用了 ctx 未提供的变量。`name` 供跨边界判错。 */
class MissingTemplateVariableError extends Error {
  constructor(variable) {
    super(`模板变量缺失：{${variable}}（请在 SocraticContext 中提供）`);
    this.name = 'MissingTemplateVariableError';
    this.variable = variable;
  }
}

class SocraticTemplates {
  constructor() {
    this.registry = new Map();
    this._registerDefaults();
  }

  /** 组装 Map 键（与 TemplateKey 一一对应）。 */
  _key(subject, type, difficulty, stage) {
    return [subject, type, difficulty, stage].join('|');
  }

  /** 注册模板（同键覆盖）。 */
  register(key, fn) {
    this.registry.set(this._key(key.subject, key.type, key.difficulty, key.stage), fn);
    return this;
  }

  /** 是否已注册**精确键**（不含回退）。 */
  has(key) {
    return this.registry.has(this._key(key.subject, key.type, key.difficulty, key.stage));
  }

  /** 已注册模板数。 */
  get size() {
    return this.registry.size;
  }

  /** 渲染：解析模板 → 插值。缺模板/缺变量明确报错。 */
  render(key, ctx) {
    const fn = this._resolve(key);
    const template = fn(ctx);
    return this._interpolate(template, ctx);
  }

  /** 回退链：精确 → type 通配 → subject 通配 → 全局 stage 基模板。 */
  _resolve(key) {
    const chain = [
      this._key(key.subject, key.type, key.difficulty, key.stage),
      this._key(key.subject, key.type, ANY, key.stage),
      this._key(key.subject, ANY, ANY, key.stage),
      this._key(ANY, ANY, ANY, key.stage),
    ];
    for (const k of chain) {
      const fn = this.registry.get(k);
      if (fn) return fn;
    }
    throw new MissingTemplateError(key);
  }

  /** 变量插值：`{var}` → ctx[var]；缺失（undefined/null/空串）→ 报错。 */
  _interpolate(template, ctx) {
    return template.replace(/\{(\w+)\}/g, (_match, name) => {
      const value = ctx ? ctx[name] : undefined;
      if (value === undefined || value === null || value === '') {
        throw new MissingTemplateVariableError(name);
      }
      return String(value);
    });
  }

  /** 装配默认模板库：3 条全局 stage 基模板 + 若干题型特化（演示覆盖与覆盖写优先级）。 */
  _registerDefaults() {
    Object.keys(BASE_TEMPLATES).forEach((stage) => {
      this.registry.set(this._key(ANY, ANY, ANY, stage), () => BASE_TEMPLATES[stage]);
    });
    // 题型特化（覆盖通用基模板；仅登记「难度通配」及以上层级，用 registry 直写以承载通配键）
    this._setWildcard('math', 'single-choice', ANY, 'hint',
      '这是一道单选题。别急着选——先把明显错误的选项划掉，再回到「{knowledgePoint}」的定义判断剩下的选项。');
    this._setWildcard('math', 'fill', ANY, 'hint',
      '这是一道填空题。先看清要求填什么，再回忆「{knowledgePoint}」对应的公式，把已知量代进去算算看。');
    this._setWildcard('math', 'solution', ANY, 'scaffold',
      '解答题按步骤给分。以你 {studentLevel} 的进度，先写出「{knowledgePoint}」的已知与求解目标，再一步步推导，每步都写出依据。');
  }

  /** 直写通配键（供内置模板装配；避开 TemplateKey 的精确类型约束）。 */
  _setWildcard(subject, type, difficulty, stage, template) {
    this.registry.set(this._key(subject, type, difficulty, stage), () => template);
  }
}

// 单例（与迁移前 Nest provider 的进程级单例同语义）；宿主解析 `socratic.render` 即拿此实例。
module.exports = new SocraticTemplates();
module.exports.SocraticTemplates = SocraticTemplates;
module.exports.MissingTemplateError = MissingTemplateError;
module.exports.MissingTemplateVariableError = MissingTemplateVariableError;
