-- Down for migration 174: drop the signup_payment_orders table (and its
-- indexes, which Postgres removes with the table). Reversible, idempotent.

BEGIN;

DROP TABLE IF EXISTS signup_payment_orders;

COMMIT;
