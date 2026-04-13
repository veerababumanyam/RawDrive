-- M32 / F-014 · Rollback recharge orders + invoices

DROP POLICY IF EXISTS streaming_invoices_update_pdf ON streaming_invoices;
DROP POLICY IF EXISTS streaming_invoices_insert    ON streaming_invoices;
DROP POLICY IF EXISTS streaming_invoices_read      ON streaming_invoices;
DROP TABLE  IF EXISTS streaming_invoices;

DROP POLICY IF EXISTS streaming_recharge_orders_write ON streaming_recharge_orders;
DROP POLICY IF EXISTS streaming_recharge_orders_read  ON streaming_recharge_orders;
DROP TABLE  IF EXISTS streaming_recharge_orders;

-- Leave platform_settings rows in place on rollback; they're harmless empty strings
-- and flipping the table with ON CONFLICT on re-up is cheap.
