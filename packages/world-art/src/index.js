/**
 * @gri/world-art —— 世界语言共享件入口
 *
 * 一份画法、两处复用（N2）：门户人本世界（apps/portal）与模块内容世界
 * （apps/web-ai-tutor 学习世界）都从这里取画法与外壳，禁止各写一套。
 *
 * 零色值：本包（含 art.js 与两个 .vue）不得出现 hex / rgb / 具名色；
 * 颜色一律以 `w-*` 几何类名表达，由 styles/world.css 映射到
 * `--world-*` 令牌（令牌真源 styles/tokens/themes/persona-world.css）。
 */
export * from './art.js'
