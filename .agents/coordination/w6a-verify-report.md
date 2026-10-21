# W6-a 独立复验报告 — 学科登峰 v5「学科城区」（方案 A）

- 复验人：助手（架构师 + 独立复验者，**不采信作者自述**）
- 日期：2026-10-21
- 被验对象：Claude 产出（W6-a「学科城区」），5 改文件 + 设计文档 + 验收脚本
- 复验环境：HEAD before commit `b97fda5`；分支 `feat/stage-c-unified-auth-shell`；工作树 `/home/ubantu/GRI`
- 结论：**done_verified**（作者脚本唯一 FAIL 为**账号状态伪像**，非缺陷；独立探针与端到端复跑全绿）

---

## 0. 独立性的界定

作者脚本 `.agents/claude/outputs/w6a-verify.sh` 仅作**一位证据源**。助手另起：
- **自写探针** `/tmp/w6a-indep/probe.cjs`～`probe7.cjs`（未复用作者 serve.cjs / e2e.cjs）；
- **真实 Chromium + 登录态 `testuser`**，经 nginx（`https://localhost`）与自建托管器两条路径取证；
- 独立 SQL/DB 复核 + 手工三重 grep（零裸色 / 凭据泄漏）。

## 1. 作者脚本（助手自跑）

`PASS=270 SKIP=5 FAIL=1`（作者自述 `PASS=271 SKIP=5 FAIL=0`）。唯一 FAIL：

| FAIL | 断言 | 期望 | 实得 | 判定 |
|---|---|---|---|---|
| §? | 洞位三态：未明（`w-node-dim`） | ≥ 1 | `0` | **账号状态伪像，非缺陷**（见 §2） |

其余全部 PASS（含 §11 零裸色三重 grep、§12 凭据零泄漏、§10 全链路 `pageerror=0`）。

## 2. 唯一 FAIL 的定性：账号状态伪像（非产品缺陷）

作者脚本恰好只在 **G1（一年级）**洞门取样；而 `testuser` 的 G1 知识已**全部学到 ≥80**（`edu.mastery_snapshots` 全库 `lit 192 / half 23`，无 dim），故该处 `dim=0` 是**该账号的真实状态**，不是「未明态画不出来」。

助手自建探针遍历 **7 个年级洞门**取证：

```
G1 lit=19 half=15 dim=0  total=34  states=half,lit
G2 lit=14 half=5  dim=1  total=20  states=dim,half,lit
G3 lit=0  half=0  dim=22 total=22  states=dim
G4 lit=0  half=1  dim=20 total=21  states=dim,half
G5 lit=0  half=0  dim=23 total=23  states=dim
G6 lit=0  half=1  dim=15 total=16  states=dim,half
G7 lit=0  half=0  dim=8  total=8   states=dim
→ bands_with_dim 6   pageerrors 0
```

**6 个年级均出现了 `dim` 态**，证明「未明态」机制在画。FAIL 是取样偏差（只看了已学满的 G1）。

## 3. 端到端复跑（登录态 · 真实入口）

先修复了**部署根因**（见 §4），随后经 `https://localhost/tutor/#/pages/twin/world` 一键复跑：

```
logged_in_ui        true
dim_opts            branches,grades,district
dim_default         branches          ← N1 无回归：老用户进来还是「学科知识体系」
subject_active      MATH
subject_bar_visible 6（生物 化学 语文 英语 数学 物理）
D_shops             76                ← 「一间店 = 一节」，真的铺出来了
D_kpdoor            6                 ← 「一个 KP = 一扇门」，章内 6 扇
D_marks             1,2,3,4,5,6,7,8,9,10,11,12  ← 年级大道 12 枚里程碑
D_storefront_states dim,half,lit
pageerrors          0
strip_text          光脉点亮 · 33 / 144 节 · 微光 22 节（够得着 · 尚未掌握）
```

## 4. 复验中发现并修复的部署根因（关键）

**现象**：用户登录后点「学科城区」维度 → **0 店 0 门**，空态「城区要等链取到才铺——不造假楼」，控制台 6×404。

**根因**：`gri-api` 容器为 **2026-10-18 构建的旧烘焙镜像**（`services/api/Dockerfile` = `COPY dist`，**无源码挂载**），**缺 W5-a（`380c3d3`，10-20）新增的 `/api/curriculum/learning-chain` 与 `kp-cave`**。城区唯一数据源 `learning-chain` 在该镜像 **404** → 前端 `chainReady` 永假 → 城区不铺。旁证：容器内 `grep -rl learning-chain /app/services/api/dist` **空**；本地 `services/api/dist` 有 `learning-chain.js`。

**应急处置（已完成）**：`docker compose -f docker-compose.yml build api && docker compose -f docker-compose.yml up -d --no-deps api` → `learning-chain` **200 / 323689 bytes**；城区恢复（§3 数字）。

**系统性加固**：已拆卡 **W0-b 部署新鲜度守卫**（`.agents/codex/tasks/w0-b-deploy-freshness-guard.md`，Codex 产出 `scripts/deploy-freshness.sh` + health-check 路由存在性探针，助手独立复验通过）——把「改源码不重建烘焙镜像」变成一条命令 + 一个门禁。

## 5. 产物与改动核验

- `git diff --stat`（5 文件）：`world.vue +411 / CaveScene.vue +66 / art.js +199 / persona-world.css +35 / world.css +32`（`727 insertions, 16 deletions`），与 `w6a-file-list.md` 逐字一致。
- 新产出：`docs/SUBJECT_SUMMIT_DESIGN_V5.md`、`.agents/claude/outputs/{w6a-file-list.md,w6a-verify.sh}`。
- 键盘可达 + `prefers-reduced-motion`：`[data-kp-door]`/`[data-storefront]` 为 uni-button（`tabindex=0 role=button`）；reduce 下光脉/提示动画 `animationName=none`。

## 6. 诚实缺口（照实记录，非阻塞）

- 库里 915 个 `math.num` KP 只有极少数有 mastery（`edu.mastery_snapshots` 全库仅 183 KP 有记录）→「半亮」机制跑通但数据稀薄；图例已逐字写明「半亮 = 有作答且未到 80」。
- 难度数据仅 1/2908 → 城区**无难度轴**，路的前后是**学习顺序**（图例红线：「顺序不是难度」）。
- `chem/chn/eng` 的 KP `code` 全 NULL → 跑不了闭环 → 只默认铺 math，其余走空态明示「不造假楼」。
- 成就数据不在册（`edu.achievements=0`）→ 奖励文案降级为「以亮灯为记」，无伪造成就。

---

**判定**：**done_verified**。唯一 FAIL 是账号状态伪像；独立探针（7 年级遍历）与登录态端到端复跑（76 店/6 门/12 里程碑/三态/0 pageerror）全绿；期间发现并修复的 `gri-api` 镜像过期属**部署**问题，已由 W0-b 固化为守卫。
