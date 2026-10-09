-- ============================================================================
-- GRI 迁移 018：food 评价 / 优惠券 / 商家归属
--
-- 幂等策略：
--   * 列/表/索引统一 IF NOT EXISTS；
--   * 命名约束先查 pg_constraint 再补，避免重复执行报错；
--   * 不删除、不重写任何既有业务数据。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 商家归属：身份唯一真源 externalId ≡ public.users.id
-- ---------------------------------------------------------------------------

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS merchant_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'fk_restaurants_merchant'
    ) THEN
        ALTER TABLE public.restaurants
            ADD CONSTRAINT fk_restaurants_merchant
            FOREIGN KEY (merchant_id) REFERENCES public.users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_restaurants_merchant
    ON public.restaurants (merchant_id);

-- ---------------------------------------------------------------------------
-- 评价：一单一评；库侧 CHECK 作为最后一道 fail-fast 门禁。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reviews (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID         NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id       UUID         NOT NULL REFERENCES public.users(id),
    restaurant_id UUID         NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    rating        INTEGER      NOT NULL,
    content       VARCHAR(500),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_reviews_rating CHECK (rating BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_order_id
    ON public.reviews (order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant
    ON public.reviews (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user
    ON public.reviews (user_id);

-- ---------------------------------------------------------------------------
-- 优惠券与领券记录
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupons (
    id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    code             VARCHAR(64)     NOT NULL,
    name             VARCHAR(150)    NOT NULL,
    discount_type    VARCHAR(20)     NOT NULL,
    discount_value   NUMERIC(12,2)   NOT NULL,
    min_amount       NUMERIC(12,2)   NOT NULL DEFAULT 0,
    total_quantity   INTEGER         NOT NULL,
    claimed_quantity INTEGER         NOT NULL DEFAULT 0,
    per_user_limit   INTEGER         NOT NULL DEFAULT 1,
    start_at         TIMESTAMPTZ,
    end_at           TIMESTAMPTZ,
    mutex_group      VARCHAR(64),
    status           VARCHAR(20)     NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_coupons_discount_type CHECK (discount_type IN ('fixed', 'percent')),
    CONSTRAINT ck_coupons_discount_value CHECK (discount_value > 0),
    CONSTRAINT ck_coupons_min_amount CHECK (min_amount >= 0),
    CONSTRAINT ck_coupons_total_quantity CHECK (total_quantity >= 0),
    CONSTRAINT ck_coupons_claimed_quantity CHECK (claimed_quantity >= 0 AND claimed_quantity <= total_quantity),
    CONSTRAINT ck_coupons_per_user_limit CHECK (per_user_limit >= 1),
    CONSTRAINT ck_coupons_time_window CHECK (start_at IS NULL OR end_at IS NULL OR start_at <= end_at),
    CONSTRAINT ck_coupons_status CHECK (status IN ('active', 'inactive', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_code
    ON public.coupons (code);
CREATE INDEX IF NOT EXISTS idx_coupons_active_window
    ON public.coupons (status, start_at, end_at);

CREATE TABLE IF NOT EXISTS public.coupon_claims (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id   UUID         NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claimed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    order_id    UUID         REFERENCES public.orders(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_claims_coupon_user
    ON public.coupon_claims (coupon_id, user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_claims_user
    ON public.coupon_claims (user_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_claims_order
    ON public.coupon_claims (order_id);

COMMIT;
