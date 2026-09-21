-- 005_payments.sql —— 点餐域支付（M5 垂直一）
--
-- 收敛闭环：下单(pending) → 支付回执(paid) → 确认(confirmed) → 完成(completed / 经 optional delivered)，
-- 任一待履行态可取消(cancelled)。订单态存 VARCHAR(20) 无 CHECK，扩枚举零迁移成本（仅文档性）。
-- 支付单金额一律锁库（order.total_amount），回调/客户端伪造金额无效；notify 幂等 + 签名校验。

-- 支付单：一次支付尝试 = 一行。mock 网关默认；生产按 method 插真实网关 provider（签名对账）。
CREATE TABLE IF NOT EXISTS public.payments (
    id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID            NOT NULL REFERENCES public.orders(id),
    user_id        UUID            NOT NULL REFERENCES public.users(id),
    amount         NUMERIC(12,2)   NOT NULL,              -- 锁序金额（= order.total_amount），防伪造
    method         VARCHAR(20)     NOT NULL DEFAULT 'mock', -- 'mock'|'cash'|'wechat'|'alipay'
    status         VARCHAR(20)     NOT NULL DEFAULT 'pending', -- 'pending'|'paid'|'refunded'|'failed'
    transaction_id VARCHAR(64),                           -- 网关交易号
    provider_ref   VARCHAR(128),                          -- 网关回调对账引用（生产 provider 用）
    created_at     TIMESTAMPTZ     DEFAULT NOW(),
    updated_at     TIMESTAMPTZ     DEFAULT NOW()
);

-- 同订单+同交易号幂等（notify 重放不产生副作用）
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_order_txn
    ON public.payments (order_id, transaction_id)
    WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_order
    ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user
    ON public.payments (user_id);