-- M35 / F-014: seed the streaming commercial-v1 feature flag row.
-- Runtime lookup: backend/internal/featureflag/streaming.go reads
-- platform_settings (category='featureflag', key='streaming.commercial_v1').
-- Default value 'false' keeps the new commercial surface dark until super-admin
-- flips it via /api/v1/admin/settings. Idempotent via ON CONFLICT DO NOTHING.

INSERT INTO platform_settings (category, key, value, is_secret, description)
VALUES (
    'featureflag',
    'streaming.commercial_v1',
    'false',
    false,
    'Master toggle for the F-014 commercial streaming surface (rate cards, credits, recharge, live UI). Off by default; flip to true to enable.'
)
ON CONFLICT (category, key) DO NOTHING;
