-- ============================================================================
-- GRI 重写 dev 种子（非迁移：文件名无 \d{3}_ 前缀，run-migrations 不会自动执行，需手动）。
-- 用法：psql -d gri -f src/migrate/seed-dev.sql
-- 目的：给「连单库后的垂直切片验收」造最小可跑数据（幂等 ON CONFLICT DO NOTHING）。
-- testuser 的 external_id 取固定 UUID a0000000-...-0001，与 auth-center 既有 testuser 对齐，
-- 以便真实 JWT 校验后 req.auth.externalId 能命中下面这行 public.users。
-- ============================================================================

BEGIN;

-- 1) 人（业务主键，唯一 FK 目标）
INSERT INTO public.users (id, username, name, role, status)
VALUES ('a0000000-0000-0000-0000-000000000001', 'testuser', '测试学生', 'student', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2) 身份（auth-center 将来读此表；external_id 指向 users.id = 唯一映射点）
INSERT INTO auth.identities (domain, username, name, external_id)
VALUES ('food', 'testuser', '测试学生', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (username) DO NOTHING;

-- 3) 订餐目录（公开读验收）
INSERT INTO public.restaurants (id, name, address, rating, status)
VALUES ('b0000000-0000-0000-0000-000000000001', '示例食堂', '主楼一层', 4.5, 'open')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dishes (id, restaurant_id, name, price, category, status)
VALUES ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '示例套餐', 12.50, '套餐', 'available')
ON CONFLICT (id) DO NOTHING;

-- 4) 学情目录 + testuser 的个人数据（学情切片验收）
INSERT INTO edu.knowledge_points (id, name, level)
VALUES ('d0000000-0000-0000-0000-000000000001', '一元二次方程', '初中')
ON CONFLICT (id) DO NOTHING;

INSERT INTO edu.questions (id, knowledge_point_id, content, answer, difficulty, type)
VALUES ('e0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001',
        '解方程 x^2 - 1 = 0',
        'x = ±1', 'easy', 'short-answer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO edu.learning_plans (id, user_id, title, start_date, end_date, progress, status)
VALUES ('f0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        '中考数学冲刺', CURRENT_DATE, CURRENT_DATE + 30, 20, 'active')
ON CONFLICT (id) DO NOTHING;

-- 5) 组织（M4 organization 切片验收）：testuser 是根组织与子组织的 owner，
--    testuser2 是子组织的普通 member（供「非 admin 写被拒」用例）。
--    注意 id 前四位用数字（1/2），保持合法 hex（uuid 列只收 hex 位）。
INSERT INTO public.users (id, username, name, role, status)
VALUES ('a0000000-0000-0000-0000-000000000002', 'testuser2', '普通用户', 'student', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant.organizations (id, name, code, short_name, level, type, status, parent_path)
VALUES ('10000000-0000-0000-0000-000000000001', '示例学校', 'SCHOOL', '示例校', 1, 'school', 'active', '/')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant.organizations (id, name, code, short_name, level, type, status, parent_path, parent_id)
VALUES ('20000000-0000-0000-0000-000000000001', '示例年级组', 'GRADE9', '示例年级', 2, 'school', 'active', '/10000000-0000-0000-0000-000000000001/', '10000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant.organization_members (organization_id, user_id, role, status)
VALUES ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner', 'active')
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO tenant.organization_members (organization_id, user_id, role, status)
VALUES ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'owner', 'active')
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO tenant.organization_members (organization_id, user_id, role, status)
VALUES ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'member', 'active')
ON CONFLICT (organization_id, user_id) DO NOTHING;

COMMIT;