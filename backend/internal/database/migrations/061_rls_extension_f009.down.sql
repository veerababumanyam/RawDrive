-- Down migration for F-009 Part B RLS extension. Drops the isolation
-- policies and disables RLS on the 19 tables added in the up migration.
-- Does NOT touch the tables from migration 008 (workspaces,
-- workspace_members, galleries) — those are outside this migration's scope.
--
-- WARNING: running this down migration removes tenant isolation from
-- the affected tables. Only run on a dev environment or during a
-- controlled rollback.

DROP POLICY IF EXISTS ai_search_queries_isolation        ON ai_search_queries;
DROP POLICY IF EXISTS api_keys_isolation                  ON api_keys;
DROP POLICY IF EXISTS assets_isolation                    ON assets;
DROP POLICY IF EXISTS desktop_sessions_isolation          ON desktop_sessions;
DROP POLICY IF EXISTS download_jobs_isolation             ON download_jobs;
DROP POLICY IF EXISTS encryption_keys_isolation           ON encryption_keys;
DROP POLICY IF EXISTS gallery_banners_isolation           ON gallery_banners;
DROP POLICY IF EXISTS gallery_design_templates_isolation  ON gallery_design_templates;
DROP POLICY IF EXISTS gallery_orders_isolation            ON gallery_orders;
DROP POLICY IF EXISTS gallery_products_isolation          ON gallery_products;
DROP POLICY IF EXISTS invitations_isolation               ON invitations;
DROP POLICY IF EXISTS moderation_items_isolation          ON moderation_items;
DROP POLICY IF EXISTS streams_isolation                   ON streams;
DROP POLICY IF EXISTS subscriptions_isolation             ON subscriptions;
DROP POLICY IF EXISTS upload_allowlist_tokens_isolation   ON upload_allowlist_tokens;
DROP POLICY IF EXISTS video_assets_isolation              ON video_assets;
DROP POLICY IF EXISTS webhooks_isolation                  ON webhooks;
DROP POLICY IF EXISTS workspace_storage_isolation         ON workspace_storage;
DROP POLICY IF EXISTS workspace_storage_configs_isolation ON workspace_storage_configs;

ALTER TABLE ai_search_queries          DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE assets                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE desktop_sessions            DISABLE ROW LEVEL SECURITY;
ALTER TABLE download_jobs               DISABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_keys             DISABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_banners             DISABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_design_templates    DISABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_orders              DISABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_products            DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_items            DISABLE ROW LEVEL SECURITY;
ALTER TABLE streams                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions               DISABLE ROW LEVEL SECURITY;
ALTER TABLE upload_allowlist_tokens     DISABLE ROW LEVEL SECURITY;
ALTER TABLE video_assets                DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage           DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage_configs   DISABLE ROW LEVEL SECURITY;
