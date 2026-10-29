/**
 * 规则登记表（**登记制** · P0 · GRI = 首个挂载者）
 *
 * 登记制：规则**留在原地**（现有 spec / 扫描 / 命令），本表只把每条**登记**为一条"规则"；
 * 跑时由 `verify/run.mjs` 统一调用 + 产**统一机读报告**。**不搬迁**（零回归）。
 *
 * 每条规则形状（**产品的登记器接口**，P1 会把 `run.mjs` 抽进产品、本表留项目侧）：
 *   { id, dimension, level, scope, doc, run }
 *   - level: 'E' 阻断（不过即非零退出） / 'W' 警告 / 'I' 提示
 *   - scope: '通用'（→ 抽进产品模板库） / '项目'（GRI 专属）
 *   - run(ctx) → Promise<{ ok: boolean, findings?: any[], note?: string }>；ctx = { repo }
 *
 * ⚠️ **存量容忍**（已定三级分级）：**现有代码本就不满足**的规则，先挂 **W**（告警），修净后再升 E——
 * 不让新规则把绿树一夜刷红。
 */
import { arch04NoImportCycle } from './rules/arch-04-no-import-cycle.mjs';

export const RULES = [
  // ── A 架构 ────────────────────────────────────────────────────────────
  arch04NoImportCycle,
  // 后续按首批顺序（E/缺/通用 → W → I）陆续挂上：
  //   ARCH-05 依赖方向、ARCH-06 跨模块只经端口、UI-01 零裸色、CODE-02 eslint、CODE-06 SCA、
  //   CODE-07 无硬编码密钥、SEC-01 宣称×测试、SEC-04 漏洞扫描、REL-01 闸进 CI …
];
