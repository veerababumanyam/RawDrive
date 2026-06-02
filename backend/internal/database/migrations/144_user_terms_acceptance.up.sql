-- Migration 144: photographer Terms-of-Service / copyright acceptance capture
-- Captures a photographer's one-time acceptance of the Terms of Service +
-- Privacy Policy (the copyright/IP, rights-warranty, and indemnification
-- clauses) with a full audit trail — timestamp, version, SHA-256 of the exact
-- text shown, IP, and user-agent — to satisfy IT Act 2000 §10A (electronic /
-- clickwrap contract validity) and DPDP Act 2023 record-keeping.
--
--  * terms_versions          — immutable version catalog (mirrors
--                              upload_policy_versions, migration 054). One active
--                              (non-revoked) row at a time. The active version is
--                              what acceptance is recorded against; publishing a
--                              new version re-prompts everyone on their next upload.
--  * user_terms_acceptances  — append-only acceptance ledger (mirrors
--                              consent_records + audit_logs immutability). user_id
--                              carries NO foreign key on purpose, exactly like
--                              audit_logs.actor_id: the acceptance proof must
--                              survive account deletion (legal-obligation
--                              retention), so we never cascade it away.
--  * users.terms_accepted_*  — denormalized fast-path columns so the upload gate
--                              and /auth/me are O(1) lookups. The ledger above
--                              remains the authoritative legal record.
--
-- Reference: docs plan "Photographer Terms / Copyright Acceptance".

BEGIN;

-- pgcrypto (already installed in 006) provides digest() so the seed hash is
-- computed in-DB and can never drift from terms_text.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1. Immutable terms version catalog
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terms_versions (
    version        TEXT PRIMARY KEY,
    document_types TEXT[] NOT NULL DEFAULT '{terms_of_service,privacy_policy}',
    terms_text     TEXT NOT NULL,
    text_sha256    TEXT NOT NULL,
    effective_at   TIMESTAMPTZ NOT NULL,
    published_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at     TIMESTAMPTZ NULL,
    notes          TEXT NULL
);

-- The validator hot path only cares about the single active version.
CREATE INDEX IF NOT EXISTS idx_terms_versions_active
    ON terms_versions (published_at DESC)
    WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Append-only acceptance ledger (legal source of truth)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_terms_acceptances (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NO foreign key on user_id (deliberate): mirrors audit_logs.actor_id so the
    -- acceptance proof is retained even after the user/account is deleted.
    user_id           UUID NOT NULL,
    terms_version     TEXT NOT NULL REFERENCES terms_versions(version),
    version_hash      TEXT NOT NULL,
    accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address        TEXT,
    user_agent        TEXT,
    acceptance_method TEXT NOT NULL
        CHECK (acceptance_method IN
            ('registration', 'first_upload', 'oauth_signup', 're_acceptance', 'admin_backfill')),
    legal_basis       TEXT NOT NULL DEFAULT 'contract',
    document_types    TEXT[] NOT NULL DEFAULT '{terms_of_service,privacy_policy}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_terms_acceptances_user
    ON user_terms_acceptances (user_id, accepted_at DESC);

-- Immutability: append-only, mirroring the audit_logs rules in migration 034.
CREATE OR REPLACE RULE user_terms_acceptances_no_update
    AS ON UPDATE TO user_terms_acceptances DO INSTEAD NOTHING;
CREATE OR REPLACE RULE user_terms_acceptances_no_delete
    AS ON DELETE TO user_terms_acceptances DO INSTEAD NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Denormalized fast-path on users (cache; ledger is authoritative)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS terms_accepted_version TEXT;
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN users.terms_accepted_version IS
    'Denormalized cache of the latest terms_versions.version this user accepted. NULL = never accepted (will be prompted on first upload). Authoritative record lives in user_terms_acceptances.';

-- ─────────────────────────────────────────────────────────────
-- 4. Seed the initial active version. text_sha256 is computed in-DB from
--    terms_text via pgcrypto so it is guaranteed consistent. Existing users
--    are intentionally NOT back-filled — fabricating consent would be
--    legally improper; they accept on their next upload.
-- ─────────────────────────────────────────────────────────────
INSERT INTO terms_versions (version, terms_text, text_sha256, effective_at, published_at, notes)
VALUES (
    'tos-privacy/2026-04',
    E'RawDrive — Terms of Service & Privacy Policy Acceptance (version 2026-04)\n\n'
    'By accepting, you confirm you have read and agree to the RawDrive Terms of Service and Privacy Policy, including in particular:\n\n'
    '1. Intellectual Property & Content Ownership. You retain all rights to the photographs, audio, and other content you upload. By uploading you grant RawDrive only a limited licence to store, process, and display your content for the purpose of providing the service. RawDrive does not claim ownership of your work.\n\n'
    '2. Rights Warranty. You represent and warrant that you own, or are licensed to use, all content you upload — including photographs, background music, and any third-party material — and that uploading it and delivering it to your clients does not infringe any copyright, trademark, privacy, publicity, or other right of any person.\n\n'
    '3. Acceptable Use. You will not upload unlawful, defamatory, or infringing content, and you accept that RawDrive may remove content or suspend accounts that violate these terms.\n\n'
    '4. AI Features Disclaimer. AI culling and tagging produce suggestions only; you remain responsible for reviewing results and keeping your own backups.\n\n'
    '5. Indemnification. You agree to indemnify RawDrive against any claim arising from your content or your breach of these terms, including any third-party infringement claim.\n\n'
    '6. Governing Law. This agreement is governed by the laws of India, with exclusive jurisdiction in the courts of Bengaluru, Karnataka.\n\n'
    'Full text: https://rawdrive.in/terms and https://rawdrive.in/privacy',
    encode(digest(
        E'RawDrive — Terms of Service & Privacy Policy Acceptance (version 2026-04)\n\n'
        'By accepting, you confirm you have read and agree to the RawDrive Terms of Service and Privacy Policy, including in particular:\n\n'
        '1. Intellectual Property & Content Ownership. You retain all rights to the photographs, audio, and other content you upload. By uploading you grant RawDrive only a limited licence to store, process, and display your content for the purpose of providing the service. RawDrive does not claim ownership of your work.\n\n'
        '2. Rights Warranty. You represent and warrant that you own, or are licensed to use, all content you upload — including photographs, background music, and any third-party material — and that uploading it and delivering it to your clients does not infringe any copyright, trademark, privacy, publicity, or other right of any person.\n\n'
        '3. Acceptable Use. You will not upload unlawful, defamatory, or infringing content, and you accept that RawDrive may remove content or suspend accounts that violate these terms.\n\n'
        '4. AI Features Disclaimer. AI culling and tagging produce suggestions only; you remain responsible for reviewing results and keeping your own backups.\n\n'
        '5. Indemnification. You agree to indemnify RawDrive against any claim arising from your content or your breach of these terms, including any third-party infringement claim.\n\n'
        '6. Governing Law. This agreement is governed by the laws of India, with exclusive jurisdiction in the courts of Bengaluru, Karnataka.\n\n'
        'Full text: https://rawdrive.in/terms and https://rawdrive.in/privacy',
        'sha256'), 'hex'),
    TIMESTAMPTZ '2026-04-01 00:00:00+00',
    TIMESTAMPTZ '2026-04-01 00:00:00+00',
    'Initial photographer ToS + Privacy acceptance version. Operative clauses mirror frontend/src/app/terms/page.tsx §6/§7/§9/§11.'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
