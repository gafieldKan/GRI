# tutor —— 教学技能（`agent.skill`）

**做什么**：把「学情诊断 → 讲解 → 测验」的完整教师流程，作为**技能正文**并入每生 AI 教师的
system prompt。此前这段正文硬编码在 `src/modules/agent/teaching-tools.ts` 的 `skills()` 里，
现改为 `SKILL.md`（本插件声明 `skill: "./SKILL.md"`），由 `@gri/plugin-host` 在宿主启动期从目录装载。

**为什么**：技能正文是**内容**，不是宿主逻辑。抽成插件后，换/加一套教法（如小学低段话术、
错题冲刺专线）只要**放一个目录**，不必改并重新编译 `services/api` —— 这正是
`docs/PLUGIN_ARCHITECTURE.md`「一切皆插件」与 `docs/AGENT_SKILL_PLUGIN_CONTRACT.md` P-3 的落点。

**契约**：
- 本插件**只声明能力**，不 import `@gri/*` 业务模块、不碰 `apiKey`/DB（工具由宿主注入）。
- `SKILL.md` 的 frontmatter 须有 `name`（唯一）与 `description`；正文整体并入 prompt。
- 技能正文的 `tools` 由宿主接线时补齐（= 当次装配的工具表），插件自身不复制工具定义。
- 正文里的工具名（`lesson.submit` 等）是**宿主工具表里的名字**，不是本插件的实现。

**常见改法**：
- 改教法/话术 → 直接编辑 `SKILL.md`（**无需改代码**；重启宿主后生效）。
- 新增一套并行教法 → 复制本目录改为新 `id`，另写 `SKILL.md`；只要 `name` 不撞即可共存。
- 彻底停用 → 删掉 `services/api/plugins/tutor/`（宿主启动期会记 `PLUGIN_MANIFEST_MISSING` 目录级
  诊断，教师仍照常启动，但**会丢掉教学正文**——系统提示词里就没有技能块了）。

**注意**：`SKILL.md` 是**运行时资产**，随插件进镜像（`.dockerignore` 对 `services/api/plugins/**/*.md`
有例外，别把那条规则删了）。
