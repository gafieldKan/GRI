-- ============================================================================
-- GRI 迁移 017：注册链路身份契约 —— public.users 库侧门禁（fail-fast 红线）
--
-- 背景：注册编排先在业务库建 public.users（拿 uuid 作 identities.external_id）。
--   为防止并发双写 / 重复注册产出第二份状态，必须在库侧加 UNIQUE + CHECK 兜底。
--
-- 幂等：约束已存在则跳过（pg_constraint 探测）。
-- 前置：先跑去重预检（本文件自带），重复行存在则显式报错中止，给出定位。
-- ============================================================================

BEGIN;

-- 预检：UNIQUE 迁移遇重复行必失败，先显式 RAISE 指出重复值（以人为本，避免盲跑）
DO $$
DECLARE
  d_username text;
  d_email    text;
  d_phone    text;
BEGIN
  SELECT username INTO d_username FROM public.users
   GROUP BY username HAVING count(*) > 1 LIMIT 1;
  IF d_username IS NOT NULL THEN
    RAISE EXCEPTION 'public.users 存在重复 username=%，请先去重再迁移 017', d_username;
  END IF;

  SELECT email INTO d_email FROM public.users
   WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1 LIMIT 1;
  IF d_email IS NOT NULL THEN
    RAISE EXCEPTION 'public.users 存在重复 email=%，请先去重再迁移 017', d_email;
  END IF;

  SELECT phone INTO d_phone FROM public.users
   WHERE phone IS NOT NULL GROUP BY phone HAVING count(*) > 1 LIMIT 1;
  IF d_phone IS NOT NULL THEN
    RAISE EXCEPTION 'public.users 存在重复 phone=%，请先去重再迁移 017', d_phone;
  END IF;
END $$;

-- UNIQUE（NULL 可多行 —— PG 语义，故 email/phone 允许重复 NULL）+ CHECK（库侧守卫）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_username') THEN
    ALTER TABLE public.users ADD CONSTRAINT uq_users_username UNIQUE (username);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_email') THEN
    ALTER TABLE public.users ADD CONSTRAINT uq_users_email UNIQUE (email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_phone') THEN
    ALTER TABLE public.users ADD CONSTRAINT uq_users_phone UNIQUE (phone);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_status') THEN
    ALTER TABLE public.users ADD CONSTRAINT ck_users_status
      CHECK (status IN ('active', 'deleted', 'suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_username_len') THEN
    ALTER TABLE public.users ADD CONSTRAINT ck_users_username_len
      CHECK (char_length(username) >= 3);
  END IF;
END $$;

COMMIT;
