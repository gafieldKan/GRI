-- GRI 组织架构管理模块 - 数据库验证脚本
-- 使用方法：psql -U postgres -d gri_db -f scripts/verify-organization-db.sql

\echo '========================================'
\echo 'GRI 组织架构管理数据库验证'
\echo '========================================'

-- 1. 检查表是否存在
\echo ''
\echo '=== 检查表是否存在 ==='

SELECT
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN '✓ organizations 表存在' ELSE '✗ organizations 表不存在' END AS organizations_check;

SELECT
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_members') THEN '✓ organization_members 表存在' ELSE '✗ organization_members 表不存在' END AS members_check;

SELECT
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_roles') THEN '✓ organization_roles 表存在' ELSE '✗ organization_roles 表不存在' END AS roles_check;

SELECT
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_role_members') THEN '✓ organization_role_members 表存在' ELSE '✗ organization_role_members 表不存在' END AS role_members_check;

SELECT
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_invitations') THEN '✓ organization_invitations 表存在' ELSE '✗ organization_invitations 表不存在' END AS invitations_check;

SELECT
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_audit_logs') THEN '✓ organization_audit_logs 表存在' ELSE '✗ organization_audit_logs 表不存在' END AS audit_logs_check;

-- 2. 检查扩展字段
\echo ''
\echo '=== 检查 organizations 表扩展字段 ==='

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations'
AND column_name IN ('code', 'short_name', 'logo_url', 'settings', 'metadata');

-- 3. 检查 organization_members 表扩展字段
\echo ''
\echo '=== 检查 organization_members 表扩展字段 ==='

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organization_members'
AND column_name IN ('employee_no', 'department', 'title', 'direct_manager', 'metadata');

-- 4. 检查索引
\echo ''
\echo '=== 检查索引 ==='

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('organizations', 'organization_members', 'organization_roles', 'organization_role_members', 'organization_invitations', 'organization_audit_logs')
ORDER BY tablename, indexname;

-- 5. 检查触发器
\echo ''
\echo '=== 检查触发器 ==='

SELECT
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN ('organizations', 'organization_members', 'organization_roles', 'organization_invitations')
ORDER BY event_object_table, trigger_name;

-- 6. 统计行数
\echo ''
\echo '=== 数据统计 ==='

SELECT 'organizations' as table_name, count(*) as row_count FROM organizations
UNION ALL
SELECT 'organization_members', count(*) FROM organization_members
UNION ALL
SELECT 'organization_roles', count(*) FROM organization_roles
UNION ALL
SELECT 'organization_role_members', count(*) FROM organization_role_members
UNION ALL
SELECT 'organization_invitations', count(*) FROM organization_invitations
UNION ALL
SELECT 'organization_audit_logs', count(*) FROM organization_audit_logs;

\echo ''
\echo '========================================'
\echo '验证完成'
\echo '========================================'
