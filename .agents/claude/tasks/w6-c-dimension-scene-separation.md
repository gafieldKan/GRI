# W6-c：学习世界 v6 · 三维度**分页分离**（K12 阶段 = 升学阶梯 ｜ 学科城区 = 街区网格）

> 执行者：**Claude** ｜ 波次：Persona World · v6 ｜ 依赖：W6-a 已完成并复验（v5 城区骨架）｜ 状态：待下达（串行）
> 依据：`docs/SUBJECT_SUMMIT_DESIGN_V6.md`（**设计 v6 · 分页分离**，本卡灵魂文件）
> 定位：**修 v5 表现面的结构性错误**（不是重画，是分离场景 + 重建两套布局）。数据面 / 闭环 / 令牌 / 画法共享件**全部保留**。
> **用户裁决（2026-10-21）**：按助手建议执行「**彻底分页分离**」。

## 📥 承重事实（实测，非推测）

- 现页：`apps/web-ai-tutor/src/pages/twin/world.vue`（W6-a 后：三维度 `branches / grades / district`，共用**同一块** `[data-map]` 画布，viewBox `0 0 1200 820`）。
- **实测缺陷**（线上 dist，真实浏览器，1500×1080，场景显示 838×573 → 缩放 0.70）：
  - K12 维度：**23 个册热区 x=78–193、y=388–453**（≈115×65px 的方块）→ 23 册**全叠在一角**。
  - 城区维度：76 店 y≈444、6 门 y=514/578、12 里程碑 y=532；**城区主内容只占 y≈440–580（画布可视区的下 1/4）**，其上是山体剪影；HTML 叠层合计 **105 个**（23 册 + 76 店 + 6 门）重叠。
  - 根因：三套表达共用一张画布 + `map-scene{width:100%; min-width:560px; aspect-ratio:1200/820}` **硬缩** → 必糊。
- 参考实现：《生活全景》`apps/portal/src/components/world/LifeWorld.vue`（`lw-scroll` + `lw-canvas` + `lw-svg`，场景各有干净坐标）；画法共享件 `packages/world-art/src/art.js`（**零色值**）。
- v5 **塞进城区的「年级大道」**（`avenueMarks` / `districtStorefronts` 沿峰坐标散铺）= **「K12 界面混进城区」的根因**。

## 🎯 本卡目标（三条）

1. **场景分离**：三个维度 = **三块自洽画布**（各自 `viewBox`），切维度**换世界**，不再换叠加层。维度 A 沿用 `SUMMIT` 1200×820；K12 / 城区各建**新画布**。
2. **K12 阶段 = 升学阶梯**：横向 12 年级 × 每列 ≤2 张人教版册卡，**不重叠**、按学段台阶抬升，**横向可滚**（`min-width` 而非硬缩）。页内**不得出现**峰 / 山体 / 城区元素。
3. **学科城区 = 街区网格**：行 = 街区（学科分支），列 = 楼栋（章），门 = 知识点（底商门面，三态 `lit/half/dim`）；楼间街道 + 施工围挡 / 晨雾（沿用 v5 M2 因果口径）；**整条删除年级大道**；页内**不得出现**峰 / K12 册热区 / 海拔轴。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| N1 | **场景物理分离**：每维度独立画布 + 独立坐标。K12 维度 DOM 内 `[data-storefront]`/`[data-kp-door]`/`[data-avenue-mark]` 数量 **= 0**；城区维度 DOM 内 K12 册热区与峰热区数量 **= 0**。 |
| N2 | **零裸色**：只增 `--world-*` 令牌；`world-art/src/art.js` **零色值**；**同一世界语言，禁第二套画法**；新画法原语加到 `packages/world-art`。 |
| N3 | **非 3D**：SVG 2D + 分层/光效表达纵深（**禁用 3D**）。 |
| N4 | **数据只取 API**：学习链 / 洞态 / 掌握度一律来自 W5-a 端点；**不改后端**、不动 explorer、不改既有端点契约。 |
| N5 | **不重叠**：同维度同级元素包围盒**交集面积 = 0**（K12 册卡、城区楼栋）。 |
| N6 | **可读性**：K12 每列 ≥1 卡且列距 ≥ 卡宽；城区每行楼栋间距 ≥ 步道宽；楼态图例 + 路态图例**首屏可见**，口径逐字（见设计 §4）。 |
| N7 | **诚实口径不回归**：`soft` 边弱化 + 「引导路径」说明；「半亮 ≠ 掌握」；`chn/eng` 空态 + 回维度 A 按钮（**不造假楼**）。 |
| N8 | **动画**：光脉传导可复现（前后节点 `dim→half→lit`）；`prefers-reduced-motion` 下静态降级；走 CSS `transform`/`requestAnimationFrame`，**不逐帧重建 DOM**（城区曾 105 叠层）。 |
| N9 | **不回归**：维度 A 群峰、延续性、册→章→节下钻、返回世界 / 回智学慧眼等既有功能不得退化（对拍 v4/v5 验收点）。 |
| N10 | **技术**：独立 `viewBox` + `preserveAspectRatio`；横向滚动 `overflow-x:auto` + `min-width`；可用 `<defs>`/`use` 复用；`aria-label` + 键盘可达。 |
| N11 | `build:h5` 通过；真实浏览器 **`pageerror=0`**；**不 commit / 不 checkout / 不 push**；凭据零泄漏；核心路径 **≤2 步**。 |

## 📦 产出物

1. `apps/web-ai-tutor/src/pages/twin/world.vue`：三维度分页分离重构（K12 升学阶梯 + 城区街区网格）。
2. 新增画法：`packages/world-art/src/art.js`（`STAIR` / `CITY` 布局原语，**零色值**）；必要时 `styles/world.css` 新 `.w-*` 类；`styles/tokens/themes/persona-world.css` 增 `--world-*`（如街区/台阶/门面新令牌）。
3. `.agents/claude/outputs/w6c-file-list.md` + `.agents/claude/outputs/w6c-verify.sh`。

## ✅ 验收标准

1. **N1 场景分离**：探针断言 K12 页城区元素 = 0、城区页 K12/峰元素 = 0。
2. **N5 不重叠**：K12 册卡两两交集 = 0；城区楼栋两两交集 = 0。
3. **N10 不硬缩**：K12 / 城区画布 `scrollWidth > clientWidth`（或密度断言成立）。
4. **K12 阶梯**：12 列年级 + 学段台阶 + ≤2 册/列；「我在读」标记；空态话术保留。
5. **城区网格**：行 = 分支数、每行楼栋不重叠、店门三态、楼态/路态图例 + 口径逐字。
6. **N8 动画**：光脉传导前后 `state` 变化可截屏/录屏；`prefers-reduced-motion` 降级。
7. **N9 不回归**：维度 A 群峰 / 延续性 / 册章详情对拍通过。
8. **零裸色三重 grep 空**；`world-art` 零色值；非 3D；`build:h5` 通过；真实浏览器 `pageerror=0`；`verify.sh` 末行 `FAIL=0`；不 commit / 不 checkout；凭据零泄漏。

## 🧪 复验脚本要求

须覆盖：① 三维度场景元素互斥断言（数量 = 0）；② 同级元素包围盒交集 = 0；③ 画布可滚/密度断言；④ K12 阶梯结构与「我在读」；⑤ 城区网格行/列/三态/图例/口径逐字；⑥ 光脉传导 `dim→half→lit` 前后态；⑦ `prefers-reduced-motion` 降级；⑧ 维度 A 不回归对拍；⑨ 零裸色三重 grep；⑩ `world-art` 零色值；⑪ 非 3D 断言；⑫ `build:h5`；⑬ 真实浏览器 `pageerror=0`；⑭ `FAIL=0`；⑮ 凭据零泄漏。
