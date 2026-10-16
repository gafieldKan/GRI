# W4-b 可下达提示词（粘贴给 Claude，**W4-a 复验通过后再下达**）

> 任务卡：`.agents/claude/tasks/w4-b-summit-ui.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。**串行：W4-a 未复验前不要开工。**

---

【任务】W4-b：把「学习世界 · 登峰」升级为**双维度可切换 + 多顶峰 + 与人本世界同档的拟真形象 + 信息密度**。

■ 必读
1. `docs/SUBJECT_SUMMIT_DESIGN.md` + 任务卡。
2. **形象标杆**：`apps/portal/src/components/world/LifeWorld.vue`（人本世界拟真等距全景）。
3. **世界语言共享件**：`@gri/world-art`（`packages/world-art`：art.js 画法原语零色值 + WorldShell/WorldTransition）；世界令牌 `styles/tokens/themes/persona-world.css`；几何类 `styles/world.css`。
4. 现有登峰页 `apps/web-ai-tutor/src/pages/twin/world.vue`（W3 后套 WorldShell）。
5. **W4-a 双维度读面**：`GET /api/curriculum/summit-branches?subject=`（维度 A）、`GET /api/curriculum/summit-grades?subject=`（维度 B）。

■ 硬约束（违反即失败）
N1 **维度切换开关**：学科知识分类（多顶峰）/ K12 学段年级 两维度切换；切换不丢当前学科。
N2 **多顶峰**：每学科 N 座峰（各自独立山峰/路径/顶峰），不是一条主线；可逐峰看进度与登顶态。
N3 **K12 维度**：学段(小/初/高)→年级（人教版标签）。
N4 **拟真升级（对齐标杆）**：达 LifeWorld.vue/人本世界那档——等距拟真地形/天光/多峰群山/路径营地立体感；**同一世界语言**（共享件 + 令牌 + 几何类），**零裸色**。
N5 **信息密度**：掌握度/已登顶/当前所在/前沿峰外/前置关系/年级对应/最近经历 **首屏可见**，不靠点开才知道。
N6 **保留既有功能**：营地详情/三动作/学科切换/返回人本世界/回智学慧眼 不回归；数据只取 API。
N7 不改 W1–W3 契约、不动 explorer、不改后端；`build:h5` 通过；不 commit/不 checkout。

■ 产出
1. `apps/web-ai-tutor/src/pages/twin/world.vue`：双维度切换 + 多顶峰 + 拟真形象升级。
2. 如需补画法 → 加到 `packages/world-art`（共用，禁各写一套）。
3. `.agents/claude/outputs/w4b-file-list.md` + `w4b-verify.sh`。

■ 自检
- 可切 学科分类/K12；维度 A 显示 N 座峰（MATH 4）；维度 B 显示 学段→年级；切换不丢学科。
- 形象达人本世界档；与学习世界/人本世界同一世界语言（共享件复用、无第二套画法）。
- 信息密度：关键信息首屏可见。
- 既有功能不回归；build:h5 通过；playwright：切两维度 + 点峰/营地 + 三动作，pageerror=0。
- 零裸色；共享画法零色值。
- verify.sh 末行 FAIL=0；凭据零泄漏。
