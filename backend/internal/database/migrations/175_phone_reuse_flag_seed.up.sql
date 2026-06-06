-- Migration 175: seed the phone-reuse enforcement feature flag (slice 6).
-- Runtime lookup: backend/internal/featureflag/phone_reuse.go reads
-- platform_settings (category='featureflag', key='phone_reuse.enforcement') and
-- expects a JSON value {"enabled": bool}.
--
-- Seeded DISABLED. Enforcement (paid_pending routing) must be turned on ONLY
-- after the slice-4 paid-signup payment funnel (HTTP handler + provisioner + JWT
-- refresh + frontend) has been runtime-verified — otherwise a paid_pending
-- account could be created with no payment path to complete it. Flip to
-- {"enabled": true} via /api/v1/admin/settings when the funnel is live.
-- Idempotent via ON CONFLICT DO NOTHING.
--
-- Numbered 175: follows 171-174 in this epic; verified next free above
-- origin/main's 170.

INSERT INTO platform_settings (category, key, value, is_secret, description)
VALUES (
    'featureflag',
    'phone_reuse.enforcement',
    '{"enabled":false}',
    false,
    'Phone-reuse enforcement: when enabled, a paid-intent signup on an already-used phone is routed to a paid_pending account that must pay before getting a workspace. Off by default — enable ONLY after the paid-signup payment funnel is runtime-verified.'
)
ON CONFLICT (category, key) DO NOTHING;
