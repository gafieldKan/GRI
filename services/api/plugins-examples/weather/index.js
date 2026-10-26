/**
 * weather —— 「第三方外部插件」最小样例（W2.5）。
 *
 * 它的意义**不是天气**，而是**证明**：一个与教育无关的人，只要放一个目录进去，
 * 就能给 AI 教师加一个可列、可调、可卸的工具 —— 不必改宿主源码、不必重编译。
 *
 * 契约三条红线（docs/AGENT_SKILL_PLUGIN_CONTRACT.md §一）在此逐条体现：
 * 1. **只描述能力**：唯一的外部依赖是工具原语 `@gri/agent-core` 的 `makeTool`（**不是**业务包）——
 *    不 import 任何 `@gri/*` 业务模块，不读密钥 / 端点 / 环境变量（能力由宿主经 ctx 注入）。
 *    （正文里刻意不出现密钥/端点/环境变量的**字面标识符**，好让验收脚本能按「零出现」硬断言。）
 * 2. **工具名全局唯一**：`weather.lookup` 不在宿主保留表（内建 13 + `agent.delegate`）内 ——
 *    若撞名，宿主会在装配期拒绝本插件并诊断（`TOOL_NAME_RESERVED`）。
 * 3. 无需任何配置 / 密钥引用（本样例压根不需要配置）。
 *
 * 实现刻意**确定性、离线**：不联网、不读环境，使端到端断言稳定可复现
 * （真实插件当然可以联网 —— 联网能力由宿主部署决定，见 plugin-host README「信任边界」）。
 */
const { makeTool } = require('@gri/agent-core');

// 离线桩数据：让「可调」这条判据有一条**确定的**结果可断言。
const CITIES = {
  北京: { temp: 12, sky: '晴' },
  上海: { temp: 18, sky: '多云' },
};

module.exports = {
  tools: () => [
    makeTool({
      name: 'weather.lookup',
      description: '查询某城市当前天气（示例外部能力；离线确定性桩，不联网）。',
      inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      category: 'integration',
      async execute(_ctx, args) {
        const w = CITIES[args.city];
        return w ? { city: args.city, ...w } : { city: args.city, found: false };
      },
    }),
  ],
};
