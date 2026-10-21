# W6-c 学习世界 v6「三维度分页分离」交付说明

分支：`feat/stage-c-unified-auth-shell`　基线 commit：`d9aaede`（设计文档 + 落卡）
本卡零提交：改完只跑验收，不 commit / 不 checkout（验收脚本 §13 断言 `HEAD` 未变）。

验收：`bash .agents/claude/outputs/w6c-verify.sh` → **PASS=289 / FAIL=0 / SKIP=7**
用例：`npx vitest run`（apps/web-ai-tutor）→ **46 passed / 7 files**

---

## 一、做了什么

学习世界 v6 把原来「学科登顶」的一块画布，按**三个正交维度**拆成三块自洽画布，
切维度 = 换世界（`v-if` / `v-else-if` 顶层收口，同一时刻只挂一张，不是三张叠在一起）：

| 维度 | 语义 | 画布 | 尺寸 | 画法语汇 |
|---|---|---|---|---|
| A `branches` | 学科知识体系 | 分支群峰（沿用 W4-b） | viewBox `0 0 1200 820` | `w-peak-*` / 海拔轴 / 攀登人物 |
| B `grades` | K12 阶段 | K12 升学阶梯（**新**） | viewBox `0 0 1600 760`，1:1 不硬缩 | `w-stair-*` / 人教版册卡 / 学段台阶 |
| C `district` | 学科城区（街区网格） | 学科城区（**新**） | 基 1600×900，**宽由楼栋列数算出**，可横向滚动 | `w-city-*` / 楼体三面 / 楼门三态 |

设计依据：`docs/SUBJECT_SUMMIT_DESIGN_V6.md`（已随 `d9aaede` 提交，本卡不改它）。

### 核心裁决（本卡的三条硬线）

1. **整条删除「年级大道」**（v5 的 `w-road` / 年级横向主干道）与 v5 散点店面 ——
   设计 §4 判它为「把 K12 册与城区混为一谈」的根源。城区页内 `[data-storefront]` = 0、
   `w-road*` = 0，K12 页内楼栋/楼门 = 0，互为负面断言（N1 语汇互斥落到 DOM 元素计数上）。
2. **行 = 街区（学科分支）· 列 = 楼栋（章）· 楼门 = 知识点**。
   一街一支（10 条街）/ 一栋一章（实测 140 栋）/ 一门一 KP（选中楼前排 6–12 个）。
3. **楼门三态真源沿用**：`kpLightOf` = `mastery == null ? 'dim' : '>= 80' ? 'lit' : 'half'`，
   与后端 `stateFor()`、`CaveScene.kpSeeds` 逐字对齐（三个面同一个口径，不互相打脸）。

### 图例诚接口径（逐字在册，验收逐条断言）

- 「路的先后是课程序列（先学后学的顺序），**不是难度高低**」
- 「半亮 = 有作答且未到 80，**不是「会了一半」**」
- 「空位 = 该年级还没收录这一科」（K12 空态不造假册）
- 城区读数写「街区有楼 / 已亮」（诚实的分母）

---

## 二、改动清单（按文件）

### 新增

| 文件 | 作用 |
|---|---|
| `apps/web-ai-tutor/src/__tests__/world-art-city.test.js` | 城区几何回归，12 条。锁两个**真崩过**的缺陷：`cityGridLayout` 回填数据导致页面读 `undefined.length` 白屏；`cityScaffold` 拿常量 `CITY.w` 当底图宽 → 1600px 之后断街。另锁「只回展示字段不回 `chapters`」「宽随章数增长」「空数据不炸」 |
| `apps/web-ai-tutor/vitest.config.ts`（同内容重写为显式别名） | vitest 解析 `@world-art/art.js` 的别名真源。此前测试目录根本不存在，本卡才把它建起来 |
| `.agents/claude/outputs/w6c-verify.sh` | 验收脚本，982 行 / 289 断言：构建 → 零裸色三重 grep → 真浏览器 E2E（三维度几何探针 + N5 不重叠 + 闭环）→ 无回归 → 凭据零泄漏 → 改动范围 |
| `.agents/claude/outputs/w6c-file-list.md` | 本文件 |

### 修改

| 文件 | 行数 | 改了什么 |
|---|---|---|
| `apps/web-ai-tutor/src/pages/twin/world.vue` | +1141/-355 | 主体。三块画布按维度分页；维度 B/C 的画布内联宽高**数据驱动**（`STAIR.w/h`、`cityLayout.w/h`），不再硬缩；册卡热点/楼栋热点与 SVG 同一列坐标真源 |
| `packages/world-art/src/art.js` | +397 | 新增 `STAIR_*` 与 `CITY_*` 两组几何原语 + `cityGridLayout` / `cityScaffold` / `cityDoorRow` / `cityRoad`。**零色值**，只产几何 + `w-*` 类名 |
| `styles/tokens/themes/persona-world.css` | +39 | v6 新令牌（`--world-stair-*` / `--world-city-*`）。**色值唯一真源** |
| `styles/world.css` | +48 | 几何类 → 令牌映射。新增 `.w-stair-*` / `.w-city-*` 两组；给城区街牌与 K12 学段名各立一个**专用类**，不借 `.w-axis-label`（否则「城区页海拔轴刻度 = 0」这条互斥断言永远扫不干净） |

---

## 三、验收结论（W6-c-verify，289 PASS / 0 FAIL / 7 SKIP）

### 通过的关键项

- **§1 构建**：`npm run build:h5` exit 0；产物带齐 v6 令牌与几何类映射。
- **§2 零裸色**：`world.vue` / `CaveScene.vue` / `api` / `world-art` / `world.css`
  三重 grep，无 hex / rgb / 具名色；`--world-*` 全部在令牌真源有声明（231 个）；三类边各有独立色值（N5）。
- **§3 N1 场景互斥**（不是「元素 = 0」那么弱，而是画法语汇互斥）：
  - B/C 画布内 `w-peak-*` / 纵深尖塔 / 攀登人物 **各 = 0**；
  - B/C 画布内「我在这」海拔线 = 0（B 换成阶梯「我在读」）；
  - C 画布内 `[data-storefront]`（v5 散点店面）/ K12 册热区 / 海拔轴刻度 **各 = 0**；
  - A 画布内楼栋 / 楼门 / K12 册热区 **各 = 0**（城区元素不渗回群峰）。
- **§4 分页**：三档维度切换器在，默认仍是 A；同一时刻 `scenes=1`、画布内 `svgNum=1`（不是叠层）；
  切出去再切回，群峰数不变（不丢状态）。
- **§5 ★N5 不重叠**：`[data-book]` 两两交集最大面积 = **0**；`[data-building]` = **0**；
  `[data-kp-door]` = **0**；（列距 112 / 卡宽 92、楼距 168 / 楼宽 132，均 1:1 不硬缩）。
- **§6 K12 阶梯**：12 个年级列全覆盖；实测 23 张册卡、每列 ≤2；三级学段台阶在；
  「我在读 · 初一」按正则收口（**不写死账号年级**，换账号不判红）；
  `scrollWidth == sceneW == 1600`（内联宽，1:1）。
- **§7 城区网格**：10 街 / 140 栋 / 10 个街名牌全渲染；`scrollWidth 8615 > clientWidth 838`（真可横滚）；
  楼栋行距 ≥ 36（步道）；门排等距连续（相邻门中心距一致）；楼门三态 `dim,half,lit` **全见**
  （点遍 lit/half/dim 楼后取并集）。
- **§8 N8 动画降级**：`prefers-reduced-motion: reduce` 下城区照样铺得开（楼栋 140 / 楼门 12 仍在），
  动画时长归 0，零 pageerror / console.error；分页用 `v-if` 链收口（不逐帧重建 DOM）。
- **§9 无回归**：切回 A 群峰仍在（10 座）、仍站在同一座峰；纵深子分支热区在；
  楼门 → 洞内 **1 步**进洞；主 surface = 学科书房；洞内起始态 `idle`；灯位数 = 该节 KP 数；
  21 个页面全在册（无删页）。
- **§12 凭据零泄漏**：脚本与交付说明零 `nvapi-` / Bearer 字面量；口令只在 env 默认值处一处，
  可被 `E2E_PASSWORD` 覆盖且**从不打印**；不落任何 token 到盘上。

### SKIP（明示不计 FAIL）

运营台城区数据看板；生产 nginx `/tutor/` 静态托付观感（E2E 用同源双 App 托管复现同源条件）；
深色主题（世界令牌单一亮色黎明色域）；小程序端；真人触屏手势；`<use href>` 符号复用与 rAF 补间的帧率收益；
维度 B「章下钻右侧抽屉」（沿用既有册章详情面）。

---

## 四、这一轮修掉的真缺陷（都是真浏览器里逮到的，不是猜的）

1. **城区整页白屏**：`cityGridLayout` 不回 `chapters`，而页面选楼/图例读的是
   `rows[i].chapters.length` → `Cannot read properties of undefined (reading 'length')` →
   维度 C 一块画布都不挂。修法：几何与数据分家（几何函数只回坐标，页面自持 `cityRows`），
   并用单测把这个约定**两头**锁住。
2. **城区 1600px 之后断街**：`cityScaffold` 拿常量 `CITY.w=1600` 当底图宽，
   而城区画布宽是楼栋列数算出来的（一支跨 G1–G12 → ~8600px）→ 后半城只有楼、没有街面/路灯/绿化。
   修法：底图宽由调用方按 `cityGridLayout().w` 传入，天际线收边到真实右缘。
3. **K12 册卡两两重叠 697px²**：`.map-scene.is-stair` 的 `min-width:900px` + `aspect-ratio`
   把 SVG 压到 0.5625 缩放，而 HTML 册卡热点是百分比定位 + px 尺寸 → 热点挤在缩放列距里。
   修法：画布内联 `width/minWidth/height = STAIR.w/h`（1:1），册卡标签加 `max-width:92px` 上限。
4. **145 个街牌全是空白**：`cityGridLayout` 漏带 `branchName`，模板 `{{ r.branchName }}` 渲染空串。
   修法：补带展示字段（`branchName` / `clc`），只传 `branch` 时兜底到码，**仍不带 `chapters`**。
   单测补一条「**带街牌要读的展示字段**」。

---

## 五、怎么复跑

```sh
# 用例（46 条，秒级）
cd apps/web-ai-tutor && npx vitest run

# 完整验收（构建 + 真浏览器 E2E，分钟级；会真实作答，写 edu.* 表）
bash .agents/claude/outputs/w6c-verify.sh
# 末尾应为：PASS=289  SKIP=7  FAIL=0
```

验收前置：`gri-web-ai-tutor` / api 容器在跑（E2E 用同源双 App 静态托管 + dev 测试账号登录）。
dev 账号口令只从 env 读（`E2E_IDENTIFIER` / `E2E_PASSWORD`），默认值是 dev-only 测试账号。

---

## 六、遗留 / 下一步（不阻塞本卡）

- **生产 `/tutor/` 观感**未在 nginx 静态托付下自动化（SKIP-2）：建议后续补一条指向生产的只读截图对比。
- **深色世界**未做：世界令牌是单一亮色黎明色域；若要支持，得先裁决「深夜世界」的色域，
  而不是简单把令牌取反（N1/N2 会连坐）。
- **触屏手势**未自动化：横滑画布目前依赖原生 `overflow-x`，做惯性/缩放前先确认不与页面切换手势冲突。
- 学科城区 v5 的 `w-road` 相关类仍在 `styles/world.css` 在册（给维度 A 以外的历史页面兜底），
  但城区维度的 DOM 内已零引用（验收断言为 0）。
