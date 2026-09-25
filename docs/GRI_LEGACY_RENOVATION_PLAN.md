# GRI 旧资产改造方案（本体驱动 · 底线贯彻 · 结构先行）

> 承接 `GRI_REWRITE_TARGET_BLUEPRINT.md`（重写蓝图）与 `GRI_REWRITE_CONSTRUCTION_PLAN.md`（施工图）。
> 定稿：2026-09-25。执行状态：片 A/B/C/D/E 已完成，见文末执行记录。

## 一、基本底线（用户拍板，一切裁决标准）

**本体驱动：本体的本质 = 多态 · 可变 · 内外部关系复杂 · 有生命周期；现实世界的真实映射。**

| 本体特性 | OO 支撑特性 | GRI 落地 |
|---|---|---|
| 多态 | 继承 + 多态 | DSL `extends`/`abstract`/`discriminator`；教材继承体系（013 迁移） |
| 可变 | 封装（受控演进） | 结构变更一律 YAML 真源 → codegen 产出迁移；本体可变、变更受控 |
| 内外部关系复杂 | 封装 + 组合 + 关联建模 | Object/Link 表达内外部关系；跨域关系走关联类（kp_prerequisite） |
| 有生命周期 | 状态模式（GoF 行为型） | 有生命周期实体一律 stateMachine；013 CHECK 约束落库 |

- **面向对象是实现本体论的最佳实现**：多态/继承/封装支撑本体特性。
- **设计模式是本体发挥作用的关键**：让本体设计更好地应对现实世界内外部关系变化。
- **旧资产一定要改**：按底线彻底修正遗留问题，可以改造、修改、删除——不符合底线与红线的资产（含低代码平台）都在处置范围内。

## 二、设计模式口径（GoF 23 种）

软件设计模式共 23 种，分创建型（5）/结构型（7）/行为型（11）三大类，是面向对象软件开发的经典经验总结。

**补充红线**：
1. 新代码遇合适场景有意识应用，片验收点名模式与理由；**不为模式而模式**
2. 优先复用既有实例（Nest 单例 provider、Express→Nest 适配器、makeTool 工厂、AuthRouter 策略、Tuition/Curriculum 门面外观、中间件责任链、状态机）
3. 数据建模手法（关联类/单表继承/discriminator）归"面向对象实现"红线管，不算设计模式

## 三、盘点结论与处置（三档：删除 / 改造 / 保留）

| 资产 | 处置 | 依据 |
|---|---|---|
| packages/lowcode（41546 行 React 栈 + 54 报告） | **删除** | 零消费方（无包依赖、compose/nginx 零引用）；用户点名；非本体驱动 |
| tuition knowledge-points/knowledge-graph 端点 | **删除** | 前端零调用；已被 /api/curriculum 承接 |
| master-data API 模块 | **删除**（表留） | 3 端点前端零调用；ontology.master_data 降级为 import 同源缓存 |
| 012 迁移的 Link FK UNIQUE 漂移 | **改造** | many:1 被写成 1:1；实机库核对无此约束，文件已修正 |
| k12-curriculum 本体 | **改造**（四特性补全） | 只用了 stateMachine → 补继承/多态（教材六学科子类）、生命周期（三态机）、封装 |
| docs 20 篇过期报告 | **归档** → docs/archive/ | 描述架构已退役（低代码/农业/物流/批发业/M1 旧架构） |
| apps/web（订餐 H5）+ food 模块 | **保留** | 现役真实入口（public.orders 有真实数据） |
| tuition 其余 40 端点 | **保留** | sessions/practice/exam/plans 全被双前端调用 |
| orders.ontology.yaml 单表继承样板 | **保留** | DSL 继承/多态能力的端到端测试锚点（防漂移双锚点之一） |
| ETL 脚本 etl-converge*.ts | **保留** | _etl_*_map 运行时在读；代码留作历史记录 |
| tools/nat-proxy | **保留**（plugin 删） | frp/ngrok 工具本体现役 |

## 四、改造实施（六片，已完成）

### 片 A — lowcode 整体退役 ✅
- `git rm -r packages/lowcode`（41546 行 + docs/54 报告）
- root package.json：test:lowcode 删、test:all 缩、React/antd/@vitejs/plugin-react 全家依赖删、keywords 去 lowcode
- CI：lowcode-test / lowcode-lint 两 job 删
- nat-proxy：lowcode-plugin 目录删 + README/docs/CHANGELOG 引用清零
- web 两处文本引用清（auth.js 注释、SignaturePad 改"独立实现"）
- README/CLAUDE.md/bootstrap.sh 目录结构按现状重写
- lockfile：1552 装上 / 1362 卸下（React 栈清零）
- **顺手根治运维缺陷**：compose 前端容器以 root 跑 npm install 污染宿主 node_modules 权限 → web-ai-tutor/portal 补 `/app/node_modules` 匿名卷隔离

### 片 B — tuition 过时端点退役 ✅
- controller 删 `GET knowledge-points` / `GET knowledge-points/:id/questions` / `GET knowledge-graph` 三路由
- service 删 getKnowledgePoints/getKnowledgeGraph/getQuestionsByKnowledgePoint 三方法；types 删 KnowledgePoint
- public-routes 白名单去三条；spec 同步（新增"退役端点不再放行"断言）

### 片 C — master-data 模块退役 ✅
- 模块目录整体删除（controller/service/types/module/spec）
- app.module 去 MasterDataModule；白名单去三条
- `ontology.master_data` 表保留：k12 import.mjs 同源缓存（读写均在管线内，无 API 面）

### 片 D — k12 本体补四特性（结构先行）✅
- **YAML 0.2.0 → 0.3.0**：Textbook 抽象基类 + 六学科子类（MathTextbook/Chinese/English/Physics/Chemistry/Biology，discriminator=textbook_type，variantFields 预留：物理 labList/化学 experimentList/生物 specimenList——待真需求填充）
- **生命周期**：Textbook/TextbookChapter stateMachine（draft→published→archived）；KnowledgePoint 状态机扩 archived 终态
- **codegen 混合模式**（§7.4 登记制加性扩展）：generateSQL 从"发现 discriminator 就整本体单表"改为"单表继承基表 + 普通对象并存"——k12 教材继承与六普通对象并存成为可能；orders 样板的 User 表回归（修复旧缺陷）
- **迁移 013**：textbook_type 判别列 + extra JSONB + 存量归一（subject_id→判别值、active→published）+ 四张 CHECK 约束（状态机词表落库硬门禁）
- **012 防漂移对齐**：Link FK UNIQUE 漂移修正（实机库核对为准）
- **运行时对齐**：curriculum/agent 教材查询 `status='active'` → `published OR active`；review 状态机补 archive；import.mjs 写判别值
- 新测试锚点：`packages/codegen/tests/mixed-mode.test.js`（六用例：13 objects 门禁、判别列+extra、六普通对象不丢、关联类复合唯一保留、orders 零回归、确定性）

### 片 E — 文档归档 + 定稿 ✅
- 20 篇过期报告 → docs/archive/（低能力×3、农业/物流/批发业/餐饮总体设计、GRI 平台系列×8、M1 旧架构手册、移动端总结、DEPLOYMENT_SUMMARY 等）
- 现役文档（ARCHITECTURE/TESTING/CICD）lowcode 段落清零
- 本文档落定

### 片 F — 全仓验证收口（见下）

## 五、验证方案与红线核对

- **逐片门禁**：A（test:all 全绿 + api jest 235/235）→ B（tsc + jest 230/230）→ C（230/230）→ D（codegen 35/35 + ontology 12 + engine 13 + api 230 + E2E textbooks/chapters 通）
- **红线核对**：
  1. 本体驱动 ✅ 013 结构全部 YAML→codegen→审阅合并；012 漂移修复也回到"与生成器一致"
  2. OO 四特性 ✅ 多态/继承（教材体系）/封装（edu.kp 只加列、canonical 子集）/生命周期（三态机 + CHECK）
  3. 设计模式 ✅ 片 D 点名：模板方法（generateSQL 混合分派）、状态模式（review TRANSITIONS + CHECK 同源）、工厂（codegen 沿用）
  4. fail-fast ✅ schema/语义两道门禁 + 013 库侧 CHECK + 防漂移字节匹配（双锚点 orders+k12）
  5. 求稳 ✅ 迁移幂等（IF NOT EXISTS/DO-EXCEPTION）、分片 commit 可回滚

## 六、遗留与下一步

- **阶段六（全学科批量扩展）**：按 k12 管线复制（catalog YAML → generate → staging 审核 → import），二期初中数学全 3 年级 + 物理起步
- 教材 variantFields 待真需求填充（结构已先行）
- kp_prerequisite 图算法（学习路径推荐 DAG 拓扑）远期
