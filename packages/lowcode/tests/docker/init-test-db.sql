-- 初始化测试数据库
-- 所有测试表以 test_ 前缀标识，便于清理

-- 创建测试用户
CREATE USER IF NOT EXISTS test_app WITH PASSWORD 'test123';

-- 创建测试模式
CREATE SCHEMA IF NOT EXISTS test_schema;

-- 设置权限
GRANT ALL PRIVILEGES ON SCHEMA test_schema TO test_app;
GRANT ALL PRIVILEGES ON DATABASE lowcode_test TO test_app;

-- 创建测试表前缀标记
COMMENT ON DATABASE lowcode_test IS 'Test database for lowcode platform - all tables prefixed with test_';
