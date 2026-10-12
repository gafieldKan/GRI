# GRI 门户化方案 v1：SSO 统一入口 + 权限化插件 + 区域×行业双维度（可实施）

> 状态：方案草案 v1 ｜ 2026-10-12 ｜ 作者：总负责人（助手）
> 依据：用户 2026-10-11 的想法（SSO 首页 / 权限化插件 / 模块挂双维度 / 可维护 + AI 命令）
> 定位：把「GRI 统一入口」从**静态壳**升级为 **SSO 门户 + 插件工作台**；把 9 个后端模块注册为**可选用插件**；
> 把一切挂接到 **区域 × 行业** 双维度；维度数据 **可手动 / 可 AI 命令** 维护。

---

## 0. 你的想法 → 需求点拆解（可验收）

| 你的原话 | 需求点 | 本方案落点 |
|---|---|---|
| 把两个维度增加到首页 | 首页展示 区域/行业 双维度导航 | §6 门户工作台 |
| 首页采用单点登录和注册模式 | SSO + 注册 | §2 复用 auth-center + auth-client |
| 除后台管理，其他模块按权限**可选插件**方式选用 | 模块注册表 + 用户**选用** + 权限过滤 | §3/§5 `AppModule` + `user_module` |
| 把各模块都挂接到这两个维度下 | 模块 ↔ 维度 关联 | §6 `module_region` / `module_industry` |
| 可维护可更新 | 维度 CRUD | §7 admin API + 维护页 |
| 可手动更新，也可通过 AI agent 命令 | 双通道维护 | §7 CRUD + NLP 命令 |
| 形成可实施方案 | 本文件 + 任务拆分 | §8 |

---

## 1. 目标与原则

**目标**：用户视角只有一个「登录入口」；登录后看到的是**自己有权用的插件**，且每个插件**能按区域/行业维度定位与筛选**。

**原则（沿用项目红线）**：
1. **本体驱动**：新增概念（模块/挂接）先写本体 YAML → codegen → 迁移；不手写结构 DDL。
2. **单一身份真源**：`auth.identities`（登录）→ `public.users`（业务写真，= JWT `externalId`）。门户不另造身份。
3. **权限集中**：授权一律走既有 `assertSiteOperator` / `assertRole`；禁 `req.auth.roles`。
4. **变更受控**：维度数据变更**一律入审计**（append-only），AI 命令走「提案→确认→应用」。
5. **不重建**：9 个后端模块**原地注册为插件**，不重构业务代码。

---

## 2. 架构总览

```
                     ┌──────────────────────────────────────────┐
   浏览器/小程序 ───▶ │  nginx 网关                               │
                     │  / → 门户（SSO 工作台）                    │
                     │  /api → services/api（唯一业务后端）       │
                     │  /auth → auth-center（签发中心）           │
                     └───────────────┬──────────────────────────┘
                                     │
            未登录 ┌──────────────────▼──────────────────┐ 已登录
                   │            门户 Portal              │
                   │  /portal/login  登录 / 注册          │（auth-client + auth-center）
                   │  /portal/       工作台：             │
                   │    · 我的插件（按权限/选用过滤）      │
                   │    · 区域 × 行业 双维度导航           │
                   └──────────────────┬──────────────────┘
                                      │ 点击插件
        ┌─────────┬─────────┬─────────┼─────────┬──────────┐
      /food     /tutor    /portal/…  /admin    …          
      （各模块 = 插件，入口由注册表驱动，不再硬编码）
```

**与现状的差**：现在门户是**静态 3 卡片**（硬编码 `/food /tutor /portal`）；改造后卡片**由后端注册表按登录人权限动态渲染**。

---

## 3. 数据模型（新增本体对象 → codegen → 迁移 023）

> 落位：`ontology` schema（与 region/industry/subject 同域）。**本体 YAML 为唯一结构真源**。

### 3.1 `AppModule`（插件注册表）— `ontology.app_module`
| 字段 | 类型 | 说明 |
|---|---|---|
| code | string unique | 插件编码（`food` / `tutor` / `org-admin` / `ontology-stats` …） |
| name / short / description | string/text | 展示 |
| icon | string | 图标（emoji 或 symbol id） |
| entry_url | string | 入口路由（`/food/` …） |
| category | enum | `business`（业务）/ `tool`（工具）/ `admin`（后台管理） |
| allowed_roles | json | 允许的**系统角色**闭集（`["consumer"]` / `["student"]` …）；空=公开 |
| is_core | boolean | 是否常驻（如「后台管理」仅 operator 可见，且不可被普通用户选用） |
| status / sort_order | string/integer | 生命周期/排序 |

### 3.2 `UserModule`（用户选用）— `ontology.user_module`
`user_id`(FK `public.users`) · `module_code` · `enabled`(bool) · `sort_order`
→ 「**可选插件方式选用**」的落点：用户在自己工作台勾选想用的插件。

### 3.3 双维度挂接（模块 ↔ 区域 / 行业）
- `ModuleRegion` → `ontology.module_region`：`module_code` + `region_id`(FK `ontology.region`)
- `ModuleIndustry` → `ontology.module_industry`：`module_code` + `industry_id`(FK `ontology.industry`)

> 语义：**某插件在哪些区域 / 哪些行业可见可用**（如多行业订餐：不同行业挂不同点餐插件；区域化运营：某区域只开本地模块）。
> 用真 FK（本体驱动）而非弱引用，保证维度删改时完整性可校验。

### 3.4 维度变更审计 — `ontology.dimension_change_log`（append-only）
`id` · `dimension`(`region`|`industry`) · `target_node_id` · `op`(`create/update/move/archive`) · `before`(json) · `after`(json) · `actor_id` · `source`(`manual`|`ai_command`) · `created_at`
→ 手动与 AI 命令**共用同一审计**，可追溯、可回滚。

---

## 4. API 契约（新增，全部走 `/api`，鉴权统一）

| 端点 | 方法 | 门禁 | 说明 |
|---|---|---|---|
| `/api/modules` | GET | 登录 | 返回**当前用户可用插件**（按角色 + 选用 + 维度筛选过滤） |
| `/api/modules/:code/enable` · `/disable` | POST | 登录 | 用户**选用/取消**插件（写 `user_module`） |
| `/api/modules/:code/bindings` | GET/PUT | operator | 查看/设置模块的 region/industry 挂接 |
| `/api/regions` / `/api/regions/:id` | GET/POST/PATCH/DELETE | GET 公开；写 operator | 区域维度 CRUD（树增改移归档） |
| `/api/industries` / `/:code` | 同上 | 同上 | 行业维度 CRUD |
| `/api/ontology/dimensions/command` | POST | operator | **AI 命令**：`{text}` → 结构化变更**提案**（diff，先不落库） |
| `/api/ontology/dimensions/apply` | POST | operator | 确认应用提案 `{planId}` → 事务应用 + 审计 |
| `/api/ontology/dimensions/changes` | GET | operator | 维度变更审计流水 |

> 查询参数：`/api/modules?region=<nodeId>&industry=<code>` → 按维度过滤可用插件。

---

## 5. 权限 / 插件模型（决策 + 理由）

**两级角色，取交集：**
- **系统角色**（`public.users.role`：`consumer|student|merchant|operator`）→ 决定**业务类**插件可见性。
- **组织角色**（`organization_members.role`：`owner|admin|member`）→ 决定**组织类**插件（如「组织管理台」）。

**可见性 = 满足以下全部**：① 角色在 `allowed_roles` 内（空=公开）② `status=active` ③（可选）用户已 `enabled` ④（可选）当前区域/行业上下文命中挂接。

**决策**：**「后台管理」类插件的门禁不放门户前端，仍在服务端**——门户只**隐藏**卡片，真实边界由 `assertSiteOperator`/`assertRole` 守（防前端绕过）。**理由**：门户是"礼貌性隐藏"，安全必须服务端强制（沿用 N1）。

---

## 6. 双维度挂接（决策 + 理由）

**决策**：模块 ↔ 维度用**显式关联表**（`module_region` / `module_industry`），不用 JSON 字段。
**理由**：① 维度本身是 8000/832 节点的树，关联须可索引、可 join、可 FK 校验；② 未来业务数据（订单/商家）也按 **region/industry 外键**落库，同一套维度复用；③ 本体驱动可直接声明。

**门户呈现**：工作台顶部一个「区域 × 行业」选择器（复用两棵树的钻取组件）；选定后插件列表按上下文过滤。**这也满足"首页增加两个维度"**。

---

## 7. 维度维护：手动 + AI 命令（双通道）

### 7.1 手动（admin）
operator 在**维度维护页**做树编辑：新增/改名/换父/排序/归档。写 `region`/`industry` 表 + `dimension_change_log`。

### 7.2 AI agent 命令
```
POST /api/ontology/dimensions/command { "text": "把行业 011 从门类 A 移到 B；新增区域‘东南亚特别区’" }
  → LLM 解析为结构化提案（create/update/move 列表 + before/after diff）
  → 返回 { planId, preview[] }        ← 先给用户预览，不落库
POST /api/ontology/dimensions/apply { "planId" }
  → 事务应用 + 逐条写 dimension_change_log（source=ai_command）
```
- 复用现成 `@gri/agent-core` + LLM（NVIDIA 通道）。
- **变更受控**：AI 命令**不直接改库**，先提案后确认；所有变更入审计。
- **可选回写真源**：重要变更可重新导出 `scripts/reference-data/data/*.json`（保持「数据真源」与库一致）——列为开放项。

### 7.3 数据一致性
`data/*.json`（checked-in 真源）↔ DB 的同步：**手动/AI 变更后可选重导出**；或声明「库为运行时真、json 为初始种子」（见 §10 开放项）。

---

## 8. 分期实施 + 任务拆分（**可下达卡**）

> 依赖：S1 独立 → S2 依赖 S1 契约 → S3 依赖 S2 → S4 依赖 S3 → S5 独立于 S4 但依赖 S2/S3 的维度 API。串行下达。

| # | 卡（建议命名） | 执行 | 内容 | 依赖 | 验收（含"能亲手点"） |
|---|---|---|---|---|---|
| **S1** | `p3-s1-portal-sso-workbench` | Codex | 门户壳改造：未登录→登录/注册页；已登录→工作台（先按**角色**过滤渲染插件卡片）；SSO 会话复用 auth-client | — | 浏览器 `/`：未登录见登录页；登录后见按角色过滤的卡片 |
| **S1b** | `p3-s1b-cross-app-sso` | Codex | **跨模块统一 SSO**：各模块前端共享 `gri-auth-token`；未登录跳 portal 登录（但 `apps/web` 自建 store，未接 auth-client → 二次登录） | S1 | portal 登录后直访 `/food/` `/tutor/` 不二次登录 |
| **S2** | `p3-s2-app-module-registry` | Codex | 本体 `AppModule` → 迁移 023 + 种子（把 9 模块注册）+ `GET /api/modules`（按角色返回可用）| S1 | 登录不同角色，`/api/modules` 返回不同集合 |
| **S3** | `p3-s3-user-plugin-optin` | Codex | `UserModule` 选用（enable/disable）+ 工作台勾选 UI + 列表按选用过滤 | S2 | 用户勾选/取消插件，刷新后工作台随之变化 |
| **S4** | `p3-s4-dimension-binding` | Codex | `module_region`/`module_industry` + 门户「区域×行业」选择器 + `?region=&industry=` 过滤 | S3 | 选定区域/行业，插件列表按上下文过滤 |
| **S5** | `p3-s5-dimension-admin-crud` | Codex | 维度 CRUD API（region/industry）+ operator 维护页 + `dimension_change_log` | S2 | operator 在维护页增/改/移节点，DB 与审计同步 |
| **S6** | `p3-s6-dimension-ai-command` | Codex | `command`（NLP→提案）+ `apply`（事务+审计）+ 提案预览 UI | S5 | 输入自然语言命令→预览 diff→确认→库生效且有审计 |

**我（总负责人）先做**：`docs/REQUIREMENTS_TRACE.md`（把本方案需求点 → 卡 → 验收 → 你能点的入口，串成一条线）。

---

## 9. 验收标准（可亲手点，端到端）

1. **SSO**：访问 `/` 未登录→登录/注册；登录一次，`/food`、`/tutor`、`/portal` 共享会话（不再重复登录）。
2. **插件按权限**：`consumer` 登录只看订餐类；`operator` 另见「后台管理」；无权限的卡片不出现（且**直接访问 URL 仍被服务端 403**）。
3. **选用**：用户勾选插件→工作台只显示已选；刷新保持。
4. **双维度**：选定某区域 + 某行业→插件列表按挂接过滤。
5. **手动维护**：operator 维护页改一个区域名→门户/接口立即反映，审计有记录。
6. **AI 命令**：输入"把行业 011 移到门类 B"→看到 diff 预览→确认→库生效 + 审计（`source=ai_command`）。

---

## 10. 开放决策点（需你拍板，不阻塞 S1/S2）

1. **选用 vs 授权**：「可选插件」是**用户自助选用**，还是**管理员授权后**才可选用？（本方案默认"权限内自助选用"）
2. **维度粒度**：模块挂接挂到**哪一层**（region 只挂 country/province？industry 挂 section？）——影响维护量。
3. **真源同步**：维度数据变更后，`data/*.json` **是否回写**（保持 checked-in 真源）还是「库为运行时真」？
4. **AI 命令权限**：谁来下达？（默认 operator/owner；是否需要二次确认阈值）
5. **后台管理的定义**：除 operator 外，是否给 org owner 一部分后台能力（如本组织成员管理已在 org 模块）。

---

*本方案为草案 v1。确认后我产出 §8 的**可下达提示词**，交你下达给 Claude/Codex。*
