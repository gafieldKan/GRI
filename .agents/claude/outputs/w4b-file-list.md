# W4-b 交付文件清单 · 学科登峰双维度 UI

> 卡：W4-b（Claude 面）｜页：`apps/web-ai-tutor` 「学习世界 · 登峰」（`pages/twin/world`）
> 数据面：只取 W4-a 只读 API（`/api/curriculum/summit-branches`、`/api/curriculum/summit-grades`），未改后端。
> 约束：不改 W1–W3 契约、不动 `apps/explorer`、不改后端；**不 commit / 不 checkout**；凭据零泄漏。

## 一、改动文件（工作树，未提交）

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/web-ai-tutor/src/pages/twin/world.vue` | 改 | 登峰页主体：顶部双维度切换（N1）、多峰群山（N2）、延续性可视化（N3）、K12 维度 B（N4）、意象与信息密度（N5/N6/N8）、权威依据展示（N9）、既有能力与双出口保留（N10） |
| `packages/world-art/src/art.js` | 改 | 登峰共享画法：`peakMassif`（多峰山体 + K12/纵深延续带 + 起学线 + 雪冠）、`depthSpire`、`bookCamp`、`summitFlag`、`summitScaffold`、`gradeY`，常量表 `SUMMIT` / `STAGE_SPANS` / `GRADE_TICKS`。**一份画法**，页面零另写 |
| `styles/tokens/themes/persona-world.css` | 改 | 世界色源新增 W4-b 令牌（延续带 / 起学线 / 山形轮廓 / 年级刻度 / 学段台地）；仍是唯一色源 |
| `styles/world.css` | 改 | 几何类 → 令牌映射新增 W4-b 类名（`.w-band-*` / `.w-peak-*` / `.w-axis-*` / `.w-stage-*` / `.w-book-*` / `.w-me-*`）；只允许 `var(--world-*)` |
| `apps/web-ai-tutor/src/api/index.js` | 改 | 新增两个只读客户端：`getSummitBranches(subject)`、`getSummitGrades(subject)`（W4-a 读面） |
| `.agents/claude/outputs/w4b-verify.sh` | 新 | 本次验收脚本（§0–§14；末行 `FAIL=0`） |
| `.agents/claude/outputs/w4b-file-list.md` | 新 | 本清单 |

构建产物 `apps/web-ai-tutor/dist/`（gitignore）与 `node_modules/` 不计入改动。

## 二、零裸色（三重 grep）

- 色值扫描面 = `world.vue` / `api/index.js` / `world-art/src/` / `styles/world.css`：**hex / rgb / hsl / 具名色 全部 0 处**。
- `persona-world.css` 是调色板真源，本身就承载色字面量，故不纳入色值扫描。
- 页面与共享画法不出现任何色值：几何图元只带 `w-*` 类名，类名取值一律 `var(--world-*)`。

## 三、数据来源（只读，未改后端）

| 接口 | 用途 |
|------|------|
| `GET /api/curriculum/summit-branches?subject=` | 维度 A 的一科多峰：`peaks[]`（`code/name/clc/k12GradeMin/k12GradeMax/kpCount/reached/isSummit/children`） |
| `GET /api/curriculum/summit-grades?subject=` | 维度 B 的学段→年级→人教版册→章 |

权威锚点：`docs/SUBJECT_SUMMIT_AUTHORITY.md`（中图法分类号，逐个可回溯，不编造）；缺号时回退为「课标主题」文字标签，绝不兜假号。

## 四、验收

`bash .agents/claude/outputs/w4b-verify.sh` —— 末行打印 `FAIL=0`（`PASS>0`）。含真浏览器 E2E（学生身份、同源双 App 托管），截图落在 `/tmp/w4b-shots`。

## 五、返工（2026-10-19，复验 REJECT 后）

复验指出的唯一阻塞缺陷：**章详情的延续性判定错**（有 K12 归属的章被判成「纯学科纵深节点」），且「所属册」空白。根因与修复：

| 处 | 改动 |
|---|---|
| `world.vue` 模板 · 章列表点击 | `@click="selectChapter(detail, c)"` → `selectChapter(detail.rawBook, c)`：原先传的是**派生的详情对象**（字段是 `title/gradeMin/bookName`），而 `selectChapter` 要的是 `books[]` 里的**原始册**（`name/gradeName/stageName`）；派生对象没有这些字段 → 取到 `undefined` |
| `world.vue` · `kind==='book'` 派生对象 | 补 `rawBook: bk`，把原册带下去 |
| `world.vue` · `kind==='chapter'` 派生对象 | `gradeMin/gradeMax` 改取 `ch.branch` 对应**分支峰**的 `k12GradeMin/k12GradeMax`（不再用册的年级）；册缺省时 `bookName/stageName/gradeName` 兜空串 |
| `w4b-verify.sh` §7.11 | 补值级断言：章详情**含**「K12 承接」、**不含**「纯学科纵深节点」、「所属册」与「K12 年级区间」**取值非空** |

修复后实测（数学 G5 上 · 第一单元 小数乘法）：延续性 = 「K12 承接 小一–高二」，K12 区间 = 「小一–高二（1–11 年级）」（即分支 `math.num` 的真实区间），所属册 = 「人教版数学五年级上册」。
