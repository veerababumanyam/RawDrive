-- F-005 (audit 2026-04-10): platform_settings rows that contain secrets
-- must be encrypted at rest. Before this migration the `value` column stored
-- plaintext despite the documented "encrypted at rest" contract.
--
-- Envelope encryption lives in backend/internal/crypto/envelope.go. The
-- per-row DEK is wrapped under a long-lived KEK loaded from the
-- PLATFORM_SETTINGS_KEK env var. The repo writes the pair (encrypted_value,
-- dek_wrapped) for rows whose is_secret = true when an envelope is wired.
--
-- Transition strategy: the existing `value` column stays NULLABLE so legacy
-- rows keep working, and the repo reads encrypted_value first, falling back
-- to `value` when the encrypted pair is absent. A follow-up migration will
-- drop the plaintext `value` column once all is_secret=true rows have been
-- re-saved through the new path.

ALTER TABLE platform_settings
    ADD COLUMN IF NOT EXISTS encrypted_value BYTEA NULL,
    ADD COLUMN IF NOT EXISTS dek_wrapped     BYTEA NULL;

COMMENT ON COLUMN platform_settings.encrypted_value IS
    'AES-256-GCM ciphertext of the setting value produced by crypto.Envelope. Nullable for non-secret rows and for legacy secret rows that predate F-005 and have not yet been rewritten through the repo.';

COMMENT ON COLUMN platform_settings.dek_wrapped IS
    'Data Encryption Key wrapped under PLATFORM_SETTINGS_KEK via crypto.Envelope. Always populated when encrypted_value is populated.';
