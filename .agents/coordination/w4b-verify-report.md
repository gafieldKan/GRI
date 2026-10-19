# W4-b 独立复验报告（学科登顶双维度 UI）

- 复验者：助手（总负责人 / 独立复验者，不采信作者自述）
- 时间：2026-10-19（Asia/Shanghai）
- 复验对象：工作树 W4-b 改动（HEAD 仍为 `8c09048`，**未提交**，暂存区空）
- 结论：**REJECT（需返工）** —— 一个真实功能缺陷，已被助手用自建 E2E 独立复现。

---

## 1. 复验范围与方法

| 手段 | 说明 |
|---|---|
| 作者脚本 | 助手**亲自执行** `.agents/claude/outputs/w4b-verify.sh`，未采信作者自述结果 |
| 自建 E2E | 助手另写同源双 App 托管（portal + tutor）+ Playwright，独立复现关键路径（**不依赖作者脚本**） |
| 静态审读 | 逐段读 `world.vue` 详情派生逻辑与模板、`task-status.json`、任务卡验收条款 |
| 现网核对 | 现网 nginx 下 W4-a 读面 `GET /api/curriculum/summit-branches?subject=MATH` → 200（契约在册） |

## 2. 通过项（作者脚本 PASS=231 / SKIP=5 / FAIL=0，我复跑一致）

- 构建：`apps/web-ai-tutor npm run build:h5` 通过，产物带 W4-b 令牌/几何类/数据钩子。
- 数据面：MATH 10 峰、化学 8 峰、物理 3 册等；零裸色三重 grep 空；凭据零泄漏；改动全在白名单内、未 commit/未 checkout。
- E2E（真浏览器）：维度切换默认=学科知识体系、切维度不丢学科与当前峰、一科 10 座独立峰各有态/径、K12 在读段与年级刻度、纵深子分支、空态兜底、键盘可达、其余 9 页零 pageerror。
- 权威锚点展示：峰详情显示「中图法 · O14 · 《中国图书馆分类法》（第五版）」；册/章无中图法号时标「课标主题」**不编造**（合规）。

## 3. 阻塞缺陷（BLOCKING）

### 3.1 现象（助手自建 E2E 实跑原文）

同一门数学、同一登录态：

```
BOOK_DETAIL（册）: … 延续性 · 小五 · 小五 · K12 承接 小五 → … · K12 年级区间 · 小五（5–5 年级） · 所属学段 · 小学 · 五年级 ·
CH_DETAIL（章）  : 第一单元 小数乘法 · 章 · … 延续性 · 【该分支不在 K12 阶段范围内——它是纯学科纵深节点】 ·
                   K12 年级区间 · 【K12 之外 · 学科纵深】 · 所属册 · 【（空）】 ·
```

- 章「第一单元 小数乘法」归属 `math.num`（数与算术，K12 区间 **1–11**），却被判为「**纯学科纵深节点 / K12 之外**」——**语义错误**。
- 「所属册」行**值为空**。

### 3.2 根因（单一处）

`world.vue` 第 507 行：`@click="selectChapter(detail, c)"` 传入的是**已派生的详情对象**（`kind==='book'` 的 `detail`），而非 `books[]` 里的原始册对象。

`detail` computed 中章分支取 `book.grade / book.gradeName / book.name`，但派生对象字段名是 `title / gradeMin / bookName`——**没有 `grade / gradeName / name`**：

```js
// kind==='chapter' 分支
gradeMin: book.grade,   // => undefined（派生对象无 grade）
gradeMax: book.grade,   // => undefined
bookName: book.name,    // => undefined（派生对象字段是 title）
```

后果：
1. `gradeMin/gradeMax` 为 `undefined` → 模板 `v-if="detail.gradeMin != null || detail.gradeMax != null"` 落空 → 走 `v-else` 纵深文案 → **延续性整段误报**。
2. `bookName` 为 `undefined` →「所属册」**空白**。

### 3.3 影响

- 锚定用户四大要求中的「**延续性**」：维度 B 的**章级**延续性展示是错的（正确值应为承接 `math.num` 的 K12 区间）。
- 「所属册」信息缺失。
- 违反任务卡验收 2「延续性：每峰可见 K12 年级区间与学科纵深段（**可读、可懂、不误导**）」——此处**构成误导**。

### 3.4 测试盲区（为何作者脚本漏过）

作者脚本 §7.11 仅断言章详情**含「所属册」这个标签**：

```
res_has chapter_detail "$STU_OUT" "所属册" "7.11 章详情含所属册"
res_has chapter_detail "$STU_OUT" "所属册"   # 只看 key 是否存在，不看值，也不断言章的 K12 区间
```

即：**未断言章的「所属册」取值，也未断言章的 K12/延续性文案**，故空白值与纵深误报双双漏网。

### 3.5 复现步骤（可交给实现方自证）

1. 同源进入 `/tutor/#/pages/twin/world?from=world`（登录态在册）。
2. 顶部切到「K12 阶段」维度。
3. 点任一册（如 `math.g5.pep` 人教版数学五年级上册）。
4. 在册详情的「章」列表点第一章（`第一单元 小数乘法`）。
5. 观察章详情的「延续性」与「K12 年级区间」「所属册」——
   - 实得（错）：`纯学科纵深节点` / `K12 之外 · 学科纵深` / 所属册空。
   - 期望（对）：延续性承接 `math.num` 的 K12 区间（1–11 年级）；「所属册」= 该册名。

### 3.6 最小修复建议（仅限 W4-b 白名单内）

- 第 507 行改为传**原始册对象**：在册详情里保留 `book` 原对象（如 `detail` 增加 `rawBook: bk`），`selectChapter(detail.rawBook, c)`；或在 `selectChapter` 内按 `detail.code` 从 `books.value` 反查原册。
- 修复后**必须**在作者脚本补断言（值级）：
  - `res_has chapter_detail "K12 承接"` 且**不含**`纯学科纵深节点`；
  - 章「所属册」取值非空。

## 4. 未覆盖项（沿用作者脚本明示，不算通过）

- 分支峰/章级掌握度：按 W4-a 契约原值展示，缺值回退文案（不臆造）——**接受**。
- 生产 nginx `/tutor/` 静态托付观感：本卡用同源双 App 复现同一 origin 与令牌在册条件——**接受**。
- 深色主题：沿用 W2/W3 单一亮色世界令牌——**接受**。

## 5. 处置

- `w4-b-summit-ui` → **rejected（rework_required）**，返工修复 §3 后重跑脚本 + 助手再复验。
- 工作树保持未提交（符合约束）；修复仍由 Claude 完成，助手复验通过后统一 commit。
