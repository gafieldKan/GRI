# W4-b 可下达提示词（粘贴给 Claude，**W4-a 已复验通过，可下达**）

> 任务卡：`.agents/claude/tasks/w4-b-summit-ui.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。W4-a 已 done_verified（commit 172f8bb）。

---

【任务】W4-b：把「学习世界 · 登峰」升级为**双维度可切换 + 多顶峰 + 学科延续性可视化 + 与人本世界同档的拟真形象 + 信息密度**。

■ 必读
1. `docs/SUBJECT_SUMMIT_DESIGN.md`（设计 v3）+ `docs/SUBJECT_SUMMIT_AUTHORITY.md`（权威出处，中图法号可展示）+ 任务卡。
2. **形象标杆**：`apps/portal/src/components/world/LifeWorld.vue`（人本世界拟真等距全景）。
3. **世界语言共享件**：`@gri/world-art`（`packages/world-art`：`art.js` 画法原语零色值 + WorldShell/WorldTransition）；世界令牌 `styles/tokens/themes/persona-world.css`；几何类 `styles/world.css`。
4. 现有登峰页 `apps/web-ai-tutor/src/pages/twin/world.vue`（W3 后套 WorldShell）。
5. **W4-a 双维度读面（已上线数据）**：
   - `GET /api/curriculum/summit-branches?subject=`（**维度 A · 学科知识体系全覆盖**）：`{subject, threshold:80, peaks[]}`；每峰含 `code/name/clc/curriculum/k12GradeMin/k12GradeMax/kpCount/mastery?/reached/isSummit/children[]`。
   - `GET /api/curriculum/summit-grades?subject=`（**维度 B · K12 阶段**）：`{subject, threshold:80, stages[]}`，stages=学段(`PRIMARY/JUNIOR/SENIOR`)→grades(`G1`–`G12`)→textbooks(人教版册)→chapters(章，含 `branch` 所属分支)。

■ 落位现状（实测，直用于 UI）
- **顶层峰数**：MATH 10、PHYS 10、CHEM 8、BIO 9、CHN 9、ENG 7（共 53 峰 + 4 纵深子节点）。
- 峰名与中图法号：见 `docs/SUBJECT_SUMMIT_DESIGN.md` §3（如数学：数与算术`O12`/函数·极限·微积分`O17`/几何·解析几何·拓扑`O18`/概率论与数理统计`O21`…）。
- 部分峰事实偏少（`bio.micro`/`chem.inorg`/`chem.poly` 面积=0）——**先以结构呈现该峰（不隐藏），掌握度/知识点数按 API 实话显示**。
- `k12GradeMin/Max` 即学科延续性区间（如数学分析=10–12、数与算术=1–11、几何=1–12、纯纵深峰=null）。

■ 硬约束（违反即失败）
N1 **维度切换开关**：顶部【学科知识体系 ‖ K12 阶段】，**默认学科知识体系**；切换保留当前学科与当前峰，不闪断、不丢状态。
N2 **多顶峰（维度 A）**：每学科 **N 座独立峰**（MATH 10…），各有自峰顶与路线；峰可点选/比对/逐峰看进度与登顶态；**不是一条主线**。
N3 **延续性可视化（本卡灵魂）**：每座峰**同屏呈现 K12 段与学科纵深段**（用年级刻度标出该分支从几年级起、到几年级止、之后通向何处）——一眼看懂"这门学问从小学几年级一路爬到我今天的位置"。纵深子节点（children）须可见。
N4 **K12 维度（B）**：按 **学段(小/初/高)→年级→人教版册/章**；每册/章显示它与哪些体系分支相关（反向照应延续性）。
N5 **形象达标**：达 `LifeWorld.vue`/人本世界那档（等距拟真地形、天光、多峰群山、路径与站点立体）；**同一世界语言**（共享件 + `--world-*` 令牌 + `w-*` 几何类），**零裸色**。
N6 **直观易理解**：一屏说清"我在哪、还有多远、登没登顶、这学科从几年级走到现在"；强隐喻（山=分支、营地=知识域、雾=未解锁、旗=登顶、天顶=学科顶峰）。
N7 **易操作**：维度切换/学科切换/选峰/进营地 **≤2 步**；触控 + 键盘可达；空态有兜底话术。
N8 **信息密度**：掌握度、已登顶、当前位置、K12 年级区间、册/章归属、最近经历 **首屏可见**。
N9 **权威出处展示**：分支详情层可显示其**权威依据**（中图法分类号，如 `O17 数学分析`）——不编造。
N10 **保留既有功能**：营地详情/三动作/学科切换/返回人本世界/回智学慧眼 不回归；**数据只取 W4-a API**。
N11 不改 W1–W3 契约、不动 explorer、不改后端；`build:h5` 通过；不 commit/不 checkout；凭据零泄漏。

■ 产出
1. `apps/web-ai-tutor/src/pages/twin/world.vue`：双维度切换 + 多峰 + 延续性可视化 + 拟真形象升级 + 信息密度。
2. 如需补画法 → 加到 `packages/world-art`（共用，禁各写一套）。
3. `.agents/claude/outputs/w4b-file-list.md` + `w4b-verify.sh`。

■ 自检（verify.sh 末行须 FAIL=0）
- 可切 **学科知识体系/K12 阶段**（默认前者）；维度 A 显示 **MATH 10 座峰**；维度 B 显示 学段→年级→人教版册/章 + 分支归属；**切换不丢学科与当前峰**。
- **延续性**：每峰可见 K12 年级区间与学科纵深段（可读、可懂、不误导）。
- 形象达人本世界档；与学习世界/人本世界同一世界语言（共享件复用、无第二套画法）。
- 直观：关键信息首屏可见；易操作：核心路径 ≤2 步，空态有兜底。
- 既有功能不回归；`build:h5` 通过；真实浏览器：切两维度 + 换学科 + 选峰/进营地 + 三动作，**pageerror=0**。
- **零裸色**（三重 grep 空）；共享画法零色值；分支权威依据可展示且不编造。
- 不 commit/不 checkout；凭据零泄漏。
