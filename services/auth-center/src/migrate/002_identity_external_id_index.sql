-- 注册后的身份由 external_id 单列定位（注销/服务间查询路径）。
-- 001 的 (domain, external_id) 联合索引不适用于省略 domain 前缀的查询。
CREATE INDEX IF NOT EXISTS idx_identities_external_id
  ON identities(external_id);
