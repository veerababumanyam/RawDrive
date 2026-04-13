DROP INDEX IF EXISTS idx_payments_project_id;
DROP INDEX IF EXISTS idx_follow_ups_project_id;
DROP INDEX IF EXISTS idx_galleries_project_id;
DROP INDEX IF EXISTS idx_galleries_contact_id;
DROP INDEX IF EXISTS idx_contracts_project_id;
DROP INDEX IF EXISTS idx_invoices_project_id;
DROP INDEX IF EXISTS idx_events_project_id;

ALTER TABLE payments DROP COLUMN IF EXISTS project_id;
ALTER TABLE follow_ups DROP COLUMN IF EXISTS project_id;
ALTER TABLE galleries
    DROP COLUMN IF EXISTS project_id,
    DROP COLUMN IF EXISTS contact_id;
ALTER TABLE contracts DROP COLUMN IF EXISTS project_id;
ALTER TABLE invoices DROP COLUMN IF EXISTS project_id;
ALTER TABLE events DROP COLUMN IF EXISTS project_id;

DROP POLICY IF EXISTS studio_projects_workspace_isolation ON studio_projects;
DROP TABLE IF EXISTS studio_projects;
