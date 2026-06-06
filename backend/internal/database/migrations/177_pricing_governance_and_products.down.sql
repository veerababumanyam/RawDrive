-- 177_pricing_governance_and_products.down.sql

BEGIN;

ALTER TABLE subscription_upgrade_orders
    DROP CONSTRAINT IF EXISTS subscription_upgrade_orders_order_type_check;

ALTER TABLE subscription_upgrade_orders
    DROP COLUMN IF EXISTS order_type,
    DROP COLUMN IF EXISTS catalog_snapshot,
    DROP COLUMN IF EXISTS plan_version_id;

ALTER TABLE payments
    DROP COLUMN IF EXISTS catalog_snapshot;

ALTER TABLE invoices
    DROP COLUMN IF EXISTS catalog_snapshot;

DROP INDEX IF EXISTS idx_billing_notification_proofs_user_created;
DROP INDEX IF EXISTS idx_billing_notification_proofs_target;
DROP TABLE IF EXISTS billing_notification_proofs;

DROP INDEX IF EXISTS idx_pricing_email_batches_change_request;
DROP TABLE IF EXISTS pricing_email_batches;

DROP INDEX IF EXISTS idx_billing_lifecycle_jobs_target;
DROP INDEX IF EXISTS idx_billing_lifecycle_jobs_due_claim;
DROP TABLE IF EXISTS billing_lifecycle_jobs;

DROP INDEX IF EXISTS idx_billing_lifecycle_policies_scope;
DROP TABLE IF EXISTS billing_lifecycle_policies;

DROP INDEX IF EXISTS idx_workspace_storage_boosters_active;
DROP TABLE IF EXISTS workspace_storage_boosters;

DROP INDEX IF EXISTS idx_billing_orders_workspace_status;
DROP INDEX IF EXISTS idx_billing_orders_provider_order;
DROP INDEX IF EXISTS idx_billing_orders_idempotency;
DROP TABLE IF EXISTS billing_orders;

DROP INDEX IF EXISTS idx_billing_product_versions_product_effective;
DROP INDEX IF EXISTS idx_billing_product_versions_public;
DROP TABLE IF EXISTS billing_product_versions;

DROP INDEX IF EXISTS idx_billing_products_type_active_rank;
DROP TABLE IF EXISTS billing_products;

DROP INDEX IF EXISTS idx_pricing_audit_events_change_request_created;
DROP INDEX IF EXISTS idx_pricing_audit_events_target_created;
DROP TABLE IF EXISTS pricing_audit_events;

DROP INDEX IF EXISTS idx_pricing_change_requests_target;
DROP INDEX IF EXISTS idx_pricing_change_requests_status_created;
DROP TABLE IF EXISTS pricing_change_requests;

COMMIT;
