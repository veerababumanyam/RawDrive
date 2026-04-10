-- M14 GAL-FR-157: gallery sale banners (promotional messages).
--
-- Banners are lightweight promotional messages that appear on a
-- gallery's public view to highlight a sale, coupon code, or
-- time-limited offer. Scheduled via active_from/active_until so
-- studios can prepare a campaign ahead of time and have it appear
-- automatically at launch. Coupon integration is loose: banners
-- carry an optional coupon_code string that the frontend can paste
-- into the cart on a CTA click.

CREATE TABLE IF NOT EXISTS gallery_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    cta_label TEXT,
    cta_url TEXT,
    coupon_code TEXT,
    background_color TEXT,
    text_color TEXT,
    active_from TIMESTAMPTZ,
    active_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup of currently-live banners per gallery for the public
-- gallery page render.
CREATE INDEX IF NOT EXISTS idx_gallery_banners_gallery_active
    ON gallery_banners(gallery_id)
    WHERE is_active = true;

-- Scheduled-banner scan: pick banners whose active_from has passed
-- but active_until is still in the future.
CREATE INDEX IF NOT EXISTS idx_gallery_banners_schedule
    ON gallery_banners(active_from, active_until)
    WHERE is_active = true;
