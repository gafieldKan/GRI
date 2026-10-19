# W5-b 可下达提示词（粘贴给 Claude，**须等 W5-a 完成并复验通过后才下达**）

> 任务卡：`.agents/claude/tasks/w5-b-summit-v4-lightpath.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。
> **前置**：W5-a 已 done_verified（助手独立复验）。未复验前不要开工（串行铁律）。

---

【任务】W5-b：把登峰页从**静态风景山**升级为 **v4 · 黎明破晓 × 光脉传导** —— 晨雾（M1）+ 光脉传导（M2，灵魂）+ 洞窟探入接智学慧眼闭环（M3）+ 引导四件套 + 信息密度。**山保留为宏观骨架，双维度不回归。**

■ 必读
1. `docs/SUBJECT_SUMMIT_DESIGN_V4.md`（**设计 v4，本卡灵魂**）+ `docs/SUBJECT_SUMMIT_DESIGN.md`（v3 基线，不改）+ 任务卡。
2. 现有页 `apps/web-ai-tutor/src/pages/twin/world.vue`（W4-b 成果，在此重构）。
3. **黎明白牌（已就绪）**：`styles/tokens/themes/persona-world.css`（`--world-sky-top #bcd9e6`/`--world-haze #f8faf1`/`--world-sun-glow #fdf3d8`）→ 只**新增 v4 光效令牌**，勿换暗色。
4. 画法共享件 `@gri/world-art`（`packages/world-art`，`art.js` 零色值）+ `styles/world.css`（`.w-*`）+ 形象标杆 `apps/portal/src/components/world/LifeWorld.vue`。
5. **W5-a 新端点**（实现前先确认其真实字段）：`GET /api/curriculum/learning-chain?subject=&branch=&grade=`（nodes/edges/summary）、`GET /api/curriculum/kp-cave?kpId=`。
6. 智学慧眼闭环端点（**复用，勿重造**）：`getAgentLesson`/`getAgentKpQuestions`/`gradeAgentAnswer`/`practice/session/start|complete`/`wrong-questions/*`/`practice/sr-queue/:id`/`plans/generate`/`user/:id/achievements`。

■ 三大机制（本卡核心）
- **M1 晨雾即未知**：初始仅山脚（K12 起点）可见，其余**黎明晨雾**罩住 + 轮廓微光；走过的路可见。
- **M2 光脉传导（灵魂）**：答对/达成 → 该点**亮起** → **光沿链流向其后继**（后继 `dim→half`）→ 晨雾退散、山脊显现。**可视化"掌握基础才能向上"。**
- **M3 洞窟即闭环**：点洞 → **探入平铺 SVG 生活场景**（承接 `LifeWorld` 语言）→ 跑智学慧眼闭环（讲解→练→判→错题/复习→掌握≥80）→ **出洞亮灯 + 奖励** + 光脉自动向前。

■ 硬约束（违反即失败）
N1 山保留、**双维度切换不回归**（默认学科知识体系）；W4-b 已验收的延续性/多峰/册章详情**不退化**。
N2 **零裸色**：只增 `--world-*` 令牌；`world-art` 零色值；**同一世界语言、禁第二套画法**；新画法加到共享件。
N3 **非 3D**（SVG 2D + 视差/光效表达纵深）。
N4 **数据只取 API**；不改后端、不动 explorer、不改既有端点契约。
N5 **soft 边不误导**：弱化视觉区别于 `explicit/seq`，给口径说明（如"引导路径"），**禁止画成"必须前置"**。
N6 **引导四件套必做**：① 雾只被相邻光驱散；② 每次进入给**"下一个最佳目标"脉冲呼吸**（用 `summary.next`）；③ **洞门三态**（暗门/半亮/亮灯）；④ **答错不惩罚**（暗淡回摆 + 自动接错题/复习）。
N7 **洞内闭环复用智学慧眼**（不重造能力）；洞内为**平铺 SVG 生活场景**。
N8 **≤2 步**操作；触控+键盘可达；**空态兜底**（无链/无掌握度/无成就）。
N9 **信息密度**：掌握度/已点亮/**下一个目标**/当前位置/K12 区间/册章归属 **首屏可见**。
N10 既有功能不回归；`build:h5` 通过；真实浏览器 **pageerror=0**；**不 commit/不 checkout**；凭据零泄漏。
N11 **性能**：光脉动画 + 数百节点须流畅（CSS/`requestAnimationFrame`，避免逐帧重建 DOM；大分支按年级分段/虚拟化）。

■ 产出
1. `apps/web-ai-tutor/src/pages/twin/world.vue`（v4 重构）。
2. 洞内平铺场景层（内联或独立子组件，须说明且 ≤2 步可达）。
3. 新画法/令牌：`packages/world-art`（光效/雾/洞窟原语，零色值）+ `--world-*` 光效令牌 + 必要时 `.w-*` 类。
4. `.agents/claude/outputs/w5b-file-list.md` + `w5b-verify.sh`。

■ 自检（末行须 `FAIL=0`）
M1 雾态 · M2 光脉前后 state 变化（dim→half→lit）· M3 洞内闭环可达+出洞亮灯 · 引导四件套存在 · soft 边视觉标记 · 双维度不回归 · 零裸色三重 grep · 无 3D · `build:h5` · 真实浏览器 pageerror=0 · `FAIL=0` · 不 commit/不 checkout · 凭据零泄漏。
