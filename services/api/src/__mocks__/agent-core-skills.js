/**
 * `@gri/agent-core` 技能面（`parseSkillMarkdown` + `SkillRegistry`）的 **CJS 替身**
 * （供各 agent spec 的 `jest.mock` 工厂引用）。
 *
 * 为什么需要：`@gri/agent-core` 是 ESM（`type: module`），jest 的 CJS 注册表不解析它的 `export`
 * —— 故各 spec 用手写替身重定向它（见各 spec 的 `jest.mock('@gri/agent-core', …)`）。
 * 本文件把其中的 `parseSkillMarkdown` **只写一份**，避免 4 个 spec 各抄一遍后互相漂移。
 *
 * 语义对齐真件 `packages/agent-core/src/skill.js`（frontmatter 取 name/description/tools/
 * instructions、正文 `trim()`、缺 `name` 抛错）。真件的完整行为由 agent-core 自己的
 * `node --test` 套件覆盖；本替身只保证 api 侧断言（技能名/正文/解析失败）成立。
 */
function parseSkillMarkdown(md) {
  const text = String(md || '');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const instructions = (fm ? fm[2] : text).trim();
  const meta = {};
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      }
      meta[m[1]] = val;
    }
  }
  if (!meta.name) throw new Error('SKILL.md 缺 frontmatter name');
  return {
    name: String(meta.name).trim(),
    description: String(meta.description || '').trim(),
    tools: Array.isArray(meta.tools) ? meta.tools : [],
    instructions: instructions || `（skill ${meta.name}）`,
  };
}

/**
 * `SkillRegistry` 的替身：只实现 spec 会用到的那几个方法，语义对齐真件
 * （`register` 归一 + `list` 只回启用项 + `instructionsBlock` 拼 `## 技能：<name>（<desc>）`）。
 * 真件的完整行为由 agent-core 自己的 `node --test` 覆盖。
 */
class SkillRegistry {
  constructor() {
    this._skills = new Map();
  }
  register(def) {
    const s = {
      name: def.name,
      description: def.description || '',
      tools: def.tools || [],
      instructions: def.instructions || def.prompt || def.content || '',
      enabled: def.enabled === undefined ? true : !!def.enabled,
    };
    if (!s.name) throw new Error('skill 缺 name');
    this._skills.set(s.name, s);
    return this;
  }
  registerAll(defs) {
    for (const d of defs) this.register(d);
    return this;
  }
  has(name) {
    return this._skills.has(name);
  }
  get(name) {
    return this._skills.get(name) || null;
  }
  list({ includeDisabled = false } = {}) {
    return Array.from(this._skills.values()).filter((s) => includeDisabled || s.enabled);
  }
  instructionsBlock() {
    const active = this.list();
    if (!active.length) return '';
    return active.map((s) => `## 技能：${s.name}（${s.description}）\n${s.instructions}`).join('\n\n');
  }
  registerMarkdown(md) {
    return this.register(parseSkillMarkdown(md));
  }
}

module.exports = { parseSkillMarkdown, SkillRegistry };
