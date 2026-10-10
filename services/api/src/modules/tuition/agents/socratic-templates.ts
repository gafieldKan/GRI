import { Injectable } from '@nestjs/common';
import type { SocraticContext } from '../tuition.types';

/**
 * 苏格拉底模板库（P2-T6）—— 按 `{subject, type, difficulty, stage}` 键取模板并做变量插值。
 *
 * 结构：`Map<TemplateKey, TemplateFn>`，`render(key, ctx)`：
 *   1. 按 **精确键 → 类型通配 → 学科通配 → 全局 stage 基模板** 逐级回退解析（保证槽位全覆盖）；
 *   2. 对模板字符串插值 `{knowledgePoint}` / `{studentLevel}` / `{attemptCount}`；
 *   3. 缺失变量 → 抛 `MissingTemplateVariableError`；键无模板 → 抛 `MissingTemplateError`。
 *
 * 纯领域逻辑、模板为代码常量（N3：不新建 YAML、不走 codegen），无状态可注册为 provider（N6）。
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

/** 该键无任何模板（含回退链）可用。 */
export class MissingTemplateError extends Error {
  constructor(readonly key: TemplateKey) {
    super(`无匹配模板：${key.subject}/${key.type}/${key.difficulty}/${key.stage}`);
    this.name = 'MissingTemplateError';
  }
}

/** 模板引用了 ctx 未提供的变量。 */
export class MissingTemplateVariableError extends Error {
  constructor(readonly variable: string) {
    super(`模板变量缺失：{${variable}}（请在 SocraticContext 中提供）`);
    this.name = 'MissingTemplateVariableError';
  }
}

const ANY = '*';

/** 全局 stage 基模板（所有槽位的最终回退）。 */
const BASE_TEMPLATES: Record<TemplateStage, string> = {
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

@Injectable()
export class SocraticTemplates {
  private readonly registry = new Map<string, TemplateFn>();

  constructor() {
    this._registerDefaults();
  }

  /** 组装 Map 键（与 TemplateKey 一一对应）。 */
  private _key(subject: string, type: string, difficulty: string, stage: string): string {
    return [subject, type, difficulty, stage].join('|');
  }

  /** 注册模板（同键覆盖）。 */
  register(key: TemplateKey, fn: TemplateFn): this {
    this.registry.set(this._key(key.subject, key.type, key.difficulty, key.stage), fn);
    return this;
  }

  /** 是否已注册**精确键**（不含回退）。 */
  has(key: TemplateKey): boolean {
    return this.registry.has(this._key(key.subject, key.type, key.difficulty, key.stage));
  }

  /** 已注册模板数。 */
  get size(): number {
    return this.registry.size;
  }

  /** 渲染：解析模板 → 插值。缺模板/缺变量明确报错。 */
  render(key: TemplateKey, ctx: SocraticContext): string {
    const fn = this._resolve(key);
    const template = fn(ctx);
    return this._interpolate(template, ctx);
  }

  /** 回退链：精确 → type 通配 → subject 通配 → 全局 stage 基模板。 */
  private _resolve(key: TemplateKey): TemplateFn {
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
  private _interpolate(template: string, ctx: SocraticContext): string {
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
      const value = ctx?.[name];
      if (value === undefined || value === null || value === '') {
        throw new MissingTemplateVariableError(name);
      }
      return String(value);
    });
  }

  /** 装配默认模板库：3 条全局 stage 基模板 + 若干题型特化（演示覆盖与覆盖写优先级）。 */
  private _registerDefaults(): void {
    (Object.keys(BASE_TEMPLATES) as TemplateStage[]).forEach((stage) => {
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
  private _setWildcard(subject: string, type: string, difficulty: string, stage: string, template: string): void {
    this.registry.set(this._key(subject, type, difficulty, stage), () => template);
  }
}
