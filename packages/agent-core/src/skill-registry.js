import { parseSkillMarkdown, normalizeSkill } from './skill.js';

/**
 * SkillRegistry —— 技能清单注册表（内存）。
 * 技能来源两种：
 *   - 显式注册：register({name, description, instructions, tools}) —— Nest 端把教学技能打包进来。
 *   - 目录加载：loadDir(dir) 扫 KEBAB/SKILL.md 一次，cache 后由 Node 22 require(esm) 语义 import。
 *
 * AgentCore 装配 prompt 时：listActive() 的 instructions 并进 system prompt，tools 注册进 ToolRegistry。
 */
export class SkillRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._skills = new Map();
  }

  /** @param {object} def {name,description,instructions,tools?,enabled?} */
  register(def) {
    const s = normalizeSkill(def);
    if (!s.name) throw new Error('skill 缺 name');
    s.tools = s.tools || [];
    s.enabled = def.enabled === undefined ? true : !!def.enabled;
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

  /** 启用态技能清单（agent-core 装配指令用）。 */
  list({ includeDisabled = false } = {}) {
    return Array.from(this._skills.values()).filter((s) => includeDisabled || s.enabled);
  }

  /** 启用的技能并进 system prompt 的指令文本。 */
  instructionsBlock() {
    const active = this.list();
    if (!active.length) return '';
    return active
      .map((s) => `## 技能：${s.name}（${s.description}）\n${s.instructions}`)
      .join('\n\n');
  }

  /** 注册技能依赖的工具进 registry。tools 可为 makeTool 产物或 Tool def。 */
  mountTools(registry) {
    for (const s of this.list()) {
      for (const t of s.tools) registry.register(t);
    }
    return this;
  }

  /** 从 SKILL.md 文本注册单个技能。 */
  registerMarkdown(md) {
    return this.register(parseSkillMarkdown(md));
  }

  /** 扫目录加载 *.md 技能（惰性、一次性）。 */
  loadDir(fs, dir, { glob = ['*.md', '*/*.md'] } = {}) {
    const visited = new Set();
    const files = [];
    for (const pat of glob) {
      try {
        for (const f of fs.readdirSync(dir, { recursive: true })) {
          if (typeof f === 'string' && f.endsWith('.md') && !visited.has(f)) {
            visited.add(f);
            files.push(f);
          }
        }
      } catch {
        /* 目录缺失跳过 */
      }
    }
    for (const rel of files) {
      if (!rel.endsWith('.md')) continue;
      const p = pathJoinSafe(dir, rel);
      try {
        const md = fs.readFileSync(p, 'utf8');
        this.registerMarkdown(md);
      } catch {
        /* 单个坏 skill 跳过，不强撑整个加载 */
      }
    }
    return this;
  }
}

function pathJoinSafe(dir, rel) {
  if (dir.endsWith('/')) return dir + rel;
  return `${dir}/${rel}`;
}