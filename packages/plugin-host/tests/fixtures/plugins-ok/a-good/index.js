// ESM 入口（无顶层 await → Node 的 require(esm) 可同步载入）
export default {
  activate() {
    /* 同步生命周期：assembleSync 可装配 */
  },
  tools: () => [
    { name: 'good.echo', description: '回显参数', execute: async (_ctx, args) => ({ ok: true, args }) },
  ],
};
