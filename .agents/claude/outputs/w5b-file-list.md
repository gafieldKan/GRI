# W5-b 交付文件清单 · 学科登峰 v4「黎明破晓 × 光脉传导」

> 卡：W5-b（Claude 面）｜页：`apps/web-ai-tutor`「学习世界 · 登峰」（`pages/twin/world`）+ 洞内组件
> 数据面：只取 W5-a 只读 API（`/api/curriculum/learning-chain`、`/api/curriculum/kp-cave`）与既有练习/诊断面，**未改后端**。
> 约束：山体仍作宏观骨架、双维度不许回归；零裸色；非 3D；不改契约、不动 explorer；**不 commit / 不 checkout**；凭据零泄漏。

## 一、改动文件（工作树，未提交）

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/web-ai-tutor/src/pages/twin/world.vue` | 改 | 登峰页 v4：晨雾（M1）、光脉传导（M2）、节洞带 + 年级洞门（进洞 ≤2 步）、首屏 v4 读数条（N9）、三类边与图例 + 跨年级引导去向旁支（N5）、关洞必回落真源（M2 不断链）、双维度与 W4-b 全保留（N1） |
| `apps/web-ai-tutor/src/components/world/CaveScene.vue` | 新 | 洞内：平铺 SVG 生活场景 + 智学慧眼闭环（讲解→练→判→错题/复习→掌握 ≥80→出洞亮灯）（M3） |
| `packages/world-art/src/art.js` | 改 | v4 共享画法（一份，页面零另写）：`fogPuff` / `fogBank` / `ridgeGlow` / `lightBeam` / `lightHint` / `caveDoor` / `caveNode` / `caveEdge` / `caveScene` / `caveSeed` + 推导 `deriveLightState` / `predecessorMap` / `successorsOf` / `edgeToneClass` / `edgeKindWord` / `lightProgress` / `gradeGroups` / `gradeDoorState` / `doorStateWord` + 常量 `LIGHT_STATES` / `CAVE_BAND` |
| `styles/tokens/themes/persona-world.css` | 改 | 世界色源新增 v4 令牌（晨雾三档 / 曙光 / 光脉三档 / 未明 / 山脊微光 / 节洞三态 / 三类边 / 洞窟与洞内场景）；仍是唯一色源 |
| `styles/world.css` | 改 | 几何类 → 令牌映射新增 v4 类名（`.w-fog-*` / `.w-ridge-glow` / `.w-dawn-glow` / `.w-light-*` / `.w-node-*` / `.w-edge-*` / `.w-cave-*`）+ 三支关键帧（`w-flow` 行进 / `w-hint` 呼吸 / `w-breathe` 明灭）+ `prefers-reduced-motion` 降级 |
| `apps/web-ai-tutor/src/api/index.js` | 改 | 两个只读客户端：`getLearningChain`、`getKpCave`（W5-a 读面） |
| `apps/web-ai-tutor/src/store/practice.js` | 改 | 把判题函数 `checkAnswer` 提到模块级并导出（纯函数，零行为改动）——洞内闭环与「练一练」页**共用同一条判定**，杜绝两套判定（判定分叉 = 掌握度/光脉会撒谎） |
| `.agents/claude/outputs/w5b-verify.sh` | 新 | 本次验收脚本（§0–§14；末行 `FAIL=0`） |
| `.agents/claude/outputs/w5b-file-list.md` | 新 | 本清单 |

构建产物 `apps/web-ai-tutor/dist/`（gitignore）与 `node_modules/` 不计入改动。
协作面（另一执行者）：`services/api/src/modules/curriculum/learning-chain.ts(.spec.ts)` 与 `.agents/codex/outputs/w5a-*` 为 **W5-a 数据面**，本卡未改；§13 把它们单列成「协作面」——**不算越界，也不计入本卡的改动面**（本卡只读它们的读面）。

## 二、三条机制怎么落的

| 机制 | 落法 | 可断言处 |
|------|------|----------|
| **M1 晨雾即未知** | `fogBank`/`fogPuff` 三层（近实/远虚/整层幕）罩住「光脉前沿」以上的山面，雾中留 `ridgeGlow` 轮廓微光；雾只被**相邻**的光驱散（前沿随已亮节前移，不跳段、不凭空开天窗） | `.w-fog-near/-far/-veil`、`.w-ridge-glow`、`[data-frontier]`「雾退到此」 |
| **M2 光脉传导（魂）** | 答对/达成 → 该点亮（`w-node-lit` + `w-node-halo-lit` 呼吸）→ 光沿链流向后继（后继暗→半 `w-node-half`）→ 沿边画行进亮束 `w-light-pulse`（CSS `w-flow`）与下一目标呼吸光 `w-light-hint`（`w-hint`） | 三态类计数、`light_pulse`/`light_hint`、答对后 `lit` 恰好 +1、该节 `state=lit` |
| **M3 洞窟即闭环** | 点年级洞门 → 节洞带 → 点一个洞 → `CaveScene` 平铺 SVG 生活场景（同一套 `w-cave-*` 画法）→ 洞内一键推进：讲解（AI 教师授课状态机）→ 练一练（课程题库真题）→ 判（与练一练同一条判定）→ 掌握 ≥80 → 出洞亮灯 + 奖励 + 光自动向前传导。**关洞（含「先出洞」的软出洞）都会回落一次真源**——只要本次进洞点亮过灯位，世界就重取链、重新推导光脉与雾界，光脉绝不停在旧读数上 | `[data-cave-*]` 全套选择器；出洞后链上该节 `lit`、已亮 +1、**读数条数字与 API 读数一致** |

**N6 引导四件套**：① 雾只被相邻光驱散（前沿读数「雾退到此」）；② 每个入口都给「下一个最佳目标」（`summary.next`，读数条 + `w-light-hint` 呼吸）；③ 洞门三态（暗门 / 半亮 / 亮灯，`doorStateWord`）；④ 答错不罚（`is-dim` 暗摆 + 自动接上错题本 / 复习 due，且光脉不前移）。
**N5 软边**：`soft` 边画成虚线 + 最淡一档（`--world-edge-soft` 是三类边里唯一的浅冷灰），并在图例里写明「引导路径（非精确前置，仅供引导）」，绝不画成必修。
　· **实测的数据面事实**（§2 有断言）：`explicit`（显式前置）边**全部落在同一节内**（跨节 0 条），`soft`（引导路径）边**全部跨年级**（如「小六末 → 初一初」）。所以节级「节↔节」的图上，显式前置已被收拢进同一节（不重复叠线），引导路径则一条也画不进单年级的节带。**故端上在节带内给「有引导去向」的节另画一条最淡虚线的旁支 + 端点小点**——「引导」在世界上真的可见，且一眼看得出它比实线弱、不是必修。
**N11 性能**：整支一次取回，端上按年级分段（`gradeGroups`）只铺一个年级的洞带 + 横向滚动；雾/光/洞全是 SVG + CSS 关键帧，非 3D、无逐帧 JS。

## 三、零裸色（三重 grep）

- 色值扫描面 = `world.vue` / `CaveScene.vue` / `api/index.js` / `world-art/src/` / `world.css`：**hex / rgb / hsl / 具名色 全部 0 处**。
- `persona-world.css` 是调色板真源，本身承载色字面量，故不纳入色值扫描（w4b 同口径）。
- 新增的 `w-*` 几何类全部只在 `styles/world.css` 取值，且取值一律 `var(--world-*)`；§11 另验「用到的 `--world-*` 全部有声明」。

## 四、数据来源（只读，未改后端）

| 接口 | 用途 |
|------|------|
| `GET /api/curriculum/learning-chain?subject=&branch=&grade=` | 一分支的节 + 先修/序列/引导三类边 + `summary{total,lit,next}`（M1 前沿、M2 光脉、N6② 下一目标、N9 读数的真源） |
| `GET /api/curriculum/kp-cave?kpId=` | 洞内聚合：掌握度 / 态 / 前置 / 题入口 / 下一节（登录再叠加错题 due、复习 due、成就 count，匿名不臆造） |
| `GET /api/curriculum/knowledge-points?gradeLevel=` | 知识点 code→id 映射（洞内灯位要 uuid 才能取题/取聚合） |
| `GET /api/curriculum/knowledge-points/:id/questions` | 洞内练一练的真题（与「练一练」页同一题库） |
| `POST /api/tuition/practice/answer` | 作答落库（既有练习管线；后端信任前端判定） |
| `GET /api/agent/me/diagnosis` | 刷新掌握度快照（掌握度唯一真源 `edu.mastery_snapshots`，学习链/洞门三态/光脉都以它为准） |
| `GET /api/agent/me/lesson` | 洞内讲解（复用 AI 教师授课状态机，不重造讲解） |

**掌握度口径（诚实）**：节的掌握度 = 该节各知识点掌握度均值；知识点掌握度 = 该点作答记录的正确率（`correct/attempts`）。故「一次答对」只点亮**一个灯位**，整节的灯要逐灯位点亮才亮——光脉不会为一次作答谎报一整节。

## 五、验收

`bash .agents/claude/outputs/w5b-verify.sh` —— 末行打印 `FAIL=0`（实测 `PASS=217 SKIP=5 FAIL=0`）。
含真浏览器 E2E（学生身份、同源双 App 托管、**真实作答**）：读晨雾/光脉/边/洞门 → 进洞跑完整闭环（逐灯位讲解→练→判→掌握 ≥80）→ 出洞验链上亮灯与已亮 +1 → 再验答错不罚（暗摆 + 错题/复习入口 + 光脉不前移）→ **pageerror / console.error = 0**。
最近一次 E2E 的实测轨迹（`W5B_TMP=/tmp/w5b-tmp3` 可复现）：干净节 `math.g1.pep.ch03.s06` 的 8 个灯位逐灯位答对 → 每个 100/100 → 洞内亮灯 → 出洞后链上 `state=lit`、掌握度 100、已亮 `5 → 6`、**读数条同步显示 `6 / 144 节`**；答错一路：`stage=wrong` + 暗摆 + 不亮灯 + 错题/复习入口 + 给正确答案与解析 + 该节 `half`、已亮总数不变。
截图落 `/tmp/w5b-shots`（`01-world-strip` / `02-band` / `03-cave-idle` / `04-cave-loop` / `05-world-lit` / `06-cave-wrong`）。
脚本 §0 会**自起一份工作区后端**（`:3011`）给 E2E 用：W5-a 的两个读面只存在于工作树源码，`gri-api` 容器镜像早于 W5-a（同路径 401/404），不另起就验不到真数据。
排障开关：`W5B_TMP=<dir>` 保留临时目录（E2E 原始 `RESULT` 行、构建日志都在里面）。

## 六、两个实现决定（值得记下来）

1. **洞内判题不走 `lesson.submit`，走已发货的练习管线。** 理由：`packages/agent-core` 的 `validateAnswer()` 只判 `choice|fill|text|essay` 四种题型，而 K12 题库里 7855 道题的 `type='multiple-choice'` —— 走 `lesson.submit` 会**一律判错**（后端既有缺口，属 N4 范围之外，本卡不改后端）。故洞内闭环对齐「练一练」页：本地用**同一个** `checkAnswer`（已提为模块级导出）判定 → `practice.answer` 落库（后端信任前端判定）→ `diagnosis` 刷新掌握度快照 → 再读 `kp-cave` 拿权威掌握度与错题/复习 due。这样「洞内亮灯」与「练一练」的判定、落库、掌握度**完全同源**。
2. **节灯与灯位分层。** 洞内点亮的是**灯位（知识点）**，出洞时若整节均值 ≥80 才让**节**亮。干净节上答对全部灯位即 100 → 节亮；已有的作答题会如实拉低均值（本卡实测：某节点因历史作答，掌握度 21.5 → 半亮，不会因一次答对就冒充「已亮」）。
   · 顺带实测到的口径（**如实记下，不改后端**）：`learning-chain` 里该节的 `mastery` 是**按「已作答过的知识点」求均值**——一节里只答对其中 2/8 个灯位，该节也会是 100。所以「洞内亮灯」诚实的说法是「**答对的那些灯位**都到了 80 以上」；「整节灯亮」是这层均值的果，不是「8 个都答过」的果。本卡不臆造更严的口径，只如实呈现 API 的读数。
3. **关洞必回落真源。** `exitLit()`（亮灯出洞）走 `emit('lit')` → 世界强制重取链；但 `[data-cave-exit-soft]`（「先出洞」，掌握不足时的那条出口）**只发 `close`**——上一版 `closeCave()` 不重取，于是「答对了几个灯位后先出洞」的场景里，世界会停在旧读数上，M2 的「光自动向前传导」直接断掉。故本次让 `CaveScene` 的 `lit-kp` 事件把 world 的 `caveLitAny` 置真，`closeCave()` 见到它就回落一次真源（并让 `onCaveLit()` 清掉该标记，避免同一次出洞重取两遍）。这条是 E2E 逼出来的真缺陷，不是纸面推演。
