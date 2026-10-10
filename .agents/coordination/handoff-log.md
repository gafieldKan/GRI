2026-10-07T23:24:34+08:00 | START | Task 3: bcryptjs 容器化 | 开始执行
2026-10-07T23:26:06+08:00 | DONE | Task 3: bcryptjs 容器化 | 已完成（auth-center 原已使用 bcryptjs，docker build 通过）
2026-10-07T23:48:12+08:00 | Claude→Codex | auth-middleware-design.md | Task 1 设计完成，供 Task 2 实现参考
2026-10-08T07:09:34+08:00 | Task 1 impl | JWKS cache fix applied + regression test passed (7/7) + api tests passed (274/274)
2026-10-09T08:11:18+08:00 | 编排 | p2-task-1a (Claude) 卡就绪：.agents/claude/tasks/p2-task-1a-identity-register-contract-design.md
2026-10-09T08:11:18+08:00 | 编排 | p2-task-1 (Codex) 卡重写就绪（修正 external_id 映射根因）：.agents/codex/tasks/p2-task-1-identity-register-delete-password.md
2026-10-09T10:30:26+08:00 | 验收 | p2-task-1 已实现并端到端验证通过（PASS=20 FAIL=0）；代码未提交
2026-10-09T10:33:00+08:00 | 裁决 | p2-task-1 偏差①DTO 弃 class-validator 改手工校验 —— 接受（api 未声明该依赖 + 全局 ValidationPipe 已开，装饰器类在不稳定的依赖提升下会炸；400 语义经 e2e 实测保留）
2026-10-09T10:33:00+08:00 | 裁决 | p2-task-1 偏差②identity.service.spec 硬删→软删断言改写 —— 接受（原 spec 编码硬删与设计冲突；纠正过时断言非删测试通过，另新增 502/404 两例）
2026-10-09T10:33:00+08:00 | 裁决 | p2-task-1 偏差③password 复用控制器通用 proxy() 透传 —— 接受（符合设计「api 侧透传」，代码更少）
2026-10-09T14:35:00+08:00 | 验收 | p2-task-1b(Codex 精修) 独立复验通过：api tsc 0err / auth-center tsc 0err / api eslint 0e0w / api 25suites·311tests / ac 4suites·28tests / e2e PASS=20 FAIL=0 / UI 改动真实非空壳 / 生产编排未误碰
2026-10-09T14:35:00+08:00 | 缺陷 | p2-task-1b 索引迁移 002_identity_external_id_index.sql 仅写文件未执行（nest build 不拷贝 .sql 资产 → dist/migrate 无 002 → runner 永不执行）。已手工补应用索引 + 登记 _auth_migrations。工具链缺口需另修。
2026-10-09T14:40:00+08:00 | 纠正 | 撤回上条「002 迁移工具链缺口(nest build 不拷 .sql)」的误判。实测：nest-cli.json 已含 assets[{include:"migrate/*.sql"}]，重新 build 后 dist/migrate 正确含 002，官方 runner 成功识别。真因：加 002 后未重新 build（dist 陈旧），非工具链缺陷。
2026-10-09T15:30:00+08:00 | 归拢 | 在途改动按主题清理并提交（6 批）：b3ac600 本体+codegen孪生 / 8fdde79 api curriculum+tuition / e8adac2 twin-ui / 47426c0 mini-program / c3a1ec5 infra(nginx+jwt-verifier+清理) / ef6a535 styles+k12 etl+docs。清 6 个备份垃圾 + 修 .gitignore(*.backup*/*.before_*/*.orig)。全树 tsc 双绿。
2026-10-09T18:00:00+08:00 | 编排 | p2-task-4(Codex) 卡【重写】就绪：原卡与实况严重脱节。修正点：①新增 018_food_review_coupon_merchant.sql（reviews/coupons/coupon_claims 三表 + restaurants.merchant_id 列 + 索引，全幂等）②授权模型纠偏——JWT roles 恒空是【有意的架构决策】（agent-admin.controller 注释佐证），运营=根组织 assertSiteOperator(externalId)，商家=数据归属(merchant_id===externalId)，禁止改 auth-center 注入 roles、禁止依赖 req.auth.roles ③业务表在 public schema（非 food.）④订单评价前置状态=completed ⑤写入『改 SQL 后先 npm run build 再 npm run migrate』纪律（T1b dist 陈旧教训）⑥产出物清单显式列迁移文件。
2026-10-09T18:00:00+08:00 | 编排 | p2-task-11 卡【作废 VOID】：实测 /api/ontology/stats 早已实现（四段聚合远超原卡设想）且【故意不入白名单】；master-data 模块已退役（无 API 面）；version.json 不存在；目录为扁平 4 个。无可执行剩余工作，保留作废记录卡。
2026-10-09T18:00:00+08:00 | 归拢 | run-wave1.sh 收窄为仅 T4（T1 已提交 08bcb33；T11 作废）。task-status.json 记 p2-task-4=card_rewritten_ready_for_codex、p2-task-11=voided + 三条裁决。
2026-10-09T18:00:00+08:00 | 澄清 | 撤回「nest build 不拷 .sql」工具链缺口：nest-cli.json assets[migrate/*.sql] 两服务均已正确配置，真因是 dist 陈旧。无需修工具链卡。
2026-10-10T07:45:00+08:00 | 核实 | 上阶段收口确认：仓库干净(0改动)、8/8 容器 running、T1/T1b/T4 done_and_committed、T11 voided、在途6批已提交。
2026-10-10T07:45:00+08:00 | 校正 | 剩余卡(T2/T3/T5/T6/T7/T8/T9/T10/T12)逐卡对代码实测：多数为 10-08 旧快照，本体/孪生/课程大合并后对不上现实（同 T4/T11 病根）。详见 .agents/coordination/card-recon-2026-10-10.md
2026-10-10T07:45:00+08:00 | 编排 | Wave A 卡片就绪：Claude 设计卡 .agents/claude/tasks/p2-task-2a-identity-operator-authz-design.md；Codex 实现卡 .agents/codex/tasks/p2-task-2-identity-operator-role-status-impl.md；Claude e2e 卡 .agents/claude/tasks/p2-task-3-e2e-identity-lifecycle-contract.md
2026-10-10T07:45:00+08:00 | 决策 | 身份模型(用户确认 b)：授权底座修正并入 T2。identity 运营面一律 OrganizationService.assertSiteOperator(externalId)（根组织 owner|admin）；禁止 req.auth.roles（恒空）。OutputIdentityModule 需 imports:[OrganizationModule]。
2026-10-10T07:45:00+08:00 | 作废 | p2-task-9 VOID：curriculum 已提供 knowledge-graph/knowledge-map/learning-path（功能重叠+真源分裂，知识图谱归 curriculum）。旧卡 .agents/codex/tasks/p2-task-9-knowledge-graph.md 标 VOID。
2026-10-10T07:45:00+08:00 | 降级 | T5/T8/T10 降级核验卡（大半已存在，只补真缺口）；T6/T7 重写卡（修本体引用，无 k12/teaching.yaml、k12/questions.yaml）；T12 收窄重写（无旧后端可下线）。旧卡均加状态横幅。
2026-10-10T08:26:03+08:00 | 交付 | p2-task-2a(Claude 设计) 完成：.agents/claude/outputs/p2-task-2-identity-operator-authz-design.md(27KB) + p2-task-2-contract.md + p2-task-2-risk-rollback.md。逐条决策、无待定、含 GoF 自证(Facade/Strategy/Template Method/Proxy)。
2026-10-10T08:26:03+08:00 | 复验 | p2-task-2a 独立复验【通过】。承重事实实测对账：F6(role 无库侧CHECK)✅、F7(ck_users_status)✅、F8(auth.service.ts:40/100/150 三处 status!=='active')✅、F9(auth-center 无 enable 端点，零命中)✅、F10(api 无 class-validator)✅、死代码面仅 identity.controller.ts:24,54 无外溢✅。
2026-10-10T08:26:03+08:00 | 裁决 | T2 §10 两项待确认已裁决，均采纳设计默认：①suspended 停 auth-center 凭证(否则空操作，F8 佐证)+包含 enable 闭环；②新增迁移 019_identity_role_check.sql(ck_users_role 库侧第二道门，现值仅 consumer/student 零回填风险)。
2026-10-10T08:26:03+08:00 | 提示 | 实现卡需显式列出 auth-center 两文件(identity-admin.service.ts+controller.ts 新增 enable)，否则 D5 恢复断言跑不通。
2026-10-10T08:26:03+08:00 | 交接 | 设计已复制至 .agents/codex/context/(md5 一致 4a01b6ad...)。放行 p2-task-2b(Codex 实现)。
2026-10-10T14:10:43+08:00 | 交付 | p2-task-2b(Codex 实现) 完成：11 文件（api 6 + auth-center 4 + 019 迁移 1；public-routes 未改）。产出 p2-task-2-file-list.md + p2-task-2-verify.sh。
2026-10-10T14:10:43+08:00 | 验收 | p2-task-2b 独立复验【通过】(非自述)：api tsc 0err / api eslint 0e0w / api 25suites·370tests 全绿 / auth-center tsc 0err / ac 4suites·31tests 全绿 / 019 迁移已落库(ck_users_role 存在) / T2 e2e PASS=88 FAIL=0 VERIFY_EXIT=0 / T1 回归 PASS=20 FAIL=0。
2026-10-10T14:10:43+08:00 | 核查 | 红线源码级核验全绿：①READ_ANY_ELEVATED_ROLES 零残留 ②identity.controller 无 roles 引用 ③授权门唯一走 assertSiteOperator(externalId) ④public-routes.ts 未改(git 无差异) ⑤三新端点齐(Get() / Patch :id/role / Patch :id/status) ⑥auth-center enable 端点存在 ⑦路由顺序 me(57) 先于 :id(77) ⑧isSameIdentity 大小写无关防 self-protection 绕过 ⑨auth.service.ts 未改(roles:[] 恒空架构决策保持)。
2026-10-10T14:10:43+08:00 | 状态 | 代码未提交（11 文件在工作树）。待用户裁决：先提交 T2 还是先跑 T3。
2026-10-10T16:27:25+08:00 | 交付 | p2-task-3(Claude e2e 契约) 完成：4 新增文件（p2-task-3-e2e-identity-lifecycle.sh 11.5KB / p2-task-3-verify.sh 入口 / identity.contract.spec.ts 12.3KB / p2-task-3-file-list.md）。未改任何生产代码（git 核实）。
2026-10-10T16:27:25+08:00 | 验收 | p2-task-3 独立复验【通过】(非自述)：契约 spec 1suite·18tests 全绿 / api 全量 26suites·388tests 全绿(基线370+18) / api tsc 0err / T3 统一 e2e PASS=137 FAIL=0 VERIFY_EXIT=0 且【连跑两次幂等一致】。
2026-10-10T16:27:25+08:00 | 设计说明 | T3 采用 orchestrator 增量整合(T1 20 + T2 88 复用 + 新 §T3 29 段=137)，非重写；跨包契约(ESM vs CJS jest)用【源码漂移锚】--表达式一旦改写即红。
2026-10-10T16:27:25+08:00 | 核查 | 源码锚实测：A 锚 auth.service.ts:198(buildPayload: sub=identity.id / external_id=identity.externalId / roles:[])；B 锚 jwt-verifier/src/index.js:134,154(externalId: payload.external_id ?? payload.sub ?? null)。反例锚 E1-E4 防退化为 identity.id。
2026-10-10T16:27:25+08:00 | 状态 | T3 未提交（4 新增文件在工作树）。Wave A(T2+T3) 全绿。
2026-10-10T16:46:17+08:00 | 收口 | Wave A 收官：T2(696cc24)+T3(0a8671e) 均 done_and_committed。身份域 T1→T1b→T2→T3 闭环，e2e PASS=*** FAIL=0。task-status.json 已同步。
2026-10-10T17:10:38+08:00 | 重写 | p2-task-6 卡【REWRITTEN】：原卡参照物 k12/teaching.yaml 不存在；tutor-agent/session-fsm/tutor-session-agent/llm.service 均已存在（勿重建）。真实缺口=3 文件(teaching-card-fsm/intent-classifier/socratic-templates)。硬约束 N1 卡片态内嵌既有阶段FSM不冲突/N2 禁引不存在YAML/N3 代码常量不走codegen/N4 无迁移(复用 edu.sessions.session_data)/N5 复用既有 LlmService/N6 仅改 tuition.module。
2026-10-10T17:10:38+08:00 | 重写 | p2-task-7 卡【REWRITTEN】：原卡参照物 k12/questions.yaml 不存在；exam-scanner.ts 骨架已存在(含 Mock OCR 回退+LLM 解析)。真实缺口=3 文件(ocr-processor/question-parser/variant-generator)。OCR 选型定论=默认多模态LLM(复用 chatCompletionMultimodal)，不引入 PaddleOCR/Tesseract 原生依赖；无迁移(纯计算，不建 edu.exam_scans)；变式须经 parser 反向自校验；离线确定性 Mock。
2026-10-10T18:16:33+08:00 | 交付 | p2-task-6(Claude 实现) 完成：新增 3 类(teaching-card-fsm/intent-classifier/socratic-templates) + 3 spec + tuition.types/module 改 + file-list + verify.sh。
2026-10-10T18:16:33+08:00 | 验收 | p2-task-6 独立复验【通过】(非自述)：tsc 0err / tuition/agents 8suites·87tests 全绿 / api 全量 29suites·431tests 全绿(基线26/388 只增不减) / verify.sh PASS=*** FAIL=0。
2026-10-10T18:16:33+08:00 | 核查 | 硬约束源码级核验全绿：N1 session-fsm.ts 0 diff(未改既有导出) / N2 零 ontology import(未引不存在YAML) / N3 代码常量无 YAML/codegen / N4 无新迁移 / N5 复用 LlmService 无key回退Mock / N6 仅改 tuition.module.ts 注册3 provider。
2026-10-10T18:16:33+08:00 | 提交 | p2-task-6 已提交 07a3745（10 文件 +1222）。权限外未接线到 TuitionController（属后续前端集成卡）。
2026-10-10T18:21:16+08:00 | 裁决 | 挂起项1【.agents/ 豁免口径】—— 确认现状即正确，无需改动。实测：.gitignore 已反向豁免 !.agents/**/*.{md,sh,json}；已跟踪 49 md + 10 sh + 1 json + 1 js + 1 patch + 1 gitkeep；.log/.done 误跟踪=0；logs/ 仍正确 ignore。口径：任务卡/设计文档/交接记录/验收脚本入库，运行时噪音(logs/*.log/*.done)不入库。
2026-10-10T18:21:16+08:00 | 裁决 | 挂起项2【T11 处置】—— 确认归档 VOID。实测作废依据仍成立：①/api/ontology/stats 端点存在(ontology.controller.ts:45-47，OntologyStatsService) ②无 master-data 模块(已退役) ③version.json 不存在。task-status.json p2-task-11=voided，卡头已标【已作废/VOID】。保留作废记录，不执行。
2026-10-10T21:08:02+08:00 | 完成 | P2-T7 done_and_committed (26b2d37)。tuition/agents OCR适配层+结构化解析+变式生成（13 files, +1466/-102）。独立复验：tsc 0err / agents 11suites·122tests / 全量 32suites·466tests（基线29/431，+3/+35）/ verify.sh PASS=30 FAIL=0。硬约束 N1-N6 源码级全绿。
2026-10-10T21:08:02+08:00 | 缺陷 | 【T6 latent】intent-classifier.ts（07a3745）用 import type{LlmService} 注入依赖 → Nest emitDecoratorMetadata 运行期需值引用，import type 被擦除致启动 DI 解析失败（Nest can't resolve dependencies）。因 T6 未被容器装载（dist 旧）未暴露。由 T7 一并修复（值导入 + 4 spec 补 jest.mock('@gri/agent-core')）。教训：@Injectable 构造参数禁 import type。
2026-10-10T21:08:02+08:00 | 待办 | 【题型词汇归一】question-parser 产出规范化题型(single_choice/fill_blank/solution)，vs 既有 tutor-agent._checkAnswer/byType 键(choice/fill/solution)。未崩溃(有守卫)但分桶统计不计数+填空容差失效。需另立小卡：接线时归一(ai-agent.service 落库前 或 tutor-agent 加4别名映射)。
2026-10-10T21:08:02+08:00 | 待办 | 【build 冒烟】T6/T7 未接线、容器 dist 未含 → 接线卡须 npm run build + 启动冒烟，验证 DI 在真实启动路径不崩。
2026-10-10T21:47:10+08:00 | 重写 | T5/T8/T12 卡重写（Codex 名下）。依据 card-recon。T5：原卡引 k12/questions.yaml(不存在)+5端点中4个已存在→收窄为「会话级 progress/analysis 闭环 + practice/answer 落 session_id」。T8：原卡引 k12/wrong-questions.yaml(不存在)+SM-2方法名错(calculateNextReview→实为calculateSM2)+wrong_questions表结构描述全错(SR参数在sr_queue非wrong_questions)+去重键错(external_id→user_id)→收窄为「due队列+stats+单题详情」。T12：原卡三大前提两项不成立(无旧后端可下线/auth-center不可下线+前端硬编码=0/CI已有)→收窄为「scripts/health-check.sh + CI加固」。
