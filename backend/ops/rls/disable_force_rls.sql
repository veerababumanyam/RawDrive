-- ════════════════════════════════════════════════════════════════════════
--  RLS BACKSTOP — ROLLBACK: DROP FORCE ROW LEVEL SECURITY  (audit S2-G1)
-- ════════════════════════════════════════════════════════════════════════
--
--  Reverses backend/ops/rls/enable_force_rls.sql. This restores the OWNER's
--  RLS bypass: with NO FORCE, a table-owner role (and any BYPASSRLS role)
--  ignores the isolation policies again — i.e. it returns to the pre-backstop
--  behavior where DB-level isolation is INERT and the application layer is the
--  sole control.
--
--  It does NOT disable ROW LEVEL SECURITY and does NOT drop the isolation
--  policies (those were created by migrations 008 / 061 and are managed by the
--  migration system, not by this ops file). Leaving ENABLE + policies in place
--  is intentional: it keeps the non-owner (rawdrive_app) enforcement path
--  working and means re-enabling the backstop is just re-running enable.
--
--  FULL ROLLBACK of the staged rollout = run this file AND revert DATABASE_URL
--  back to the table-owner role. Either step alone restores availability:
--    - dropping FORCE makes the owner role bypass RLS again, OR
--    - pointing DATABASE_URL back at the owner role bypasses RLS regardless
--      of FORCE (owner bypass only applies when NOT forced — so for a true
--      belt-and-suspenders rollback during an incident, do BOTH).
--
--  IDEMPOTENT: re-running is safe.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE workspaces                  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_members           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE galleries                   NO FORCE ROW LEVEL SECURITY;

ALTER TABLE ai_search_queries           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys                    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE assets                      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE desktop_sessions            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE download_jobs               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE encryption_keys             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_banners             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_design_templates    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_orders              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_products            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE moderation_items            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE streams                     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE upload_allowlist_tokens     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE video_assets                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE webhooks                    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage           NO FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_storage_configs   NO FORCE ROW LEVEL SECURITY;

COMMIT;
