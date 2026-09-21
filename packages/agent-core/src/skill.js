/**
 * Skill —— 平台级技能（仿 OpenClaw Skills / 本仓 Claude Code skills 的浓缩）。
 * 一个 skill = SKILL.md 清单（frontmatter name/description + 正文指令）+ 可选的工具集。
 * 加载后：把「正文指令」并进 AgentCore system prompt，把「tools」注册进 ToolRegistry。
 *
 * SKILL.md 格式：
 *   ---
 *   name: skill-name             # 必填，唯一
 *   description: 一句话用途       # 必填，供 AgentCore/用户识别
 *   tools: [a.b, c.d]            # 可省：本 skill 依赖的工具名
 *   ---
 *   # 指令正文（会被整体塞进 system prompt）
 */

/** 解析 SKILL.md 文本 → {name, description, tools, instructions}。 */
export function parseSkillMarkdown(md) {
  const text = String(md || '');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const instructions = (fm ? fm[2] : text).trim();
  const frontmatter = fm ? fm[1] : '';
  const meta = {};

  if (fm) {
    for (const line of frontmatter.split(/\r?\n/)) {
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

/** 把已解析的 skill 对象规范成统一形状。 */
export function normalizeSkill(def) {
  if (def && def.instructions != null && def.name) return def; // 已是 parsing 产物
  return {
    name: def.name,
    description: def.description || '',
    tools: def.tools || [],
    instructions: def.instructions || def.prompt || def.content || '',
  };
}