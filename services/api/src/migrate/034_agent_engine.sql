-- 034_agent_engine.sql
-- W2.6b 可换引擎选路：agent.llm_routes 增 engine 列 —— 该 routeKey 交给哪个 EnginePort 驱动。
--
-- 语义（与既有列**正交**，勿混）：
--   engine   = **谁拥有交错环**（perceive→act）。该值 = EnginePort id（gri-core / claude-code / openclaw…）。
--   provider = 'cli'（B-3b）是 **gri-core 引擎内部**的模型调用槽：GRI 仍拥环，只把「一问一答」外包给 CLI。
--              两者边界不同，可并存：engine='gri-core' + provider='cli' = 今天已有的「换脑子」（语义不变）。
--
-- 缺省 / 回滚：**NULL 即 'gri-core'**（宿主环 = 今日行为，零回归）。回滚只需把该列置回 NULL，不必删列。
-- 不硬插行：与 009 同约定 —— 缺省路由由 env 兜底，admin 经 API 增改覆盖。
-- 幂等：IF NOT EXISTS（迁移运行器另有 _api_migrations 记录表）。
-- 校验边界：合法值由 **api 侧 admin 写入口**对照引擎注册表校验（写时 fail-fast，防手工错字把某路由指到不存在的引擎）；
--   本迁移不加 CHECK 约束 —— 引擎集是可扩展的（插件可新增引擎），不该把可用集合焊死在库结构里。
-- ----------------------------------------------------------------------------
ALTER TABLE agent.llm_routes ADD COLUMN IF NOT EXISTS engine VARCHAR(48);
COMMENT ON COLUMN agent.llm_routes.engine IS 'EnginePort id；NULL/''gri-core''=宿主环（默认），否则交由该引擎（W2.6b）';
