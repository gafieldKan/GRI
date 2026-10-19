# W4-b 返工提示词（粘贴给 Claude）

> 卡片：`.agents/claude/tasks/w4-b-summit-ui.md`（同卡，仅返工）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。
> 复验报告：`.agents/coordination/w4b-verify-report.md`（先读 §3）。

---

【任务】W4-b 独立复验**未通过（reject）**，仅一处真实缺陷需修复，其余 231 项门禁已过。请在**本卡白名单内**做最小修复，不要顺手改别的。

## 阻塞缺陷（复现步骤）

同源进入 `/tutor/#/pages/twin/world?from=world`（登录态在册）→ 顶部切「K12 阶段」→ 点任一册（如 `math.g5.pep`）→ 在册详情的「章」列表点第一章（`第一单元 小数乘法`）→ 看章详情：

- **实得（错）**：延续性显示「该分支不在 K12 阶段范围内——它是纯学科纵深节点」；「K12 年级区间 = K12 之外 · 学科纵深」；「所属册」值**空白**。
- **期望（对）**：该章归属 `math.num`（K12 1–11），延续性应显示承接 `math.num` 的 K12 区间；「所属册」= 该册名。

## 根因（单一处，已定位）

`apps/web-ai-tutor/src/pages/twin/world.vue`

- 第 507 行：`@click="selectChapter(detail, c)"` —— 传的是**已派生的详情对象**（`kind==='book'` 的 `detail`），**不是** `books[]` 里的原始册对象。
- `detail` computed 的 `chapter` 分支取 `book.grade / book.gradeMax / book.gradeName / book.name`；而派生对象字段名是 `title / gradeMin / bookName`，**没有 `grade / gradeName / name`** → 取到 `undefined`。
- 后果：`detail.gradeMin/gradeMax` 为 `undefined` → 模板 `v-if="detail.gradeMin != null || detail.gradeMax != null"` 落空 → 走 `v-else` 纵深文案；`detail.bookName` 为 `undefined` →「所属册」空白。

## 修复要求

1. 让 `selectChapter` 拿到**原始册对象**（含 `grade / gradeName / name / stageName`）。二选一即可：
   - 在 `kind==='book'` 的派生对象里保留原册引用（如 `rawBook: bk`），改为 `selectChapter(detail.rawBook, c)`；或
   - `selectChapter` 内按 `detail.code` 从 `books.value` 反查原册再赋给 `book`。
   - 亦可让 `chapter` 分支的 `gradeMin/gradeMax/bookName` 直接取正确的源（二者择一，勿两头都改）。
2. 修复后章详情：延续性 = 承接 `ch.branch` 对应分支峰的 `k12GradeMin/k12GradeMax`（**不要**用册的年级替代；若该分支为纯纵深才落 else）；「所属册」= 该章所在册之名。
3. **不改**：维度 A 峰详情、地图画法、令牌、白名单外任何文件。

## 必做：补值级断言（本卡脚本的测试盲区）

`.agents/claude/outputs/w4b-verify.sh` 的 §7.11 现在只断言「章详情**含『所属册』标签**」——不看取值、也不断言章的 K12 区间，故漏过。请补：

- 章详情**含**「K12 承接」（或对应年级字面量）；
- 章详情**不含**「纯学科纵深节点」；
- 章详情「所属册」**取值非空**（不是只有 key）。

目标仍是末行 `FAIL=0`。

## 交付

- 改 `world.vue`（+ 必要时 `w4b-verify.sh`）。
- **不 commit / 不 checkout**；暂存区保持空；改动全在 W4-b 白名单内。
- 完成后回报：改了哪几行、补了哪几条断言、`w4b-verify.sh` 末行结果。助手将独立复跑 + 再复现该路径后统一 commit。
