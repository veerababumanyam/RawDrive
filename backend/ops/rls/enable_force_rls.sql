-- ════════════════════════════════════════════════════════════════════════
--  RLS BACKSTOP — FORCE ROW LEVEL SECURITY  (audit S2-G1, 2026-05-31)
-- ════════════════════════════════════════════════════════════════════════
--
--  ⚠️  THIS FILE IS **NOT** A NUMBERED MIGRATION AND IS **NOT** EMBEDDED.
--      It lives under backend/ops/rls/ on purpose so the production
--      Migrator (//go:embed migrations/*.sql in internal/database/database.go)
--      NEVER auto-applies it on deploy. It is applied MANUALLY by ops, and
--      ONLY after the staged-rollout preconditions in
--      docs/audits/2026-05-31-integration-audit/ADR-rls-backstop.md are met.
--
--  WHY GATED / WHY MANUAL:
--      FORCE ROW LEVEL SECURITY makes the table OWNER subject to RLS too
--      (owners normally BYPASS it). The instant this runs, EVERY query
--      against a forced table returns ZERO rows unless the per-connection
--      GUC app.workspace_id is set to the querying tenant's id ON THE SAME
--      CONNECTION that runs the query.
--
--      As of audit S2-G1 the application does NOT yet bind app.workspace_id
--      to the repo query connection (64 repositories hold *pgxpool.Pool
--      directly and each Query/Exec acquires an arbitrary pooled connection;
--      middleware.PgDBContext.SetWorkspaceID sets the GUC session-scoped on a
--      DIFFERENT pooled connection). Running this file BEFORE the
--      connection-scoping refactor + the rawdrive_app login role are in place
--      WILL CAUSE A TOTAL OUTAGE (all reads return zero rows).
--
--      Therefore this is the LAST step of the staged rollout, not a deploy
--      artifact. Apply it only after STAGING has proven every screen loads
--      for the right tenant and cross-tenant reads are denied.
--
--  PRECONDITIONS (see ADR for the full runbook):
--      1. A dedicated NOSUPERUSER, NOBYPASSRLS login role (rawdrive_app)
--         exists and owns NONE of the tenant tables. Migration 008 already
--         creates a NOLOGIN rawdrive_app role with table privileges; grant it
--         LOGIN + a password (or use it as a SET ROLE target) per the ADR.
--      2. DATABASE_URL points the application at that non-owner role
--         (or the app issues SET ROLE rawdrive_app per request).
--      3. app.workspace_id is reliably set per request ON THE QUERY
--         CONNECTION (the connection-scoping refactor — tx-scoped SET LOCAL
--         or a pool BeforeAcquire/AfterRelease reset). This is OUT OF SCOPE
--         for audit S2-G1 and tracked as follow-up.
--      4. RLS_ENFORCED=true is set in the app environment as the operator's
--         declared intent (the app does not branch on it today; it is a
--         human/ops signal + scaffold — see internal/config).
--
--  IDEMPOTENT: re-running is safe. FORCE is set per table; ENABLE was already
--  done by migrations 008 and 061.
--
--  ROLLBACK: backend/ops/rls/disable_force_rls.sql (drops FORCE only; leaves
--  ENABLE + policies intact). Combined with reverting DATABASE_URL back to the
--  owner role, this fully restores pre-backstop behavior.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- Tenant tables from migration 008 (original RLS coverage).
ALTER TABLE workspaces                  FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_members           FORCE ROW LEVEL SECURITY;
ALTER TABLE galleries                   FORCE ROW LEVEL SECURITY;

-- Tenant tables from migration 061 (F-009 Part B RLS extension).
ALTER TABLE ai_search_queries           FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys                    FORCE ROW LEVEL SECURITY;
ALTER TABLE assets                      FORCE ROW LEVEL SECURITY;
ALTER TABLE desktop_sessions            FORCE ROW LEVEL SECURITY;
ALTER TABLE download_jobs               FORCE ROW LEVEL SECURITY;
ALTER TABLE encryption_keys             FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_banners             FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_design_templates    FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_orders              FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_products            FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations                 FORCE ROW LEVEL SECURITY;
ALTER TABLE moderation_items            FORCE ROW LEVEL SECURITY;
ALTER TABLE streams                     FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions               FORCE ROW LEVEL SECURITY;
ALTER TABLE upload_allowlist_tokens     FORCE ROW LEVEL SECURITY;
ALTER TABLE video_assets                FORCE ROW LEVEL SECURITY;
ALTER TABLE webhooks                    FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage           FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage_configs   FORCE ROW LEVEL SECURITY;

COMMIT;

-- Verification (run after COMMIT; expect relforcerowsecurity = t for all):
--   SELECT relname, relrowsecurity, relforcerowsecurity
--     FROM pg_class
--    WHERE relname IN (
--      'workspaces','workspace_members','galleries','assets','api_keys',
--      'gallery_orders','subscriptions','workspace_storage',
--      'workspace_storage_configs','encryption_keys','webhooks')
--    ORDER BY relname;
