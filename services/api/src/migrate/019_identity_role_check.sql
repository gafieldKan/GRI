BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_role') THEN
    ALTER TABLE public.users ADD CONSTRAINT ck_users_role
      CHECK (role IN ('consumer','student','merchant','operator'));
  END IF;
END $$;

COMMIT;
