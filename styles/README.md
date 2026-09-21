# GRI 设计令牌（Design Token）契约

> 本文档是 GRI 前端视觉层的**唯一语义真源契约**（对应方案 §B6「成熟组件库 + 自研 design token 统一视觉」）。
> 它把「令牌唯一真源 + 主题覆盖 + 暗色」这套已经落地的机制固化为**可验收的标准**，
> 而不是重新造一套样式系统。

## 1. 定位与原则

- **令牌是唯一视觉真源**：颜色 / 间距 / 圆角 / 阴影 / 层级 / 动画，一律先声明为 `--token`，再被组件消费。
- **禁止裸色**：组件 / 页面内不得写 `#1B7A3D`、`rgba(...)` 等硬编码色值；必须引用令牌。
  （迁移期内旧代码允许保留，但**新代码必须走令牌**，见 §5 验收。）
- **主题 = 覆盖，不是新增**：主题文件只覆盖 `global.css` 已声明变量，不得引入 `global.css` 之外的新变量名。
- **一份真源，多处投影**：tailwind 调色板 / antd `ConfigProvider` / uni-ui `uni.scss` / tdesign 主题，
  都是令牌的**投影层**，只做「令牌 → 各框架变量」的映射，不复制原始 hex 值。

## 2. 令牌分类与命名

全部定义在 `styles/tokens/global.css` 的 `:root` / `:root.dark` 下，语义命名：

| 类别 | 前缀 | 说明 |
|---|---|---|
| 品牌色 | `--color-primary-*` / `--color-secondary-*` / `--color-accent-*` | 主/次/强调品牌色 |
| 语义色 | `--color-danger/success/warning/info` | 状态语义 |
| 背景色 | `--color-bg-*` | 页面/卡片/输入/遮罩背景 |
| 文本色 | `--color-text-*` | 主/次/三级/占位/反白 |
| 边框色 | `--color-border-*` | 通用/浅/输入边框 |
| 间距 | `--spacing-{xs,sm,md,lg,xl,2xl}` | 8rpx 基准，语义阶梯 |
| 圆角 | `--radius-{sm,md,lg,xl,2xl,round,card}` | 圆角阶梯 |
| 阴影 | `--shadow-{sm,md,lg,card,hover}` | 层级阴影 |
| 动画 | `--transition-{fast,base,slow}` | 过渡时长 |
| 层级 | `--z-{base,dropdown,sticky,modal,toast,tooltip}` | z-index 阶梯 |

命名约定：`--<类别>-<语义名>-<强度后缀>`，全小写短横线，**不缩写拼音、不混用 camelCase**。

## 3. 主题覆盖范围

主题文件（`styles/tokens/themes/*.css`）**只允许**：
- 覆盖既有 `--color-*` 令牌的值（品牌/语义/背景/文本/边框）；
- 追加品牌专属的 `--*-gradient` 渐变令牌（如 `--color-primary-gradient`、`--hero-gradient`）。

主题文件**禁止**：
- 新增 `global.css` 未声明的变量名（否则暗色主题与投影层无法同步）；
- 写死平台/组件私有值（需下放到对应投影层）。

| 主题文件 | 产品线 | 应用 |
|---|---|---|
| `tokens/themes/food.css` | 点餐 | `apps/web` |
| `tokens/themes/ai-tutor.css` | AI 辅导 | `apps/web-ai-tutor`、`apps/mini-program-ai-tutor` |

## 4. 投影层映射（待落地的收口动作）

> 以下为「先 B 后 A」方案中，令牌向各 UI 框架的**投影契约**。当前部分条目尚未完全接主线，
> 逐条落地即构成 B6 的最终验收。

| 投影层 | 现状 | 收口目标 |
|---|---|---|
| `apps/web/tailwind.config.js` | 已有一份 `sustainable`/`brand-blue`/语义色，与令牌 hex **重复定义** | 改为 `colors: { primary: 'var(--color-primary)', ... }` 引用令牌，删除重复 hex |
| `apps/web-ai-tutor` antd | 使用 antd 默认主题，未接令牌 | `ConfigProvider`/`theme` 的 `token.colorPrimary = '#1890ff'` 等，改为读令牌;或 antd v6 token 直接映射 |
| `apps/mini-program-ai-tutor` tdesign | 已试点完成（见 §6）：`uni_modules` vendor uni-ui + `uni.scss` 令牌投影 | 保持（tdesign-miniprogram 依赖已移除） |
| 共享 `styles/` | 已成熟 | 保持不变，作为唯一真源 |

## 5. 验收标准（B6「先 B」的完成判据）

1. `styles/tokens/global.css` 是唯一令牌 100% 真源，主题文件只做覆盖。
2. 无新代码引入裸色 / 未注册令牌（走 code review + 手动 grep `#[0-9A-Fa-f]{3,8}` 抽样）。
3. 至少一个「令牌 → 框架」投影层真实接主线（本期以 `apps/web` tailwind 投影为样板）。
4. 暗色主题亮度/对比度与亮色主题保持语义一致（maintain 关键令牌成对存在）。

## 6. uni-ui 试点（B6「后 A」第一步）—— 已落地

收敛方向先点：**只在真正跨端的小程序端点做 uni-ui 替换**，web-ai-tutor 的 antd 重仓延后到 P3-P4 统一收口。

- 试点对象：`apps/mini-program-ai-tutor`（原 tdesign-miniprogram，未真正接线）。
- 替换范围：`t-button/t-tag/t-loading/t-progress/t-dialog` → 内置 `button`/`progress` + `uni-tag`/`uni-popup`（vendored into `uni_modules/`）。
- 令牌映射：`apps/mini-program-ai-tutor/uni.scss` 把 `--color-*` / `--spacing-*` / `--radius-*` / `--shadow-*` 投影为 uni-ui `$uni-*` SCSS 变量（与 web-ai-tutor 同源 AI Tutor 蓝 #1890ff）。
- easycom：`pages.json` 开启 `easycom.autoscan`，自动扫描 `uni_modules/*/components/*/*.vue`。
- tabBar：暂降级为纯文字（原 `static/tabbar/*.png` 图标缺失），后续需补占位图标。
- 边界：**不动** web-ai-tutor 的 antd；不自创新的基础组件。

> **静态编译配置的色值限制**：`pages.json` 的 `window.navigationBarBackgroundColor` / `tabBar.color` / `tabBar.selectedColor`
> 是 uni-app 编译期静态配置，**无法消费运行时 CSS 变量**，故保留 `#4A90D9` / `#999999` / `#f5f5f5` 等色值。
> 这是平台限制（同理 Web 端 `manifest.json` 的 themeColor），不算违反「禁止裸色」——
> 但其色值必须与 `styles/tokens` 中对应语义令牌**同源**（当前 #4A90D9 待映射回 --color-primary）。

## 7. 反例（违反即重构）

- 在组件里写 `style="color: #1B7A3D"`。
- 在 tailwind.config.js 里新增一份与令牌同值的 hex 而非引用令牌。
- 在主题文件里声明 `--foo-bar` 这种 `global.css` 没有的变量。
- 每个应用各自维护一套「自己的绿色/蓝色」，而非从 `styles/tokens/` 投影。