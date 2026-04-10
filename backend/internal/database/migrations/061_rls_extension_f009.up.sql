-- F-009 Part B (audit 2026-04-10): extend Row Level Security to every
-- tenant-scoped table that has a DIRECT `workspace_id` column but was
-- missing from the original RLS coverage in migration 008.
--
-- The initial RLS coverage only protected workspaces, workspace_members,
-- and galleries. Later milestones added many more tenant-scoped tables
-- (assets, api_keys, gallery_orders, subscriptions, workspace_storage_
-- configs, encryption_keys, etc.) but never enabled RLS on them. Any
-- query path that bypassed the workspace-context middleware — or that
-- ran under a superuser role — could have read or modified another
-- workspace's data. OWASP A01 (Broken Access Control).
--
-- This migration enables RLS on all 19 tables that carry a DIRECT
-- workspace_id column and adds the same isolation policy pattern used
-- by migration 008:
--
--   USING (
--       current_setting('app.bypass_rls', true) = 'on'
--       OR workspace_id::text = current_setting('app.workspace_id', true)
--   )
--
-- The bypass_rls escape hatch is retained so admin / maintenance code
-- running as the rawdrive_app role can still opt out when explicitly
-- setting app.bypass_rls = 'on'. Normal request paths set
-- app.workspace_id via middleware.PgDBContext.SetWorkspaceID, which was
-- separately fixed to use parameterized SQL in F-009 Part A (commit
-- 740394d, same audit).
--
-- NOT COVERED BY THIS MIGRATION — follow-up work:
--   burst_groups, download_events, duplicate_group_members,
--   gallery_analytics_daily, gallery_carts, stream_chats
-- These tables lack a direct workspace_id column; they inherit tenant
-- scoping through FK chains to their parents (burst_groups -> assets,
-- etc.). Correct RLS for these requires either (a) denormalizing
-- workspace_id onto the table or (b) writing a joined USING clause that
-- walks the FK to a parent whose workspace_id is checkable. Both are
-- larger changes than the audit F-009 scope allows this session and are
-- tracked in docs/superpowers/plans/2026-04-10-m16-p0-p1-hardening.md.
--
-- ALSO NOT COVERED (correctly):
--   roles — global reference table (id, name) with no workspace scope.
--
-- Every ALTER / CREATE is guarded with IF EXISTS / DROP ... IF EXISTS
-- for idempotency so the migration can be safely re-run.

-- ────────────────────────── ENABLE RLS ──────────────────────────

ALTER TABLE ai_search_queries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE desktop_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_keys             ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_banners             ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_design_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_allowlist_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage_configs   ENABLE ROW LEVEL SECURITY;

-- ────────────────────────── DROP EXISTING (idempotent re-run) ──────────────────────────

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

-- ────────────────────────── CREATE ISOLATION POLICIES ──────────────────────────

CREATE POLICY ai_search_queries_isolation ON ai_search_queries
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY api_keys_isolation ON api_keys
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY assets_isolation ON assets
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY desktop_sessions_isolation ON desktop_sessions
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY download_jobs_isolation ON download_jobs
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY encryption_keys_isolation ON encryption_keys
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY gallery_banners_isolation ON gallery_banners
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY gallery_design_templates_isolation ON gallery_design_templates
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY gallery_orders_isolation ON gallery_orders
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY gallery_products_isolation ON gallery_products
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY invitations_isolation ON invitations
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY moderation_items_isolation ON moderation_items
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY streams_isolation ON streams
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY subscriptions_isolation ON subscriptions
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY upload_allowlist_tokens_isolation ON upload_allowlist_tokens
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY video_assets_isolation ON video_assets
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY webhooks_isolation ON webhooks
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY workspace_storage_isolation ON workspace_storage
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE POLICY workspace_storage_configs_isolation ON workspace_storage_configs
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );
