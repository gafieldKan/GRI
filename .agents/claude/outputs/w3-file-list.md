# W3 改动清单 —— 模块内容世界外壳（统一世界语言）+ 智学慧眼「学习世界」接入

- 任务卡：`.agents/claude/tasks/w3-module-world-shell.md`
- 依据：`docs/PERSONA_WORLD_LANDING_PLAN.md`（v2.3）
- 验收：`.agents/claude/outputs/w3-verify.sh`（`bash .agents/claude/outputs/w3-verify.sh`，末行 `PASS=<n> FAIL=0 VERIFY_EXIT=0`）
- **改动留工作树：不 commit / 不 checkout，暂存区为空。**（基线 HEAD = `e32f822 docs(persona-world): 落卡 W3 …`；W2 已由 `3b67661` 落库）
- 改动条目 20：17 个已跟踪文件（含 3 个删除）+ 3 个新增（`packages/world-art/`、`styles/world.css`、本卡产出）

---

## 一、新增：世界语言共享件（N2「消灭重复」）

| 路径 | 行数 | 作用 |
|------|------|------|
| `packages/world-art/package.json` | 25 | 包名 `@gri/world-art`（workspace 成员）；`exports` 暴露 `art.js` / `WorldShell.vue` / `WorldTransition.vue`；`peerDependencies: vue` |
| `packages/world-art/src/index.js` | 11 | 入口：`export * from './art.js'`；写明「一份画法、两处复用」与零色值口径 |
| `packages/world-art/src/art.js` | 453 | **画法原语唯一真源**：`scenePoint` / `isoBox` / `tree` / `structureFor` / `stableHash` / `personaLook` / `wearClass` / `personMarker` / `buildPortrait` / `buildWorldScenes` / `MAP` / `TERRAIN` / `HOME_SCENE`。原语形如 `{k:poly\|path\|circle\|ellipse\|rect\|line, c:填充类, s:描边类, w:线宽, o:不透明度, dash}`；**零色值**（颜色一律以 `w-*` 几何类名表达）。头部注释内置「五路渲染链」规范（Vue 编译期 SVG 命名空间：原语必须与 `<svg>` 同模板内联，否则子组件里的裸 `<polygon>` 会落到 HTML 命名空间）。 |
| `packages/world-art/src/WorldShell.vue` | 223 | **模块内容世界外壳（N3）**：世界顶栏（`kicker`/`title`/`subtitle` + `#actions` 动作槽 + `data-app-home` 回功能导航 + `data-world-home` 返回人本世界）+ 内容插槽 `ws-body` + 内置过关之门。`worldHomeUrl` 默认 `/portal/`（同源整页跳转 → 令牌在册免二登）；`appHomeUrl` 走 `uni.switchTab` 并失败退化 `reLaunch`；`entering` 驱动承接过场。**零色值**。 |
| `packages/world-art/src/WorldTransition.vue` | 158 | 过场（过关之门），**从 `apps/portal/src/components/world/WorldTransition.vue` 原样搬移**（门户与模块共用同一道门）。 |

> `styles/world.css`（200 行，新增于共享位，见下）同属共享件；`packages/world-art` 三个文件 + `styles/world.css` 的色值 grep 均为 0。

## 二、新增：共享几何类映射（N1「同一世界语言」）

| 路径 | 作用 |
|------|------|
| `styles/world.css`（+200，根共享位） | `w-*` 几何类 → `--world-*` 令牌的唯一映射（126 条规则，125 处 `var(--world-…)`）。**由 `apps/portal/src/styles/world.css` 搬入共享位**（原文件删除），门户与智学慧眼各引一次同一路径。 |

## 三、门户（apps/portal）：改为消费共享件

| 文件 | 改动 |
|------|------|
| `apps/portal/src/utils/world-art.js` | **删除**（436 行）→ 内容搬到 `packages/world-art/src/art.js` |
| `apps/portal/src/styles/world.css` | **删除**（154 行）→ 内容搬到 `styles/world.css` |
| `apps/portal/src/components/world/WorldTransition.vue` | **删除**（155 行）→ 内容搬到 `packages/world-art/src/WorldTransition.vue` |
| `apps/portal/src/main.js` | `import './styles/world.css'` → `import '@styles/world.css'`（改引共享单份） |
| `apps/portal/vite.config.js` | 新增别名 `@world-art → ../../packages/world-art/src`；dev `server.fs.allow` 放行 `packages/world-art` |
| `apps/portal/src/pages/world/index.vue` | import 改走 `@world-art`；新增 `MODULE_WORLD_ROUTES = { tutor: '/pages/twin/world' }` 与 `moduleEntry(module)`：`entry_url`（后端契约，不动）拼上模块世界的 app 内 hash 路由并带 `?from=world`；「走进」动作由 `module.entryUrl` 改走 `moduleEntry(module)` |
| `apps/portal/src/components/world/LifeWorld.vue` | import 改走 `@world-art`；人物组加 `:data-person="group.key === 'person' ? 'me' : undefined"`（自检定位钩子）；注释指向共享 `styles/world.css` |
| `apps/portal/src/components/world/PersonaCard.vue` | import 改走 `@world-art` |
| `apps/portal/src/components/world/OrgCard.vue` | import 改走 `@world-art` |
| `apps/portal/src/pages/org-twin/index.vue` | import 改走 `@world-art` |

> 门户行为不变（W2 观感与交互原样）：只换取件处 + 加一段模块世界路由。

## 四、智学慧眼（apps/web-ai-tutor）：接入统一世界语言

| 文件 | 改动 |
|------|------|
| `apps/web-ai-tutor/src/main.js` | +4：引 `@styles/tokens/themes/persona-world.css`（世界色唯一真源）与 `@styles/world.css`（几何类映射） |
| `apps/web-ai-tutor/vite.config.js` | 同门户：新增 `@world-art` 别名 + `server.fs.allow` 放行 |
| `apps/web-ai-tutor/src/api/index.js` | +8：`getActivationContext()` —— 只读 W1 `GET /api/context/me`，取不到返回 `null`（不抛错、不白屏） |
| `apps/web-ai-tutor/src/pages.json` | 世界页 `navigationBarTitleText`：`虚拟世界` → `学习世界`（与门户同制：走默认导航栏） |
| `apps/web-ai-tutor/src/pages/twin/world.vue` | **核心（N4）**：套入 `<WorldShell module-code="tutor" kicker="学习世界" title="学习世界 · 登峰" app-home-url="/pages/index/index" app-home-label="回智学慧眼" :entering="entering" entry-from="人本世界" @entered="entering = false">`；`#actions` 槽放「当前学科」标签与「切换学科」；全部样式迁到 `--world-*` 令牌；新增自检钩子（`data-world-shell`/`data-map`/`data-camp*`/`data-subject*`/`data-legend`/`data-status`/`data-climber`/`data-here` 等 15 个）。**学科登顶的全部功能与交互原样保留**（本卡不重做登顶 UX，属 W4）。 |

`world.vue` 新增标识符（8 个）：`auth`、`entering`、`activation`、`selfProfile`、`climberPrims`、`loadSelf`、`isCurrentSubject`、`u`。
`world.vue` 消失标识符：**0 个**（脚本自动比对 HEAD 版 128 个标识符 → 现 136 个；见 w3-verify §5）。

### 一并修掉的两处既有缺陷（不改变语义，只是让世界语言真的成立）

1. `WorldTransition.vue`：过场文案原为 setup 常量（`const sceneLabel = props.from …`），同一会话连走两趟会永远念第一趟的「目的/出发地」。改为 `computed`，现每趟重算（验：门户 `走进 智学慧眼` / `从 学习 出发`；模块 `走进 学习世界 · 登峰` / `从 人本世界 出发`）。
2. `world.vue` 学科条高亮：原用严格全等比较 `code === currentSubject`，而课程注册表给 `MATH`、`knowledgeStore.currentSubject` 是 `math`，导致当前学科**从不亮**。改为 `isCurrentSubject()` 大小写归一比较（后端两种写法都接受，已 curl 验证）。

## 五、根

| 文件 | 改动 |
|------|------|
| `package-lock.json` | +12：登记新 workspace 成员 `packages/world-art` 与 `node_modules/@gri/world-art` 软链（正常 npm 产物，避免 `npm ci` 因新成员失败） |
| `styles/tokens/themes/persona-world.css` | +21/-1：注释改为「世界语言的唯一色源 …… 与各模块内容世界（W3 首接学习世界）」；新增「学科山」一组 13 个 `--world-*` 令牌（山体/雪/点阵/台地三态/登山路/岩） |

## 六、本卡产出

| 路径 | 作用 |
|------|------|
| `.agents/claude/outputs/w3-verify.sh` | 验收脚本：§1 两前端 `build:h5`｜§2 N2 一份画法｜§3 N1 统一世界语言（含「零孤儿几何类」）｜§4 N3 外壳｜§5 N4 功能无损（HEAD 标识符自动比对）｜§6 N5 进入体验｜§7 零裸色三重 grep + `var(--)` 自洽｜§8 真浏览器 E2E（17 组断言）｜§9 无回归静态面｜§10 凭据零泄漏｜§11 改动范围白名单｜§12 未覆盖项。末行 `PASS=<n> FAIL=0 VERIFY_EXIT=0`。 |
| `.agents/claude/outputs/w3-file-list.md` | 本文件 |

## 七、邻卡脚本随动

`apps/portal` 的三件（画法 / 几何类映射 / 过场）搬到共享位后，`.agents/claude/outputs/w2-verify.sh` 里的取件路径随之更新（`ART`/`WORLD_CSS`/`WT` 三个变量），并扩了 §13 白名单：

- `ART`：`$SRC_DIR/utils/world-art.js` → `$ROOT_DIR/packages/world-art/src/art.js`
- `WORLD_CSS`：`$SRC_DIR/styles/world.css` → `$ROOT_DIR/styles/world.css`
- `WT`：`$SRC_DIR/components/world/WorldTransition.vue` → `$ROOT_DIR/packages/world-art/src/WorldTransition.vue`
- §13「改动范围」改为「W2 面 + W3 已交代面」两段白名单联合（`ALLOW_W2` ∪ `ALLOW_W3`），原「HEAD 仍是 W1（W2 未 commit）」断言改为「人本世界页已在 HEAD（W2 已落库）」——W2 已由 `3b67661` 提交，原断言的时点前提不再成立。

W2 的验收口径本身没放松：断言项一条未删，仍全绿。

---

## 八、硬约束自证（对应任务卡 N1–N7）

| 约束 | 证据 |
|------|------|
| **N1 统一世界语言** | 同一份 `--world-*` 令牌（`persona-world.css`，两前端各引一次）+ 同一份几何类命名与映射（`styles/world.css`）+ 同一道过关之门。E2E：两个世界里的「我」外观类**完全相同**（`w-hair-2,w-skin-3,w-wear-2,w-wear-2,w-wear-2`，同源于 `/api/context/me` 的同一 profile）；两前端构建产物都含 `.w-terrace-current` 与 `--world-terrace-current` |
| **N2 消灭重复** | `personMarker`/`structureFor`/`buildPortrait`/`buildWorldScenes`/`personaLook` **只在** `packages/world-art/src/art.js` 定义；两个 app 源码内零画法实现（只有引用）；旧三件已删；共享件色值 grep = 0；两个世界用到的 119 个 `w-*` 类**零孤儿**（全在同一份映射里有取值） |
| **N3 模块内容世界外壳** | `WorldShell.vue` 可复用外壳（`module-code` 参数化）；首个接入 = 智学慧眼；顶栏「返回人本世界」+「回智学慧眼」+ 模块动作槽；过场承接同一道门 |
| **N4 学习世界** | `pages/twin/world.vue` 套壳 + 迁令牌；HEAD 版 **128 个标识符零消失**；登峰版图（26 polygon / 39 path / 7 circle / 23 ellipse / **0** 个 HTML 命名空间标签）、44 营地点位、12 台地三态、4 已登顶、营地详情三动作（练一练/请教 AI 教师/知识图谱）、攀爬生长 41 折点、学科切换（MATH ↔ BIO，56 营地）全部在 |
| **N5 进入体验** | 门户「学习」意向 → 过关式 → `/tutor/#/pages/twin/world?from=world`；模块侧 `onLoad` 接住 `from=world` 演下半程；双出口：`返回人本世界`（回 `/portal/#/`，免二登）与`回智学慧眼`（回 `/tutor/#/` 人物孪生总览） |
| **N6 无回归** | 两前端 `build:h5` exit 0；19 页全注册且全部产出分片；其余 9 页逐页走过 pageerror = 0；全链路 pageerror/console.error = 0；**不 commit / 不 checkout，暂存区为空** |
| **N7 零裸色 / 不越界** | 改动面 hex / rgb / hsl / 具名色 grep 全 0；共享件色值 0；`var(--…)` 无「用了没声明」（265 个令牌）；无 iframe / foreignObject；`apps/explorer` 零改动；`services/` 与既有 `packages/` 零改动（后端契约未动） |

## 九、明示未覆盖（不计 FAIL，见 w3-verify §12）

1. **登顶 UX 重做**：按任务卡 N4 明确属 W4；本卡只换世界语言、不动登顶交互与版式。
2. **「当前」标签的显示值**：后端 W1 `twin.service` 的口径是「取不到营地名时回落原场景码」，测试账号的历史动作留下的是 UUID，故该处显示为 UUID。属后端契约面，前端保持原样、不臆造替换。
3. **`prefers-reduced-motion`**：过场/动效在该偏好下不演（沿用 W2 的可访问性取舍）。
4. **生产链路观感**：E2E 用「同源双 App 托管」复现同一 origin 与同一令牌在册条件，未走 nginx 上线产物。
5. **凭据**：E2E 仅用 dev 测试账号，经 `E2E_IDENTIFIER` / `E2E_PASSWORD` 环境变量注入；脚本与本文档不含任何口令、私钥或令牌字面量。
