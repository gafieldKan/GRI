# W5-b 独立复验报告 — 学科登顶 v4 表现面（黎明破晓 × 光脉传导）

- 复验人：助手（架构师 + 独立复验者）
- 日期：2026-10-20
- 被验对象：Claude 产出（W5-b 表现面），8 文件
- 复验环境：HEAD before commit `380c3d3`；分支 `feat/stage-c-unified-auth-shell`；工作树 `/home/ubantu/GRI`
- 结论：**done_verified**（作者脚本 2 处 FAIL 均为「助手补提交」造成的过期断言，非缺陷；独立 E2E 全绿）

---

## 0. 独立性的界定

不采信作者自述。作者脚本 `.agents/claude/outputs/w5b-verify.sh` 仅作**一位证据源**；助手另起
**自写同源托管器**（`/tmp/w5b-indep/serve.cjs`，未复用作者 serve.cjs）与 **三轮自写 E2E 探针**
（probe/probe2/probe3.cjs），在**真实 Chromium + 登录态 testuser + 真作答**下独立取证。

---

## 1. 作者脚本（自跑）

`PASS=215 SKIP=5 FAIL=2`。逐项核验 2 处 FAIL 的性质：

| FAIL | 断言 | 期望 | 实得 | 判定 |
|---|---|---|---|---|
| §13-1 | HEAD 未变 | `0d66df0` | `380c3d3` | **过期断言**：助手复验 W5-a 后补提交 `380c3d3`（补 `learning-chain.ts`）使 HEAD 前移；非 W5-b 缺陷 |
| §13-2 | 协作面在册含 `learning-chain.ts` | 应出现在 `git status` | 未出现 | **过期断言**：该文件已被 `380c3d3` 跟踪（不再 `??`）；非 W5-b 缺陷 |

其余 215 项全 PASS（含 §11 零裸色三重 grep、§12 凭据零泄漏、§10 全链路 pageerror=0）。

---

## 2. 助手独立 E2E（三轮，真浏览器）

### 轮一 · 骨架与机制（`probe.cjs`）
- 登录 ok；双维度 `branches,grades`，默认 `branches`，10 座分支峰。
- v4 读数条在：`光脉点亮 8/144 节 · 微光 5 节` / `下一个最佳目标 1.数一数（小一）` / `光脉前沿 小六·雾退到此` / `当前洞门 半亮`。
- **M1 晨雾**：`w-fog-near=10`、`w-fog-far=6`、`w-ridge-glow=2`（雾只被相邻光驱散 + 雾中山脊微光）。
- **M2 光脉**：`w-light-pulse=1`、`w-light-hint=1`、`w-light-trail=1`。
- 洞门：`7` 个，态集合 `dim,half`（暗门/半亮俱在）。
- **三类边 SVG 实证**（进洞带后 computed style）：
  - soft：`stroke-dasharray=4px,8px; stroke-width=1.2px`（最淡虚线）
  - seq：`stroke-dasharray=none; stroke-width=5px`（实线）
  - explicit：实线（重档）
  - → **N5 视觉弱化落到 stroke 上，引导路径不会画成「必须前置」**。
- **浏览器 pageerror/console.error = 0**。

### 轮二 · 空分支兜底 + 真作答闭环（`probe2.cjs`）
- **空分支** `math.comp`（已列峰、kpCount=18，但链节点 0）：不崩、回落基础地图、`0 error`；
  链空时 v4 读数条隐藏（`comp_strip=0`）。**惟缺「无链」显式文案**（见 §4 遗留）。
- **真作答闭环**（`math.logic` → 节 `math.g1b.pep.ch07.s01`，进洞前 `dim`、`idle`）：
  - 6 个灯位逐一对答（题库取正确答案、按渲染题面匹配 `match=true`）→ 每点 `stage=correct`、**即时亮灯 `lit=1`**。
  - kp07 无题 → 产品兜底跳过（非缺陷）。
  - 出洞后鉴权读链：**该节 `{state:"lit", mastery:100}`；全链已亮 2→3（恰好 +1）**；与 `edu.mastery_snapshots` 一致。
  - `0 error`。

### 轮三 · reduced-motion + 键盘可达 + ≤2 步（`probe3.cjs`）
- `reducedMotion:reduce` 下 `w-light-pulse`/`w-light-hint` 的 `animationName=none`，关键帧仍定义。
- 热点 20 个，渲染为 `UNI-BUTTON` 且 `tabindex=0` + `aria-label`（如「学科分支峰 数与算术，中图法 O12…」）→ **focusable=yes**。
- 点击链：峰 → `7` 洞门 → 带 `34` 洞位 → 洞内场景 `1`；**进洞 ≤2 步**（点洞门 1 步 → 点洞位 1 步）。`0 error`。

---

## 3. 静态独立核验

- **N2 零裸色**：改动面三重 grep，`.vue/.js`/`world.css`/`world-art` 无任何色值字面量；
  world.vue 的 7 处 `green` 命中均为**类名**（`.tag.green`/`.chip.green`），取值 `var(--color-primary-light)`，且**非本卡新增**（不在 diff 新增行）。
- **N3 非 3D**：无 three/webgl/glb/canvas/transform3d/preserve-3d。
- **N4 只取 API**：前端零硬编码学科/KP code；`services/` 既有文件零修改；`apps/explorer` 零改动。
- **N2 一份画法**：全仓仅 `packages/world-art/src/art.js` 一处世界语言；三档边色 `--world-edge-{explicit,seq,soft}` 各自声明。
- **凭据**：改动面 diff 无口令/密钥/token 字面量（`accessToken`/`gri-auth-token` 为既有取数键，非泄漏）。
- **N11 性能**：`w-flow/w-hint/w-breathe` 均 CSS 关键帧（非逐帧重建 DOM）；`prefers-reduced-motion` 落地。

---

## 4. 遗留（非阻塞，如实记录，不判 FAIL）

1. **空链分支无显式空态话术（N8 打磨项）**：全学科空链分布 —— math 1/10（`math.comp`）、
   phys 4/10、**chem 8/8、bio 9/9**。这些分支（`kpCount=0`，无年级教材）点开后不崩、回落基础地图，
   但**没有「该分支暂无链/暂无数据」的显式文案**（维度 B 的同侪空态 `data-scene-empty` 已具备）。
   量级：chem/bio 两科**整科**走此路径。建议后续补一句兜底（低风险、小改）。
2. **作者脚本 §13 两条过期断言**（见 §1）：因助手补提交 `380c3d3` 使 HEAD 前移所致，非实现缺陷；
   若重跑该脚本会再报此两条，属预期。
3. 作者脚本 §14 自述 5 项未覆盖（运营看板 / 生产 nginx 托付观感 / 深色主题 / 小程序 / 真触屏手势）——同意，不属本卡范围。

---

## 5. 判定

- 硬约束 N1–N11：**全部满足**（N8 有一处非阻塞打磨项）。
- 作者脚本 2 FAIL：**均为过期断言，非缺陷**。
- 助手独立 E2E 三轮：**全绿，0 浏览器错误**。
- **结论：W5-b `done_verified`。**
