# W6-a 学科登峰 v5「学科城区」交付说明

**分支**：`feat/stage-c-unified-auth-shell`（HEAD `b97fda5`，本卡**未提交**）
**复验人**：独立复验代理（**不是实现者**；实现者为上一张卡 W5-b 的作者）
**复验时间**：2026-10-21
**独立复跑结果**：`PASS=271 SKIP=5 FAIL=0`，exit=0
（命令：`rm -rf /tmp/w6a-keep && W6A_TMP=/tmp/w6a-keep bash .agents/claude/outputs/w6a-verify.sh`）

> **数字口径**：独立复验代理跑的是 `PASS=266 SKIP=5 FAIL=0`。5 条差额来自**复验之后**新加的两段加固
> （§3 的运行时几何类对账 4 条 + §6 半亮断言改阈值 1 条），代理所报的 266 是它那一版的真实结果。
> 详见 §7.1 的处置记录。

设计文档：`docs/SUBJECT_SUMMIT_DESIGN_V5.md`
验收脚本：`.agents/claude/outputs/w6a-verify.sh`（被验对象，与产品源码严格隔离）

---

## 1. 用户裁决与三条硬诉求的落点

用户 2026-10-20 裁决：宏观叙事**弃「山峰登顶」**，改 **方案 A「学科城区」**。三条硬诉求：

| # | 诉求 | 物化 | 代码落点 |
|---|---|---|---|
| ① | 因果要**可走可感知** | **道路通断**：未学的路段仍是**连续一条路**，只是灯没亮 | `districtRoads`（`world.vue:1254`）画 `roadSegment`；`kp_path_contiguous=yes` 实证「一排门等距连续」 |
| ② | **每个知识点 = 一扇楼门**（章内 6–8 个，真实可点） | 点门直达楼内**学科书房**（平面 SVG 生活场景，主 surface）；原岩洞**降为楼内可选地下室**（第二 surface，同一闭环） | `districtKpRows`/`kpDoorPoints`（`world.vue:1283`、`1290`）+ `data-kp-door`（模板 344 行）；书房 = `lifeScene`，地下室 = `caveScene` + `basementHatch` |
| ③ | 楼内跑既有**智学慧眼闭环** | 讲解 → 点出题 → 判题 → 掌握度（真源 `edu.mastery_snapshots` ≥80）→ 出洞亮灯；答错不罚（暗摆 + 错题/复习入口 + 给答案与解析） | `CaveScene.vue` 闭环面板；`lit_after 28`、`node_after_state lit`、`node_after_mastery 100` 实证 |
| ④ | 直观引导**两套体系** | 横轴 = **年级大道**（K12 12 枚里程碑）；纵轴 = 街区（学科） | `avenueMarks`（模板 364 行，12 枚 `data-avenue-mark`）＋ 纵轴学科街区 |

---

## 2. 为什么选方案 A（不选 B/C）

设计文档 §0 的诊断是：登峰隐喻有三条**结构性**毛病——「山顶」暗示难度最高（库里无难度数据）、「爬」把并列的知识点画成唯一纵轴、山峰给不出「两套体系正交」的地方。方案 A 的城区一上来就避开：

- 城区天然有**横纵两轴**：一条**年级大道**（横 = K12，用户能看见自己在第几公里）+ **街区**（纵 = 学科完整体系）→ 两套体系不再互相抢占同一个方向。
- 城区天然承认**并列**：一门学科本来就是一片街区里有几十间店（节），不存在「只有一条最优上山路」。
- 「路」这个隐喻比「山」更**朴素可验证**：路通不通 = 前置学没学。这让「因果可感知」从美术口号变成**可断言的几何**（下一节门与当前门等距连着，就是连续一条路）。

## 3. 楼门 = 知识点洞口（粒度裁决）

库里 KP 有两级：**门**级 2354 个、**节**级（章）144 个（math.num）。设计文档 §3 的裁决是**一节 = 一间店，一个 KP = 一扇门**（章内实测 6–8 个）：
- 一门铺 2354 扇门 = 满屏噪点，看不出体系；
- 一节只有 1–3 个 KP，又撑不起「一排门」和「一条街」的体量；
- 6–8 扇门正好是一排可点的门面，也正好是一间「店」的橱窗宽度。
故 `[data-kp-door]` 实测 6 个、`kp_path_n=6`、`kp_path_gaps=92,92,92,92,92`（等距 = `CAVE_BAND.nodeW` 同一常量，证明是一条连续路径）。

## 4. 书房主 surface / 岩洞降地下室

主 surface 是**楼内书房**（`lifeScene`，三面退晕墙 + 木地板 + 窗光，平面 SVG），这是用户「类似生活场景」的直接诉求；原 v4 的岩洞没有删，降为**楼内可选地下室**——`basementHatch` 放一个舱口开关，下去是 `caveScene` 岩壁三环，**同一份 `kpSeeds`、同一条闭环、同一掌握度真源**（`basement_room_gone=yes` 证明是真的换了画法而不是叠了一层）。诚实口径逐字写进图例：*「地下室是同一间店的岩洞探索室，走的是同一条闭环；楼上楼下不改变掌握度真源」*。

---

## 5. 改了哪些文件、每个为什么

### `apps/web-ai-tutor/src/pages/twin/world.vue`（+411）
本卡主改动面。
- **814 行附近 / `867`**：新增第三维度 `{ code: 'district', name: '学科城区' }`，默认仍是 `dim = ref('branches')`（869 行）→ N1 无回归：老用户进来还是原来的峰。
- **`1142`–`1163`（最重要的一处）**：新增 `kpLightOf(kp)`。`lightStates` 是 `deriveLightState(chainNodes, edges)` 的产物，**只按节 code 建键**；而 `stateOf(k.code)` 拿 KP code 去查必然落空 → 恒 `'dim'` → 街头楼门把「有作答未到 80」的知识点画成从没碰过，而同一盏灯进楼是 `half`——两个面互相打脸。`kpLightOf` 改为直读 chain 每个 kp 自带的 `mastery`/`state`，口径与后端 `learning-chain.ts` 的 `stateFor()`（`mastery == null ? 'dim' : mastery >= 80 ? 'lit' : 'half'`）逐字对齐。**1158–1163 是实现，1148–1157 是这段踩坑的注释。**
- **`1231`–`1362`**：城区派生层——`districtStorefronts`（一间店一节）、`districtRoads`（楼间的路）、`districtKpRows`（楼前一排门，`...k` 展开以保住 kp 的 mastery 真源）、`kpDoorPoints`/`kpPathLayout`（复用 `caveTrailLayout` 与 `CAVE_BAND.nodeW`，**不新写几何**）、`avenueMarks`（12 枚里程碑）。
- **`1513`、`1541`–`1543`**：`openCave` 里「优先取还没亮的知识点」从 `stateOf(k.code) !== 'lit'`（恒真 → 退化成「永远第一个」）改为 `kpLightOf(k) !== 'lit'`。
- **`314`、`339`、`364`、`372`、`408`–`415`**：模板新增 `data-storefront` / `data-kp-door` / `data-avenue-mark` / `data-district-empty` / 图例三条诚实口径（`data-legend-order`「顺序不是难度」、`data-legend-half`「半亮 = 有作答且未到 80」、`data-legend-basement`「地下室同一条闭环」）。
- **`1636`–`1638`**：`districtPick` 钉住刚上过课那一间，切维度不丢当前视角。

### `apps/web-ai-tutor/src/components/world/CaveScene.vue`（+66）
- **`318`–`331`（`kpSeeds`）**：同样对齐 `stateFor()` 口径。原先是 `m > 0` 才算 half，**答错后 mastery=0 会被画成 dim**（从没碰过），与楼门的 `kpLightOf` 打脸。改为 `m == null ? dim : m >= 80 ? lit : half`（0 属半亮）。
- **`311`–`316`**：`activeScene` 增加书房/地下室切换；`canGoBasement` 仅在主 surface 为书房时才有意义。
- 补上闭环面板的四个智学慧眼出口（错题 / 复习 / 计划 / 监督）。

### `packages/world-art/src/art.js`（+199）
**N2「一份画法」唯一真源**：新增 `gradeAvenue`（年级大道）、`storefront`（店面三态）、`roadSegment`（楼间路）、`barricade`（路障）、`lifeScene`（书房平面生活场景）、`basementHatch`（地下室舱口）、常量 `DISTRICT`。全部零色值（几何层），零 SVG `<text>`（uni-app H5 的 SVG text 不渲染，老坑）。

### `styles/tokens/themes/persona-world.css`（+35）
新增 21 个 `--world-*` 令牌（road / storefront / barricade / room-* 六组），**全部显式注明等同哪条既有档**（如 `--world-road: #f1eddd; /* = --world-path 同档 */`），让城区延用同一套黎明色域而不是另起炉灶。declared 214 个。

### `styles/world.css`（+32）
17 条 `.w-*` 几何类映射（`.w-road` / `.w-storefront-*` / `.w-room-wall-*` 等），全部 `fill: var(--world-*)`，零裸色。

### `docs/SUBJECT_SUMMIT_DESIGN_V5.md`（新增）
方案 A 设计、三条机制从「山」到「城」的搬迁表、粒度裁决、诚实口径红线、分期（P1 骨架 / P2 铺开 / P3 其它学科 + 深色世界）。

---

## 6. 诚实缺口（这几件事产品没做到，别当成已交付）

### 6.1 库里 915 个 KP 有 779 个无 mastery（未学过）
独立复核：`edu.knowledge_points` 共 **2908** 个 KP（math 2354 / phys 541 / chem 10 / chn 1 / eng 1 + 1 条 subject 为空），`math.num` 这一支 144 节共 **915** 个 KP，其中**有作答史的只是极少数**（`edu.mastery_snapshots` 全库只有 183 个 KP 有过记录）。所以：**绝大多数楼门进楼就是「从没学过」**，「半亮」这个态在库里的真实存量很稀薄——它是**跑通了的机制**（本次答错用例当场把 `wrong_state_after` 从 dim 推成 `half`），但不是一块现成的丰富数据。图例因此逐字写明**「半亮 = 有作答且未到 80，不是『会了一半』」**，就是怕用户把稀缺态读成一种常态。

### 6.2 难度数据仅 1/2908 → 图例明写「顺序≠难度」
独立 SQL 复核：`count(*) WHERE level IS NOT NULL` = **1**（全库 2908 条里唯一一条）；`prerequisites` 非空同理极少，且 `explicit` 边实测**全部落在同一节内**（跨节 0 条）。所以城区**没有难度轴**——路的前后是**学习顺序**（先学后学），不是难度高低。这条不是遗漏而是**主动的红线**：如果硬画难度轴，用的是臆造数据。

### 6.3 chem / chn / eng 没有 code，跑不了闭环
独立 SQL 复核：`chem` 10 个 KP **全部 `code` 为 NULL**，`chn`/`eng` 各 1 个也全 NULL（`phys` 14 个 NULL，math 8 个 NULL）。`code` 是全链路键（learning-chain / 楼门 / 洞内灯位都按 code 对齐）→ 这三个学科的楼门**一个都立不起来**。所以城区**只默认铺 math**（`district_blocked=no`，76 间店真的铺出来了），其余学科走 `data-district-empty` **空态明示**，不造假楼。

### 6.4 另外三个明示缺口
- **答错用例的灯位是「另找一家暗窗店」凑的**：§7 点亮目标节后，当前窗内楼门全亮，练不出答错。脚本因此先显式走到一家 `dim` 店再挑灯位（`wrong_dim_shop=math.g1.pep.ch06.s01`）。这是**真实路径**，但意味着「刚学完一节立刻原地练错题」这条自然路径没被覆盖。
- **成就数据不在册**：奖励文案降级为「成就数据暂未收录，先以亮灯为记」（`cave_reward_note` 原文如此），没有伪造成就计数。
- **运营台无洞窟看板**：本卡只做学生面。

---

## 7. 复验人独立复核记录（逐条）

| 复核项 | 方法 | 结果 |
|---|---|---|
| 数字是否真 | 独立跑全脚本（未改任何一行） | `PASS=266 SKIP=5 FAIL=0` exit=0，与实现者所报**完全一致** || §8④ 答错用例是否真空跑 | `grep RESULT wrong /tmp/w6a-ind/e2e.log` | **真的跑了**：`wrong_skipped=no`、`wrong_dim_shop=math.g1.pep.ch06.s01`、`wrong_kp_state=dim`、`wrong_stage=wrong`、`wrong_state_after=half`、`wrong_lit_after=28 == wrong_lit_before=28` |
| `pageerror/console.error=0` 是否恒 0 | 读 E2E 源码确认 `watch()` 真注册了 `page.on('pageerror')` 与 `page.on('console', m.type()==='error')` 两个处理器并 push 进 `ERRORS`，末行 `emit('pageerrors', ERRORS.length)` | **是真计数**（非恒 0）；本次 `RESULT pageerrors 0` |
| 零裸色 | 脱离脚本、手工重跑三重 grep 与 var 覆盖 | 色值字面量 0 / 具名色 0 / `art.js` 零色值 0；`--world-*` 用到 206 个、`persona-world.css` 声明 214 个、**零缺失**；三类边各独立色值（`#cfd6c8 / #dcc9a0 / #e7bd72`） |
| 5 条 SKIP 是否「真的不适用」 | 逐条核对：后端 diff 为空（无运营读面）；`grep dark` 设计文档 §6 明写 P3 才做深色世界；`package.json` 无小程序构建目标；改动文件零触摸手势代码 | **全部合理 SKIP**，无「跑了但没断言」糊成 SKIP 的情形 |
| HEAD / 暂存区 | `git rev-parse HEAD` + `git status --porcelain` 复跑前后各一次 | HEAD 两次都是 `b97fda5`，暂存区空，**零提交** |
| 产物真伪 | `ls -la` 看字节 + PNG 头解尺寸 + 直接看图 | `build.log`(457B) / `chain.json`(320KB) / `e2e.log`(12.7KB) / `chain.g1.json` / `kp.json` / `cave.json` / `orphan.json` 全在；`/tmp/w6a-ind/shots` 下 10 张截图全部 `1480x1060`、190–296KB（非空图），`06-cave-wrong.png` 目视可见「答错了不扣什么」「正确答案：A. 6 支」「当前掌握度 0 / 100」「去错题本 / 去复习」 |
| 断言语义强度 | 全文扫 `res_ge … 0` / `res_has … "."` 型弱断言 | 见下节 |

### 7.1 复验人发现的问题（照实报，不替实现者圆）

**① 一条实际不成立的弱断言（已按复验人建议修掉，不是延到下一卡）：**
```
:w6a-verify.sh:983   res_ge "band_node_half" "$E2E_LOG" "0"  "洞位三态：半亮（w-node-half，光流到的后继）"
```
`res_ge … 0` 是 `>= 0`，**恒真**：半亮一个都不画也照样 PASS。这条想断的是「半亮态确实在画」，但写成 0 就等于没断。（复验人那次实测 `band_node_half=10`，行为是真的，只是断言兜不住。）

**处置**：阈值改为 `1`，并写清取向——**宁可将来它变成假 FAIL，也不要假绿**：testuser 一旦把某节全学到 80，半亮就归零，届时报错会逼着人造点半亮数据再看，而假绿会让人以为这条一直有人在守。复验人全文扫过 `res_ge "0"` 型就这一处；实现者又扫了 `res_le "0"` / 裸 `ok_ge "0"` / `res_eq "0"` 三种同族写法，另两条 `res_eq … 0`（显式前置边不叠线、`pageerrors=0`）是**合法**的零值断言，不属此病。

**复验人侧另发现一处同族、由实现者自查补掉的问题**：§3 新增的「运行时几何类对账」那四条，第一次写的时候把嵌入的 `.mjs` 崩在 `readFileSync(ROOT + "styles/world.css")` 少一个斜杠上；该段 stderr 被 `>/dev/null 2>&1` 吞掉、json 根本不生成，而 `rget` 读空 = 空字符串 = 「零 undeclared / 零 dead」= **两条断言假绿**。已加 `ok_file` 守卫 + `RT_CALLS ≥ 17` 真调用计数，并把 `argv` 下标写反（拿输出 json 路径当仓库根）的坑注在脚本注释里。这也正是本卡 §3 要「数几何源、不数 DOM」的理由——`block()` 用 `` c: `${tone}-left` `` 模板拼类名，静态 grep 看不见，只有真调一次画法函数才证明类真的发出来了。

**复跑**：修完 `PASS=271 SKIP=5 FAIL=0`，四条运行时断言逐字 PASS（`calls=17`、`undeclared`/`dead`/`p2dead` 全空），半亮实测 `band_node_half=13 ≥ 1`。

266 条里除了上述一条，无第二处恒真；`res_has "wrong_dim_shop" … "."` 那条虽看着弱，但它紧接着有 `res_ne "wrong_dim_shop" "none"` 兜住「不能是 none」，不构成漏洞。

**② 一处复验人侧的观察（不算产品缺陷）：** E2E 全程 `clickFallback` 41 次（真点击因元素带常驻呼吸动画等不到 stable，回落 DOM click）。这是脚本技法（`clickHot` 的两段式），不掩盖问题，但意味着**「真人点得动」只是间接证据**——触屏手势本来就明示 SKIP（§14 第 5 条）。

**③ 14 处 clickFallback 之后没有一条 note 提示用户**（`#` 注释只在最后几处显式打印了入口楼门）。属于脚本可读性，不影响判定。

---

## 8. 凭据处理

- 只用 dev 测试账号；脚本从 `E2E_IDENTIFIER` / `E2E_PASSWORD` 读，默认值是 dev 测试凭据，可被 env 覆盖。
- 工作区后端口令只从容器 env 读进变量后注入子进程，**脚本不打印、本文件不落**。
- §12 grep 复核：脚本与交付说明零 `nvapi-` / 零 `Bearer <长令牌>` 字面量；口令字面量全脚本仅 1 处（env 默认值）。
