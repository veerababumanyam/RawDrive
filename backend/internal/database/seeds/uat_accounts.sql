-- UAT Test Accounts Seed Script
-- Password for all accounts: UatPho@2026
-- Run: psql $DATABASE_URL -f uat_accounts.sql
-- Safe to re-run: upserts users, creates workspaces/dealers only if absent.

BEGIN;

DO $$
DECLARE
  pw_hash TEXT := '$2a$12$VFFZ9FHyBfRUwrBr9d2cvOdBnrM8F24FKfX84kPZYg/O3jtE0Yzg2';

  -- State IDs (migration 010_seed_states, alphabetical order)
  state_tg INT := 24;  -- Telangana
  state_ka INT := 11;  -- Karnataka
  state_mh INT := 14;  -- Maharashtra

  owner_role_id  INT := 1;  -- roles.id = 1 = 'Owner'
  admin_role_id  INT := 2;  -- roles.id = 2 = 'Admin'
  editor_role_id INT := 3;  -- roles.id = 3 = 'Editor'
  viewer_role_id INT := 4;  -- roles.id = 4 = 'Viewer'

  -- Resolved user IDs (populated by SELECT after each INSERT ... RETURNING)
  uid_superadmin   UUID;
  uid_super        UUID;
  uid_admin        UUID;
  uid_mod          UUID;
  uid_ops          UUID;
  uid_pho_pro      UUID;
  uid_pho_starter  UUID;
  uid_pho_biz      UUID;
  uid_pho_trial    UUID;
  uid_pho_hold     UUID;
  uid_team_lead    UUID;
  uid_team_editor  UUID;
  uid_team_viewer  UUID;
  uid_photographer UUID;
  uid_uat_new      UUID;
  uid_dealer_tg    UUID;
  uid_dealer_mh    UUID;
  uid_dealer       UUID;
  uid_client_wed   UUID;

  -- Workspace IDs (stable per user)
  wid_pho_pro      UUID;
  wid_pho_starter  UUID;
  wid_pho_biz      UUID;
  wid_pho_trial    UUID;
  wid_pho_hold     UUID;
  wid_photographer UUID;
  wid_uat_new      UUID;

BEGIN

  -- Helper: upsert a user and return its actual ID.
  -- ON CONFLICT (email) keeps existing UUID, updates credentials.

  -- ── Super Admins ────────────────────────────────────────────────────
  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('superadmin@rawdrive.test', pw_hash, 'Super Admin', NULL, 'super_admin', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_superadmin;
  IF uid_superadmin IS NULL THEN
    SELECT id INTO uid_superadmin FROM users WHERE email = 'superadmin@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('super@rawdrive.test', pw_hash, 'Super Admin', state_tg, 'super_admin', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_super;
  IF uid_super IS NULL THEN
    SELECT id INTO uid_super FROM users WHERE email = 'super@rawdrive.test';
  END IF;

  -- ── Platform Admins ─────────────────────────────────────────────────
  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('admin@rawdrive.test', pw_hash, 'Platform Admin', NULL, 'admin', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_admin;
  IF uid_admin IS NULL THEN
    SELECT id INTO uid_admin FROM users WHERE email = 'admin@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('mod@rawdrive.test', pw_hash, 'Admin Mod', state_tg, 'admin', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_mod;
  IF uid_mod IS NULL THEN
    SELECT id INTO uid_mod FROM users WHERE email = 'mod@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('ops@rawdrive.test', pw_hash, 'Admin Ops', state_tg, 'admin', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_ops;
  IF uid_ops IS NULL THEN
    SELECT id INTO uid_ops FROM users WHERE email = 'ops@rawdrive.test';
  END IF;

  -- ── Photographers ────────────────────────────────────────────────────
  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('pho.pro@rawdrive.test', pw_hash, 'Pho Pro', state_ka, 'photographer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_pho_pro;
  IF uid_pho_pro IS NULL THEN
    SELECT id INTO uid_pho_pro FROM users WHERE email = 'pho.pro@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('pho.starter@rawdrive.test', pw_hash, 'Pho Starter', state_ka, 'photographer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_pho_starter;
  IF uid_pho_starter IS NULL THEN
    SELECT id INTO uid_pho_starter FROM users WHERE email = 'pho.starter@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('pho.biz@rawdrive.test', pw_hash, 'Pho Business', state_ka, 'photographer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_pho_biz;
  IF uid_pho_biz IS NULL THEN
    SELECT id INTO uid_pho_biz FROM users WHERE email = 'pho.biz@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('pho.trial@rawdrive.test', pw_hash, 'Pho Trial', state_ka, 'photographer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_pho_trial;
  IF uid_pho_trial IS NULL THEN
    SELECT id INTO uid_pho_trial FROM users WHERE email = 'pho.trial@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('pho.hold@rawdrive.test', pw_hash, 'Pho Hold', state_ka, 'photographer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_pho_hold;
  IF uid_pho_hold IS NULL THEN
    SELECT id INTO uid_pho_hold FROM users WHERE email = 'pho.hold@rawdrive.test';
  END IF;

  -- ── Team members ────────────────────────────────────────────────────
  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('team.lead@rawdrive.test', pw_hash, 'Team Lead', state_ka, 'team_member', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_team_lead;
  IF uid_team_lead IS NULL THEN
    SELECT id INTO uid_team_lead FROM users WHERE email = 'team.lead@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('team.editor@rawdrive.test', pw_hash, 'Team Editor', state_ka, 'team_member', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_team_editor;
  IF uid_team_editor IS NULL THEN
    SELECT id INTO uid_team_editor FROM users WHERE email = 'team.editor@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('team.viewer@rawdrive.test', pw_hash, 'Team Viewer', state_ka, 'team_member', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_team_viewer;
  IF uid_team_viewer IS NULL THEN
    SELECT id INTO uid_team_viewer FROM users WHERE email = 'team.viewer@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('photographer@rawdrive.test', pw_hash, 'Test Photographer', NULL, 'photographer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_photographer;
  IF uid_photographer IS NULL THEN
    SELECT id INTO uid_photographer FROM users WHERE email = 'photographer@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('uat.new.pho.002@rawdrive.test', pw_hash, NULL, NULL, 'photographer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_uat_new;
  IF uid_uat_new IS NULL THEN
    SELECT id INTO uid_uat_new FROM users WHERE email = 'uat.new.pho.002@rawdrive.test';
  END IF;

  -- ── Dealers ──────────────────────────────────────────────────────────
  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('dealer.tg@rawdrive.test', pw_hash, 'Dealer Telangana', state_tg, 'dealer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_dealer_tg;
  IF uid_dealer_tg IS NULL THEN
    SELECT id INTO uid_dealer_tg FROM users WHERE email = 'dealer.tg@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('dealer.mh@rawdrive.test', pw_hash, 'Dealer Maharashtra', state_mh, 'dealer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_dealer_mh;
  IF uid_dealer_mh IS NULL THEN
    SELECT id INTO uid_dealer_mh FROM users WHERE email = 'dealer.mh@rawdrive.test';
  END IF;

  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('dealer@rawdrive.test', pw_hash, 'Test Dealer', NULL, 'dealer', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_dealer;
  IF uid_dealer IS NULL THEN
    SELECT id INTO uid_dealer FROM users WHERE email = 'dealer@rawdrive.test';
  END IF;

  -- ── Clients ─────────────────────────────────────────────────────────
  INSERT INTO users (email, password_hash, display_name, state_id, platform_role, email_verified)
  VALUES ('client.wed@rawdrive.test', pw_hash, 'Wedding Client', state_ka, 'client', true)
  ON CONFLICT (email) DO UPDATE SET
    password_hash  = EXCLUDED.password_hash,
    display_name   = EXCLUDED.display_name,
    state_id       = EXCLUDED.state_id,
    platform_role  = EXCLUDED.platform_role,
    email_verified = true,
    status         = 'active'
  RETURNING id INTO uid_client_wed;
  IF uid_client_wed IS NULL THEN
    SELECT id INTO uid_client_wed FROM users WHERE email = 'client.wed@rawdrive.test';
  END IF;

  -- ── Workspaces for Photographers (create if none exists for the user) ─
  SELECT w.id INTO wid_pho_pro FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = uid_pho_pro LIMIT 1;
  IF wid_pho_pro IS NULL THEN
    INSERT INTO workspaces (name, state_id, owner_id, plan_tier, status)
    VALUES ('Pho Pro Studio', state_ka, uid_pho_pro, 'professional', 'active')
    RETURNING id INTO wid_pho_pro;
    INSERT INTO workspace_members (workspace_id, user_id, role_id)
    VALUES (wid_pho_pro, uid_pho_pro, owner_role_id);
  ELSE
    UPDATE workspaces SET plan_tier = 'professional', status = 'active' WHERE id = wid_pho_pro;
  END IF;

  SELECT w.id INTO wid_pho_starter FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = uid_pho_starter LIMIT 1;
  IF wid_pho_starter IS NULL THEN
    INSERT INTO workspaces (name, state_id, owner_id, plan_tier, status)
    VALUES ('Pho Starter Studio', state_ka, uid_pho_starter, 'starter', 'active')
    RETURNING id INTO wid_pho_starter;
    INSERT INTO workspace_members (workspace_id, user_id, role_id)
    VALUES (wid_pho_starter, uid_pho_starter, owner_role_id);
  ELSE
    UPDATE workspaces SET plan_tier = 'starter', status = 'active' WHERE id = wid_pho_starter;
  END IF;

  SELECT w.id INTO wid_pho_biz FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = uid_pho_biz LIMIT 1;
  IF wid_pho_biz IS NULL THEN
    INSERT INTO workspaces (name, state_id, owner_id, plan_tier, status)
    VALUES ('Pho Business Studio', state_ka, uid_pho_biz, 'business', 'active')
    RETURNING id INTO wid_pho_biz;
    INSERT INTO workspace_members (workspace_id, user_id, role_id)
    VALUES (wid_pho_biz, uid_pho_biz, owner_role_id);
  ELSE
    UPDATE workspaces SET plan_tier = 'business', status = 'active' WHERE id = wid_pho_biz;
  END IF;

  SELECT w.id INTO wid_pho_trial FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = uid_pho_trial LIMIT 1;
  IF wid_pho_trial IS NULL THEN
    INSERT INTO workspaces (name, state_id, owner_id, plan_tier, status)
    VALUES ('Pho Trial Studio', state_ka, uid_pho_trial, 'free', 'active')
    RETURNING id INTO wid_pho_trial;
    INSERT INTO workspace_members (workspace_id, user_id, role_id)
    VALUES (wid_pho_trial, uid_pho_trial, owner_role_id);
  ELSE
    UPDATE workspaces SET plan_tier = 'free', status = 'active' WHERE id = wid_pho_trial;
  END IF;

  -- pho.hold: workspace is suspended (account on hold)
  SELECT w.id INTO wid_pho_hold FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = uid_pho_hold LIMIT 1;
  IF wid_pho_hold IS NULL THEN
    INSERT INTO workspaces (name, state_id, owner_id, plan_tier, status)
    VALUES ('Pho Hold Studio', state_ka, uid_pho_hold, 'free', 'suspended')
    RETURNING id INTO wid_pho_hold;
    INSERT INTO workspace_members (workspace_id, user_id, role_id)
    VALUES (wid_pho_hold, uid_pho_hold, owner_role_id);
  ELSE
    UPDATE workspaces SET plan_tier = 'free', status = 'suspended' WHERE id = wid_pho_hold;
  END IF;

  SELECT w.id INTO wid_photographer FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = uid_photographer LIMIT 1;
  IF wid_photographer IS NULL THEN
    INSERT INTO workspaces (name, state_id, owner_id, plan_tier, status)
    VALUES ('Test Photographer Studio', NULL, uid_photographer, 'free', 'active')
    RETURNING id INTO wid_photographer;
    INSERT INTO workspace_members (workspace_id, user_id, role_id)
    VALUES (wid_photographer, uid_photographer, owner_role_id);
  END IF;

  SELECT w.id INTO wid_uat_new FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id WHERE wm.user_id = uid_uat_new LIMIT 1;
  IF wid_uat_new IS NULL THEN
    INSERT INTO workspaces (name, state_id, owner_id, plan_tier, status)
    VALUES ('UAT Photographer Studio', NULL, uid_uat_new, 'free', 'active')
    RETURNING id INTO wid_uat_new;
    INSERT INTO workspace_members (workspace_id, user_id, role_id)
    VALUES (wid_uat_new, uid_uat_new, owner_role_id);
  END IF;

  -- ── Team memberships on the Business workspace ──────────────────────
  -- Keep joined_at earlier than any legacy personal "Team Lead Studio"
  -- membership so auth lookup resolves the business workspace first.
  IF wid_pho_biz IS NOT NULL THEN
    INSERT INTO workspace_members (workspace_id, user_id, role_id, joined_at)
    SELECT wid_pho_biz, uid_team_lead, admin_role_id, TIMESTAMPTZ '2000-01-01 00:00:00+00'
    WHERE NOT EXISTS (
      SELECT 1 FROM workspace_members WHERE workspace_id = wid_pho_biz AND user_id = uid_team_lead
    );
    UPDATE workspace_members
       SET role_id = admin_role_id,
           joined_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
     WHERE workspace_id = wid_pho_biz AND user_id = uid_team_lead;

    INSERT INTO workspace_members (workspace_id, user_id, role_id, joined_at)
    SELECT wid_pho_biz, uid_team_editor, editor_role_id, TIMESTAMPTZ '2000-01-02 00:00:00+00'
    WHERE NOT EXISTS (
      SELECT 1 FROM workspace_members WHERE workspace_id = wid_pho_biz AND user_id = uid_team_editor
    );
    UPDATE workspace_members
       SET role_id = editor_role_id,
           joined_at = TIMESTAMPTZ '2000-01-02 00:00:00+00'
     WHERE workspace_id = wid_pho_biz AND user_id = uid_team_editor;

    INSERT INTO workspace_members (workspace_id, user_id, role_id, joined_at)
    SELECT wid_pho_biz, uid_team_viewer, viewer_role_id, TIMESTAMPTZ '2000-01-03 00:00:00+00'
    WHERE NOT EXISTS (
      SELECT 1 FROM workspace_members WHERE workspace_id = wid_pho_biz AND user_id = uid_team_viewer
    );
    UPDATE workspace_members
       SET role_id = viewer_role_id,
           joined_at = TIMESTAMPTZ '2000-01-03 00:00:00+00'
     WHERE workspace_id = wid_pho_biz AND user_id = uid_team_viewer;
  END IF;

  -- ── Onboarding status = complete for all photographers ───────────────
  INSERT INTO onboarding_statuses (user_id, current_step)
  VALUES
    (uid_pho_pro,      'complete'),
    (uid_pho_starter,  'complete'),
    (uid_pho_biz,      'complete'),
    (uid_pho_trial,    'complete'),
    (uid_pho_hold,     'complete'),
    (uid_photographer, 'complete'),
    (uid_uat_new,      'complete')
  ON CONFLICT (user_id) DO UPDATE SET current_step = 'complete';

  -- ── Dealer Records ────────────────────────────────────────────────────
  -- dealer.tg: Approved, has referral code DLTG2026. Migration 106 removed the
  -- old dealers(user_id) unique index to allow multiple dealerships per user,
  -- so these UAT rows are made idempotent with explicit update-then-insert
  -- checks instead of ON CONFLICT (user_id).
  UPDATE dealers
     SET user_id       = uid_dealer_tg,
         state_id      = state_tg,
         business_name = 'Dealer Telangana Agency',
         pan_number    = 'AABPD1234C',
         status        = 'approved',
         approved_at   = COALESCE(approved_at, NOW())
   WHERE referral_code = 'DLTG2026';
  IF NOT FOUND THEN
    INSERT INTO dealers (user_id, state_id, business_name, pan_number, status, referral_code, approved_at)
    VALUES (uid_dealer_tg, state_tg, 'Dealer Telangana Agency', 'AABPD1234C', 'approved', 'DLTG2026', NOW());
  END IF;

  -- dealer.mh: Approved
  UPDATE dealers
     SET state_id      = state_mh,
         pan_number    = 'AABPD5678D',
         status        = 'approved',
         approved_at   = COALESCE(approved_at, NOW())
   WHERE user_id = uid_dealer_mh
     AND business_name = 'Dealer Maharashtra Agency';
  IF NOT FOUND THEN
    INSERT INTO dealers (user_id, state_id, business_name, pan_number, status, approved_at)
    VALUES (uid_dealer_mh, state_mh, 'Dealer Maharashtra Agency', 'AABPD5678D', 'approved', NOW());
  END IF;

  -- dealer: Pending test dealer (fallback state = Karnataka)
  UPDATE dealers
     SET state_id   = state_ka,
         pan_number = 'AABPD9012E',
         status     = 'pending'
   WHERE user_id = uid_dealer
     AND business_name = 'Test Dealer Agency';
  IF NOT FOUND THEN
    INSERT INTO dealers (user_id, state_id, business_name, pan_number, status)
    VALUES (uid_dealer, state_ka, 'Test Dealer Agency', 'AABPD9012E', 'pending');
  END IF;

  UPDATE users
  SET must_change_password = false
  WHERE email IN (
    'superadmin@rawdrive.test',
    'super@rawdrive.test',
    'admin@rawdrive.test',
    'mod@rawdrive.test',
    'ops@rawdrive.test',
    'pho.pro@rawdrive.test',
    'pho.starter@rawdrive.test',
    'pho.biz@rawdrive.test',
    'pho.trial@rawdrive.test',
    'pho.hold@rawdrive.test',
    'team.lead@rawdrive.test',
    'team.editor@rawdrive.test',
    'team.viewer@rawdrive.test',
    'photographer@rawdrive.test',
    'uat.new.pho.002@rawdrive.test',
    'dealer.tg@rawdrive.test',
    'dealer.mh@rawdrive.test',
    'dealer@rawdrive.test',
    'client.wed@rawdrive.test'
  );

  RAISE NOTICE '✓ Super Admins  : superadmin@rawdrive.test, super@rawdrive.test';
  RAISE NOTICE '✓ Admins        : admin@rawdrive.test, mod@rawdrive.test, ops@rawdrive.test';
  RAISE NOTICE '✓ Photographers : pho.pro, pho.starter, pho.biz, pho.trial, pho.hold, photographer, uat.new.pho.002 (@rawdrive.test)';
  RAISE NOTICE '✓ Team members  : team.lead, team.editor, team.viewer (@rawdrive.test)';
  RAISE NOTICE '✓ Dealers       : dealer.tg (DLTG2026), dealer.mh, dealer (@rawdrive.test)';
  RAISE NOTICE '✓ Clients       : client.wed@rawdrive.test';
  RAISE NOTICE '✓ Password for all: UatPho@2026';

  -- M41 FR-UCRT-09: seed 500 grant_admin upload credits for each pho_* UAT
  -- workspace so meter-on UAT runs don't 400 INSUFFICIENT_CREDITS on first
  -- chunked upload. Deterministic idempotency_key per workspace
  -- (uat-seed:upload-credits:v1:{workspace-uuid}) so re-running the seed is
  -- a no-op — the unique index on (workspace_id, idempotency_key) rejects
  -- duplicates and the ON CONFLICT DO NOTHING below keeps it silent.
  INSERT INTO upload_ledger_entries (
    workspace_id, entry_type, amount_credits, idempotency_key, reason
  )
  SELECT ws_id, 'grant_admin', 500,
         'uat-seed:upload-credits:v1:' || ws_id::text,
         'UAT seed grant (M41 FR-UCRT-09)'
    FROM (VALUES
      (wid_pho_pro),
      (wid_pho_starter),
      (wid_pho_biz),
      (wid_pho_trial),
      (wid_pho_hold)
    ) AS t(ws_id)
   WHERE ws_id IS NOT NULL
  ON CONFLICT (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  -- Rebuild the read-side rollup for seeded workspaces. Older versions of this
  -- seed disabled triggers, so this keeps existing local databases correct even
  -- when the ledger rows already exist and the idempotent insert above no-ops.
  INSERT INTO upload_credit_balance_rollup (
    workspace_id,
    total_credits,
    plan_granted,
    purchased,
    reserved,
    consumed,
    refunded,
    last_entry_at,
    updated_at
  )
  SELECT
    le.workspace_id,
    COALESCE(SUM(le.amount_credits), 0),
    COALESCE(SUM(CASE WHEN le.entry_type IN ('grant_monthly', 'grant_admin') THEN le.amount_credits ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN le.entry_type = 'purchase' THEN le.amount_credits ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN le.entry_type = 'reserve' THEN -le.amount_credits ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN le.entry_type = 'consume' THEN le.amount_credits ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN le.entry_type = 'refund' THEN le.amount_credits ELSE 0 END), 0),
    MAX(le.created_at),
    NOW()
  FROM upload_ledger_entries le
  WHERE le.workspace_id IN (
    wid_pho_pro,
    wid_pho_starter,
    wid_pho_biz,
    wid_pho_trial,
    wid_pho_hold
  )
  GROUP BY le.workspace_id
  ON CONFLICT (workspace_id) DO UPDATE SET
    total_credits = EXCLUDED.total_credits,
    plan_granted  = EXCLUDED.plan_granted,
    purchased     = EXCLUDED.purchased,
    reserved      = EXCLUDED.reserved,
    consumed      = EXCLUDED.consumed,
    refunded      = EXCLUDED.refunded,
    last_entry_at = EXCLUDED.last_entry_at,
    updated_at    = NOW();

  RAISE NOTICE '✓ Upload credits: 500 grant_admin per pho_* workspace (idempotent)';

END $$;

COMMIT;
