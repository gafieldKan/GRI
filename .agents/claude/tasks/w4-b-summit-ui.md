# W4-b：学科登顶 UI 升级 —— 双维度切换 + 多顶峰 + 拟真形象

> 执行者：Claude ｜ 波次：Persona World ｜ 依赖：**W4-a 先完成并复验**（双维度读面）｜ 状态：待下达（串行）
> 依据：`docs/SUBJECT_SUMMIT_DESIGN.md` + 用户要求 #4「现登峰 UI 太简单单调不形象，要达生活场景那档直观形象」
> 定位：把「学习世界 · 登峰」从**单维度铺路线**升级为**双维度可切换 + 多顶峰 + 与人本世界同档的拟真形象 + 信息密度**。

## 📥 承重事实（实测）

- 现有登峰页：`apps/web-ai-tutor/src/pages/twin/world.vue`（W3 后套 `WorldShell`，世界语言同人本世界）；**现状**：山体 + 44 营地点位 + 登山路 + 攀爬轨迹 + 营地详情 + 三动作（练一练/请教AI/知识图谱）+ 6 学科切换。
- **世界语言共享件**：`@gri/world-art`（`packages/world-art`：`art.js` 画法原语零色值 + `WorldShell`/`WorldTransition`）；**世界令牌** `styles/tokens/themes/persona-world.css`；几何类 `styles/world.css`；**人本世界** `apps/portal/src/components/world/LifeWorld.vue`（拟真等距全景=**形象标杆**）。
- 数据：W4-a 的 `GET /api/curriculum/summit-branches|summit-grades?subject=`（双维度读面）；既有 `knowledge-map`/`knowledge-graph`/`practice/*`。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **维度切换开关**：登峰页顶部可切 **学科知识分类（多顶峰）/ K12 学段年级**；两维度各自组织同一批知识点；切换不丢当前学科。 |
| N2 | **多顶峰（维度 A）**：每学科 **N 座峰**（各自独立山峰/路径/顶峰），不是一条主线；顶峰=该分支终极点；可逐峰看进度与登顶态。 |
| N3 | **K12 维度（维度 B）**：按 **学段(小/初/高) → 年级**组织（人教版标签）；可见各年级进度与登顶态。 |
| N4 | **拟真形象升级（对齐标杆）**：观感达 `LifeWorld.vue`/人本世界那档——等距拟真地形/季节天光/多峰群山/路径与营地立体感；**同一世界语言**（`@gri/world-art` + `--world-*` 令牌 + `w-*` 几何类），**零裸色**。 |
| N5 | **信息密度**：把关注信息都放上来（掌握度/已登顶/当前所在/前沿峰外/前置关系/年级对应/最近经历），不靠"点开才知道"。 |
| N6 | **保留既有功能**：营地详情/三动作/学科切换/返回人本世界/回智学慧眼**不回归**；数据只取 API。 |
| N7 | 不改 W1–W3 契约；不动 explorer；不改后端（只读 W4-a API）；`build:h5` 通过；**不 commit/不 checkout**。 |

## 📦 产出物

- `apps/web-ai-tutor/src/pages/twin/world.vue`：双维度切换 + 多顶峰 + 拟真形象升级（世界语言）。
- 如需：共享画法补充（**加到 `packages/world-art`**，供人本世界与模块世界共用；禁各写一套）。
- `.agents/claude/outputs/w4b-file-list.md` + `w4b-verify.sh`。

## ✅ 验收标准

1. 登峰页可切 **学科分类 / K12**；维度 A 显示 **N 座峰**（MATH 4）；维度 B 显示 **学段→年级**；切换不丢学科。
2. 形象达人本世界档（等距拟真、多峰群山、路径/营地立体）；与学习世界/人本世界**同一世界语言**（共享件复用，无第二套画法）。
3. 信息密度：掌握度/登顶态/当前位置/前沿/年级对应等**首屏可见**。
4. 既有功能不回归（营地详情/三动作/学科切换/双出口）；`build:h5` 通过；真实浏览器：切两维度 + 点峰/营地 + 走三动作，**pageerror=0**。
5. 零裸色（新增/改动文件三重 grep 空）；共享画法仍零色值。
6. `verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。
