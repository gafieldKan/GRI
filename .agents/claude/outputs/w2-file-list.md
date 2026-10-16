# W2 产出清单：门户「工作台」→「人本世界」

- 任务卡：`.agents/claude/tasks/w2-portal-persona-world.md`
- 工作树：`/home/ubantu/GRI` ｜ 分支：`feat/stage-c-unified-auth-shell` ｜ HEAD：`64521f8`（W1 内核，**未新增 commit**）
- 验收脚本：`.agents/claude/outputs/w2-verify.sh`（末行 `PASS=<n> FAIL=0 VERIFY_EXIT=0`）
- 一句话：登录不再落到「模块卡墙」，而是落到**人本世界**——一张 2D/SVG 拟真生活全景，人物站在自己的世界里；点场景 → 选意向 → 走进模块（过关式 + SSO 免二登）。运营后台从世界之外的独立入口进。

---

## 1. 新增

| 文件 | 行数 | 作用 |
|---|---|---|
| `apps/portal/src/pages/world/index.vue` | 962 | 人本世界主视图：顶栏（身份 + 世界之外入口）· 人物卡 · 生活全景 · 我的组织 · 常去的地方 / 世界扩展 · 意向面板 · 过场 |
| `apps/portal/src/pages/org-twin/index.vue` | 388 | 组织孪生**占位页**：组织静态摘要 + 孪生六面草案（全标「待建」） |
| `apps/portal/src/components/world/LifeWorld.vue` | 473 | 生活全景 SVG：地形 + 7 场景等距建筑 + 热区 + 人物位置 + 图例 + 待载/降级幕 |
| `apps/portal/src/components/world/PersonaCard.vue` | 386 | 人物卡：手绘肖像 + 三态掌握环 + 掌握档位/经历/组织三格 + 最近经历 |
| `apps/portal/src/components/world/OrgCard.vue` | 190 | 组织入口卡（静态摘要）：徽记 / 名 / 类型 / 我的角色 / 隶属 → 组织孪生 |
| `apps/portal/src/components/world/IntentSheet.vue` | 434 | 意向面板：意向 → 去处三态（走进 / 开通 / 即将接入）+ 建设中空态 + 世界之外出口 |
| `apps/portal/src/components/world/WorldTransition.vue` | 155 | 过场（同风格 SVG 世界之门）：关门 → 就绪 → 交接导航 |
| `apps/portal/src/utils/world-art.js` | 436 | **SVG 画法引擎（纯几何，零色值）**：等距体块/地形/7 个场景结构/人物标记/肖像/坐标映射 |
| `apps/portal/src/utils/persona.js` | 70 | 展示字典（角色 / 组织类型 / 组织角色 / 相对时间）——只做词，不取数 |
| `apps/portal/src/styles/world.css` | 154 | 世界几何类（102 个 `.w-*`）→ 世界令牌映射；全局单份，避免三处重复 |
| `styles/tokens/themes/persona-world.css` | 208 | **世界令牌真源**（121 个 `--world-*`）：天光/地面/水面/路径/建筑三面/植被三阶/人物/描边 |
| `.agents/claude/outputs/w2-file-list.md` | 本文件 | 产出清单 |
| `.agents/claude/outputs/w2-verify.sh` | 752 | 自检脚本（N1–N7 + 真浏览器 E2E） |

## 2. 修改

| 文件 | 改动 |
|---|---|
| `apps/portal/src/pages.json` | 首页由 `pages/workbench/index` 改为 `pages/world/index`（启动即世界）；新增 `pages/org-twin/index`；移除 `pages/workbench/index` |
| `apps/portal/src/App.vue` | 路由守卫：已登录 → `/pages/world/index` |
| `apps/portal/src/pages/login/login.vue` | 登录成功 → `/pages/world/index` |
| `apps/portal/src/pages/register/index.vue` | 注册成功 → `/pages/world/index` |
| `apps/portal/src/main.js` | 引入 `persona-world.css`（世界令牌）+ `./styles/world.css`（几何类映射） |
| `apps/portal/src/api/index.js` | +27 行：`worldScenes()` / `activationContext()` / `myOrganizations()` / `twinMe()`（四个 W1 读面；**不吞错**，失败即抛由页面分源降级） |

## 3. 删除

| 文件 | 说明 |
|---|---|
| `apps/portal/src/pages/workbench/index.vue`（1005 行） | 工作台并表进世界：「模块卡」以「常去的地方 / 世界扩展」形态出现（N6）；全 `src` 零残留引用（脚本 §2 断言） |

---

## 4. 数据与契约（只读 W1，不造第二真源）

| 读面 | 用途 | 世界里的落点 |
|---|---|---|
| `GET /api/world` | 7 生活场景 + 意向 + 场景→模块映射（匿名可读） | 生活全景的建筑、热区、标签、「建设中/去处数」 |
| `GET /api/context/me` | 人物激活上下文（profile / orgs / permissions / twin 锚点） | 顶栏身份、人物卡身份行、组织降级兜底 |
| `GET /api/twin/me` | 孪生状态与经历（掌握分布 / progress / events / memories） | 人物卡三态掌握环、掌握档位、经历、最近经历 |
| `GET /api/organizations/mine` | 我的全部有效组织归属 | 我的组织（组织入口卡 + 组织孪生占位页） |
| `GET /api/modules` | 模块注册表（已按登录角色过滤） | 常去的地方（core）/ 世界扩展（可选）/ 世界之外的独立入口 |

- **场景清单不写死在页面**：页面/组件内零场景码字面量（脚本 §5 断言）；`world-art.js` 里的 `STRUCTURES` 是**画法索引**（按 code 取画法，未知 code 有「营地」兜底），不是清单。
- **降级分源**：四个来源各自 try/落 `worldFailed / modulesFailed / orgsFailed / twinsFailed`，页头按来源逐条说明「哪个源没取到」；组织归属另有同真源兜底（`context/me` 亦带 `orgs`）。断源时世界仍可见（空世界 + 幕布提示），不白屏。
- **不写世界状态**：唯一写操作是模块开通/收起（`/api/modules/:code/enable|disable`，沿用原工作台契约）。

---

## 5. 口径说明（与验收条文的差异与理由，逐条可追溯）

1. **「精力」→ 掌握档位 + 状态环（未做，明示）**
   验收自检写「人物卡显示 profile/state（名/角色/精力/经历/等级）」。W1 的任何读面（`context/me`、`twin/me`）都**没有精力字段**——原型 C1 里的 energy 属于*动作*消耗，不是人物属性。按 N4「只取 W1 API，不造第二真源」，**不臆造精力**；人物卡改以真状态呈现：三段掌握环（`mastery.mastered/learning/weak`）+ **掌握档位 `LV.n`**（由真实 `mastery.avg` 分档：`min(6, max(1, floor(avg/17)+1))`，卡面注明「按掌握度分档」）+ 经历条数 + 组织数。脚本 §14 以 `SKIP`（非 FAIL）明示此项与理由。

2. **「工作」→ `org-admin`：走世界之外的独立入口（N1 优先）**
   N1 明确「运营后台独立入口**留在世界之外**」，验收 5 明确「世界内**不出现**运营模块」；验收 3 又要求「工作 → org-admin/dashboard」。两条互斥，按优先级（硬约束 > 自检条目）取 N1：
   - 世界之内**只收 `business` 类**模块（`WORLD_CATEGORIES = ['business']`），`admin`/`tool` 一律不进常去的地方、不进意向面板；
   - 运营后台/工具类从顶栏**独立入口**进（`data-console`，由 `/api/modules` 的 admin/tool 且 `isCore && entryUrl` 驱动）；
   - 工作场景的意向面板给一条「**世界之外的出口**」提示 + 「去运营后台」一跳（2 次点击可达），这样验收 3 的 org-admin 腿仍可走通，而世界之内始终干净。
   - 附带事实：模块注册表里 `dashboard` 的 `entry_url` 为空（未接通），世界里**如实**显示「即将接入」，不伪造入口。

3. **零裸色的扫描范围**
   GRI 的色彩真源是令牌层（`styles/tokens/**`，允许字面量；`persona-world.css` 就是世界色的唯一出处）。故「三重 grep 空」施加在 **W2 表层**（世界页面/组件/`styles/world.css`/两个 util），而非全 `src`：portal 既有的 `console/index.vue`、`PageHeader.vue`、`Toast.vue`、`ErrorBoundary.vue`、`ontology-stats/index.vue` 带有**先前遗留**的裸色（`#e5484d`、`rgba(0,0,0,.4)` 等），改写它们超出 W2 范围（N7 要求不动无关面）。另加一条更强检查：W2 表层**不存在「用了但没声明」的 `var(--…)`**（防拼写错导致样式静默失效）。`pages.json` 的 `window` 色值是 uni-app 平台配置，**无法**引用 CSS 变量且属既有配置，不在扫描面内。

4. **人物在世界里的位置 = 纯视图态**
   点场景会让「我」走到该场景（`personScene`），这是**视图状态**，不落库、不作为状态真源（源码有注释标明）；初始站在「居所」。

5. **`avatarUrl` 暂未消费**
   `/api/context/me` 会返回 `avatarUrl`（W1 实测为空），人物肖像由 `stableHash(role|name|id)` 派生的外观（衣着/肤色/发型）绘制——**不新增头像资产、不引第二真源**。待有真实头像时替换肖像即可，不影响契约。

6. **过场与 SSO**
   过场是同风格 SVG「世界之门」（`WorldTransition`，`prefers-reduced-motion` 下不动），落幕后交接导航：`/pages/*` 走 `uni.navigateTo`，`/xxx/` 走 `window.location.assign`（同源，令牌已在本地存储 → **免二登**；此链路 W1/P4-C 已验）。

7. **场景标签上的「N 个去处」只数走得进的**
   该数字 = 该场景映射的模块 ∩（**业务类** ∧ **入口已接通**）。理由：运营/工具类不在世界里（N1），入口未接通的模块走不进（会误导成「点得开」）。于是「学习」按 `tutor` 计 1（`curriculum`/`agent` 仍在意向面板里以「开通」申请，只是不算作当下的去处），「工作」在注册表接通 `dashboard` 之前如实显示「建设中」，而不是谎报 2 个去处。

---

## 6. 自检结果（`bash .agents/claude/outputs/w2-verify.sh`）

**末行：`PASS=186 FAIL=0 VERIFY_EXIT=0`**（另 3 条 `SKIP` = §15 明示的未覆盖项，非失败；见下）。

| 段 | 覆盖 | 结果 |
|---|---|---|
| §0 | 网关/api/pg/redis + playwright + 端口 | 全绿 |
| §1 | `npm run build:h5` exit 0；产物含 world / org-twin、无 workbench；产物 CSS 带 `--world-*` 与 `.w-*` | 全绿 |
| §2 | N1 登录落点 = 世界（首页 + 三处跳转 + 旧页零引用）；身份/退出保留；运营后台独立入口在世界之外 | 全绿 |
| §3 | N2 7 场景结构 + 未知码兜底；SVG 内零组件标签；无 3D 依赖；减动效偏好 | 全绿 |
| §4 | N3 热区 + 意向三态 + 建设中空态 + 无图标墙；「N 个去处」只数入口已接通者 | 全绿 |
| §5 | N4 四读面只指向 W1；场景清单零字面量；四来源分源降级；零 energy 臆造 | 全绿 |
| §6 | N5 组织卡（名/类型/角色）→ 组织孪生占位页（同真源 + 口径） | 全绿 |
| §7 | N6 常去的地方 / 世界扩展；enable/disable 契约保留；维度选择器保留 | 全绿 |
| §8 | N7 零裸色三重 grep（W2 表层 10 文件全 0）+ 无「用了没声明」的 `var(--…)` | 全绿 |
| §9 | 真浏览器（学生）：登录→世界；未见未授权模块；7 场景 98 polygon/109 path/181 ellipse；人物卡取 context/me；组织卡 3；餐饮→food、学习→tutor（打桩，同源 SSO 令牌在册）；出行「建设中」；降级告警点名来源且世界仍在；`pageerror`/`console.error = 0` | 全绿 |
| §10 | 移动端 390px：两栏→单列、全景可横移（640px）、页面无横向溢出、场景→意向可用 | 全绿 |
| §11 | 运营身份（临时提权 + 还原）：独立入口进组织管理台、工作场景「世界之外的出口」、世界之内零 admin/tool（类别边界现算）、组织孪生占位页、世界扩展开通→持久→收起 | 全绿 |
| §12 | 凭据零泄漏：产出说明零口令字面量；脚本内口令只在 env 默认值一处；源码零 JWT/.env | 全绿 |
| §13 | 未 commit（HEAD 仍是 W1）、未 checkout（仍在原分支）、暂存区空、改动全在白名单内 | 全绿 |
| §14 | 3 条 SKIP 明示（精力 / 工作→org-admin 的走法 / dashboard 未接通） | SKIP×3 |

还原证据：指针退出时 `testuser` 角色已回到 `student`，`ontology.user_module` 无残留开通行，`ctx:user:*` 缓存已失效。
