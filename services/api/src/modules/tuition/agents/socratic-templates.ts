import type { SocraticContext } from '../tuition.types';

/**
 * 苏格拉底话术 —— **类型与能力契约**（W2.4b：实现已迁为插件 `plugins/socratic`，本文件只留类型/契约）。
 *
 * 形如「宿主经 `@gri/plugin-host` 解析 `socratic.render` → 得实现」—— 消费者只依赖本契约面（`SocraticRender`），
 * **不 pin 具体件**。实现见 `services/api/plugins/socratic/index.js`（`provides: ["socratic.render"]`）。
 *
 * 跨边界判错：实现抛的错误自带 `name`（'MissingTemplateError' / 'MissingTemplateVariableError'），
 * 消费者按 `name` 判（**勿用 `instanceof`** —— 跨插件边界类身份不同）。
 */

/** 模板阶段（对应卡片态的取数三态）。 */
export type TemplateStage = 'hint' | 'scaffold' | 'solution';
/** 题型（单选/多选/填空/解答）。 */
export type QuestionKind = 'single-choice' | 'multiple-choice' | 'fill' | 'solution';
/** 难度。 */
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/** 模板键。 */
export interface TemplateKey {
  subject: string;
  type: QuestionKind;
  difficulty: DifficultyLevel;
  stage: TemplateStage;
}

/** 模板函数：返回**含占位符的原始模板串**（插值统一由 render 完成）。 */
export type TemplateFn = (ctx: SocraticContext) => string;

/** 插件错误类名（跨边界判错用 `error.name`）。 */
export const MISSING_TEMPLATE_ERROR = 'MissingTemplateError';
export const MISSING_TEMPLATE_VARIABLE_ERROR = 'MissingTemplateVariableError';

/** `socratic.render` 能力面（插件实现须满足）：解析模板 + 回退链 + 插值；缺模板/缺变量抛带 `name` 的错误。 */
export interface SocraticRender {
  render(key: TemplateKey, ctx: SocraticContext): string;
}
