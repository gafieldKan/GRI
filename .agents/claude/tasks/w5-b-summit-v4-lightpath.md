# W5-b：学科登顶 v4 · 表现面 —— 黎明破晓（晨雾）+ 光脉传导 + 洞窟探入（接智学慧眼闭环）

> 执行者：**Claude** ｜ 波次：Persona World · v4 ｜ 依赖：**W5-a 先完成并复验** ｜ 状态：待下达（串行）
> 依据：`docs/SUBJECT_SUMMIT_DESIGN_V4.md`（**设计 v4 · 黎明破晓 × 光脉传导**，本卡灵魂文件）＋ `docs/SUBJECT_SUMMIT_DESIGN.md`（v3 双维度基线，不改）
> 定位：把 W4-b 的**静态风景山**升级为**会因学习而点亮、生长的世界**。**承重数据来自 W5-a 新端点**。
> **用户裁决（2026-10-19）**：色彩=**黎明破晓**；核心机制=**光脉传导**；山保留为宏观骨架；要求"更科幻/更吸引人/**更能体现学习过程**/引导和帮助学习"。

## 📥 承重事实（实测）

- 现有登峰页：`apps/web-ai-tutor/src/pages/twin/world.vue`（W4-b 后：双维度切换 + 53 峰 + 延续性 + 拟真形象；**本卡在此之上重构**）。
- **黎明白牌已就绪**：`styles/tokens/themes/persona-world.css` 现为黎明色系（`--world-sky-top #bcd9e6` / `--world-haze #f8faf1` / `--world-sun-glow #fdf3d8`）→ **无需暗色主题前置**，只**新增 v4 光效令牌**。
- 画法共享件：`@gri/world-art`（`packages/world-art`：`terrain/peakMassif/trail/depthSpire/bookCamp/GRADE_TICKS/STAGE_SPANS`；`art.js` **零色值**）；几何类 `styles/world.css`（`.w-*`）；形象标杆 `apps/portal/src/components/world/LifeWorld.vue`。
- **W5-a 新数据面（已上线后）**：
  - `GET /api/curriculum/learning-chain?subject=&branch=&grade=` → `{nodes[{code,name,grade,chapter,chapterName,mastery?,state:'dim'|'half'|'lit'}], edges[{from,to,kind:'explicit'|'seq'|'soft',reason}], summary{total,lit,next}}`。
  - `GET /api/curriculum/kp-cave?kpId=` → 洞内闭环聚合（掌握度/三态/前置边/题入口/错题due/复习due/下一节点/成就态）。
- **智学慧眼闭环端点（全复用，不造新能力）**：`getAgentLesson` / `getAgentKpQuestions` / `gradeAgentAnswer` / `practice/session/start|complete` / `wrong-questions/*` / `practice/sr-queue/:id` / `plans/generate` / `user/:id/achievements`。
- 掌握度真源 `edu.mastery_snapshots`，阈值 **≥80** = 洞窟"点亮"。

## 🎯 本卡目标（表现面三机制）

- **M1 晨雾即未知**：暗→微光→亮，未学区域被**黎明晨雾**罩住，只有轮廓微光；走过的路可见。
- **M2 光脉传导即因果（灵魂）**：答对 → 该点**亮起** → **光沿链流向其后继点**（后继 `dim→half`）→ 晨雾退散、山脊显现。**直接可视化"掌握基础才能向上"。**
- **M3 洞窟即闭环**：点已点亮/半亮洞 → **探入平铺 SVG 生活场景** → 跑智学慧眼闭环 → 掌握≥80 → **亮灯 + 奖励** + 光脉自动向前。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| N1 | **山保留为宏观骨架**；**双维度切换不回归**（默认学科知识体系）；W4-b 已验收的延续性/多峰/册章详情**不得退化**。 |
| N2 | **零裸色**：只增 `--world-*` 令牌（黎明光效），`world-art` 保持**零色值**；**同一世界语言，禁第二套画法**；新画法加到 `packages/world-art`。 |
| N3 | **非 3D**：SVG 2D + 分层视差/光效表达纵深（**不使用 3D**）。 |
| N4 | **数据只取 API**：链/边/洞态一律来自 W5-a 端点；**不改后端**、不动 explorer、不改 W1–W4 既有端点契约。 |
| N5 | **软边不误导（N9 口径）**：`soft` 边为**引导性**，UI 须以**弱化视觉**区分于 `explicit/seq`，并在可读处给出口径说明（如"引导路径"），**禁止把 soft 画成"必须前置"**。 |
| N6 | **引导力（四件套必做）**：① 晨雾**只能被相邻光驱散**（结构引导"下一步"）；② 每次进入给出**"下一个最佳目标"脉冲呼吸提示**（用 `summary.next`）；③ **洞门三态**（未进=暗门/进未掌握=半亮/掌握=亮灯）；④ **答错不惩罚**（暗淡回摆 + 自动接错题/复习闭环）。 |
| N7 | **洞内闭环复用智学慧眼**：讲解→练→判→错题→复习→计划→掌握≥80；**不重造能力**；洞内为**平铺 SVG 生活场景**（承接 `LifeWorld` 语言）。 |
| N8 | **易操作 ≤2 步**：维度切换/学科切换/选峰/进洞/洞内主流程；触控 + 键盘可达；**空态有兜底话术**（含无链数据、无掌握度、无成就）。 |
| N9 | **信息密度**：掌握度、已点亮/**下一个目标**、当前位置、K12 区间、册/章归属 **首屏可见**。 |
| N10 | 不回归既有功能（营地/三动作/返回世界/回智学慧眼）；`build:h5` 通过；真实浏览器 **pageerror=0**；**不 commit / 不 checkout**；凭据零泄漏。 |
| N11 | **性能**：光脉动画 + 数百节点须**流畅**（用 CSS/`requestAnimationFrame`、避免逐帧重建 DOM；大分支可虚拟化/按年级分段渲染）。 |

## 📦 产出物

1. `apps/web-ai-tutor/src/pages/twin/world.vue`：v4 重构（M1 晨雾 + M2 光脉传导 + M3 洞窟探入 + 引导四件套 + 信息密度）。
2. **洞内场景**：可内联于 world.vue 的**平铺 SVG 场景层**，或独立子组件（若独立成页需在本卡说明并保证 ≤2 步可达）。
3. 新增画法/令牌：`packages/world-art`（光效/雾/洞窟原语，**零色值**）+ `styles/tokens/themes/persona-world.css` 新 `--world-*` 光效令牌 + 必要时 `styles/world.css` 类。
4. `.agents/claude/outputs/w5b-file-list.md` + `w5b-verify.sh`。

## ✅ 验收标准

1. **M1**：初始仅山脚（K12 起点）可见，其余**晨雾**罩住且有轮廓微光；已掌握路径可见。
2. **M2**：答对/达成一个节点后，该点**亮起**且**光沿链传向其后继**（后继由 dim→half）；晨雾相应退散。**动画可复现、可截图/录屏证据。**
3. **M3**：点洞 → **探入平铺生活场景** → 跑通**智学慧眼闭环**（讲解→练→判→错题/复习→掌握≥80）→ **出洞亮灯 + 奖励**；奖励**不编造**（成就数据缺失时降级为视觉+文案，不伪造计数）。
4. **引导四件套**（N6）逐条可见；`soft` 边视觉弱化且有口径说明（N5）。
5. **双维度切换不回归**；延续性/多峰/册章详情不退化（对拍 W4-b 验收点）。
6. **零裸色**（三重 grep 空）；`world-art` 零色值；**无 3D**。
7. **真实浏览器 E2E**：切维度 + 换学科 + 选峰 + 进洞跑闭环 + 光脉传导，**pageerror=0**；`build:h5` 通过。
8. 空态兜底齐全；核心路径 **≤2 步**；`verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。

## 🧪 复验脚本要求
须覆盖：M1 雾态、M2 光脉前后节点 state 变化（dim→half→lit）、M3 洞内闭环可达与出洞亮灯、引导四件套存在、soft 边视觉标记、双维度不回归、零裸色三重 grep、`build:h5`、真实浏览器 pageerror=0、`FAIL=0`。
