/**
 * memory —— 首个「出厂插件」样例（W2.3 / 契约 P-3.1）。
 *
 * 内容：该生**长期记忆三件套**（memory.recall / memory.remember / memory.forget）——
 * 跨会话陪伴的底座。原先硬编码在 modules/agent/teaching-tools.ts，现按
 * docs/AGENT_SKILL_PLUGIN_CONTRACT.md 的 agent.skill 契约显性化为插件。
 *
 * 为什么是它当样例：它是**唯一不碰 SQL、不碰业务包**的一组工具（只用宿主经工具 ctx 注入的
 * `ctx.memory`），因而是「插件只描述能力」这条红线的干净样本。
 *
 * 三条硬约束（契约 §一）：① 不 import @gri/* 业务模块（只用工具原语 makeTool）；
 * ② 不读 apiKey/baseUrl（能力由宿主经 ctx 注入）；③ 工具名全局唯一（撞名由宿主拒绝）。
 *
 * 缩进刻意保留 6 空格：三块 makeTool 系**逐字节**自 teaching-tools.ts 搬迁，
 * 使 `diff` 即可证明「只是搬了个位置」。
 */
const { makeTool } = require('@gri/agent-core');

module.exports = {
  tools: ({ host }) => [

      makeTool({
        name: 'memory.recall',
        description: '读回该学生已存记忆（偏好/事实/掌握度），用于个性化。',
        async execute(ctx, args) {
          void args;
          const facts = await ctx.memory.list(ctx.entityId, { limit: 20 });
          return facts;
        },
      }),
      makeTool({
        name: 'memory.remember',
        description: '存一条关于该学生的长期记忆（偏好/事实），供以后所有会话使用。',
        inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
        async execute(ctx, args) {
          await ctx.memory.set(ctx.entityId, args.key, args.value, 1);
          return { saved: true, key: args.key };
        },
      }),
      makeTool({
        name: 'memory.forget',
        description: '删除该学生的一条长期记忆（当它已过时/记错/学生明确说"忘掉"时用）。key 与 memory.remember 写入的一致。',
        inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
        async execute(ctx, args) {
          await ctx.memory.delete(ctx.entityId, args.key);
          return { forgot: true, key: args.key };
        },
      }),

  ],
};
