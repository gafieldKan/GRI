# 提示词 · W6-c（学习世界 v6：三维度分页分离）

> 用法：把下面 **```text 代码块内的全文**原样粘贴给 **Claude**（在 `/home/ubantu/GRI` 工作树）。**串行**——W6-a 已完成并复验，可直接下达。

```text
你是 GRI 的实现 agent（Claude）。工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。

任务：W6-c —— 学习世界 v6「三维度分页分离」。先完整读这两份文件，再动手：
- 任务卡：.agents/claude/tasks/w6-c-dimension-scene-separation.md（约束 N1–N11 与验收标准，**逐条满足**）
- 设计灵魂：docs/SUBJECT_SUMMIT_DESIGN_V6.md（K12 升学阶梯 / 城区街区网格 / SVG 技术规格）

改动面：apps/web-ai-tutor/src/pages/twin/world.vue（主）+ packages/world-art/src/art.js（新画法原语，零色值）+ styles/world.css 与 styles/tokens/themes/persona-world.css（必要时）。

三件事的验收要点（简版）：
1. 场景分离——三维度各一张画布；K12 页不得含城区元素（[data-storefront]/[data-kp-door]/[data-avenue-mark]）与峰；城区页不得含年级大道与 K12 册热区。用探针断言数量=0。
2. K12 阶段 = 升学阶梯——横向 12 年级、每列 ≤2 张人教版册卡、按学段台阶抬升、横向可滚（min-width，别硬缩）；册卡两两不重叠；「我在读」标记与空态话术保留。
3. 学科城区 = 街区网格——行=分支街区、列=楼栋(章)、门=知识点(底商，三态 lit/half/dim)；楼间街道 + 施工围挡/晨雾（沿用 v5 M2 因果口径）；**整条删除年级大道**；楼栋两两不重叠；楼态/路态图例 + 口径逐字（「路的先后是课程序列……不是难度高低」「半亮=有作答且未到 80，不是会了一半」）。

对照标杆：apps/portal/src/components/world/LifeWorld.vue（《生活全景》——lw-scroll 横向滚动 + 等比画布 + 场景各有干净坐标 + lw-svg）。学它的语言，不复制它的场景。

硬约束：零裸色（world-art 零色值，颜色只走 --world-* 令牌）；非 3D；只取 API 数据、不改后端；不回归维度 A 群峰/延续性/册章下钻；prefers-reduced-motion 降级；build:h5 通过；真实浏览器 pageerror=0；核心路径 ≤2 步。

纪律：**不 commit / 不 checkout / 不 push**；凭据零泄漏。产出 .agents/claude/outputs/w6c-file-list.md 与 w6c-verify.sh（末行 FAIL=0）。完成后把文件清单 + verify.sh 关键输出贴回来，等独立复验。
```

> 完成后我（助手）独立复验：自跑你的 `w6c-verify.sh` + 自建几何探针（场景互斥 / 不重叠 / 可滚密度）+ 真浏览器 `pageerror=0`，**不采信自述**。
