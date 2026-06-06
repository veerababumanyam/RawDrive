#!/usr/bin/env node

const apiBase = (
  process.env.RAWDRIVE_SMOKE_API_BASE || "https://api.rawdrive.in"
).replace(/\/+$/, "");
const authToken = process.env.RAWDRIVE_SMOKE_AUTH_TOKEN || "";
const galleryId = process.env.RAWDRIVE_SMOKE_GALLERY_ID || "";
const publicSlug = process.env.RAWDRIVE_SMOKE_PUBLIC_SLUG || "";
const webBase = (process.env.RAWDRIVE_SMOKE_WEB_BASE || "").replace(/\/+$/, "");
const requireDesignSlots =
  process.env.RAWDRIVE_SMOKE_REQUIRE_DESIGN_SLOTS === "1";

function usage() {
  return [
    "Cover Design read-only smoke",
    "",
    "Dashboard gallery check:",
    "  RAWDRIVE_SMOKE_AUTH_TOKEN=... RAWDRIVE_SMOKE_GALLERY_ID=... npm run smoke:cover-design",
    "",
    "Public gallery check:",
    "  RAWDRIVE_SMOKE_PUBLIC_SLUG=... npm run smoke:cover-design",
    "",
    "Optional:",
    "  RAWDRIVE_SMOKE_API_BASE=https://api.rawdrive.in",
    "  RAWDRIVE_SMOKE_WEB_BASE=https://rawdrive.in",
    "  RAWDRIVE_SMOKE_REQUIRE_DESIGN_SLOTS=1",
  ].join("\n");
}

async function readJson(path, headers = {}) {
  const res = await fetch(`${apiBase}${path}`, { headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON status=${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`${path} failed status=${res.status} body=${text.slice(0, 240)}`);
  }
  return body;
}

function asArray(body, label, { allowEnvelope = false } = {}) {
  if (Array.isArray(body)) return body;
  if (allowEnvelope && body && Array.isArray(body.data)) return body.data;
  throw new Error(`${label} must be a JSON array`);
}

function designSlotsFromSettings(settings) {
  const design = settings?.design_config;
  const cover = design?.cover;
  const slots = Array.isArray(cover?.assetSlots) ? cover.assetSlots : [];
  return slots.filter((id) => typeof id === "string" && id.length > 0);
}

function assertSlotsResolve(slots, assets, label) {
  if (slots.length === 0) {
    if (requireDesignSlots) {
      throw new Error(`${label} has no saved design_config.cover.assetSlots`);
    }
    console.warn(`${label}: no saved design slots found; asset-list smoke still passed`);
    return;
  }
  const assetIds = new Set(
    assets
      .map((row) => row?.asset?.id || row?.id || row?.asset_id)
      .filter((id) => typeof id === "string" && id.length > 0),
  );
  const missing = slots.filter((id) => !assetIds.has(id));
  if (missing.length > 0) {
    throw new Error(`${label} design slots reference assets not in gallery list: ${missing.join(", ")}`);
  }
}

function assertEmbeddedAssets(rows, label) {
  if (rows.length === 0) {
    throw new Error(`${label} returned no photos`);
  }
  const embeddedCount = rows.filter((row) => row?.asset && row.asset.id).length;
  if (embeddedCount === 0) {
    throw new Error(`${label} returned rows without embedded assets`);
  }
  const withThumbnail = rows.some((row) => {
    const thumbs = row?.asset?.thumbnail_urls || row?.thumbnail_urls || {};
    return Boolean(
      thumbs.thumb_lg_webp ||
        thumbs.thumb_md_webp ||
        thumbs.thumb_sm_webp ||
        thumbs.display_webp,
    );
  });
  if (!withThumbnail) {
    throw new Error(`${label} has embedded assets but no displayable thumbnails`);
  }
}

function assetUsesClientEncryption(asset) {
  return Boolean(
    asset?.is_encrypted ||
      asset?.media_encryption ||
      asset?.encryption_algo === "client-side-aes-256-gcm",
  );
}

function assertEncryptedPublicBytesHaveAssetToken(gallery, assets) {
  if (!assets.some(assetUsesClientEncryption)) return;
  const token = gallery?.settings?.asset_access_token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error(
      "public gallery has encrypted assets but no settings.asset_access_token for header-less storage byte loads",
    );
  }
}

async function assertRenderedPublicHtmlUsesBrowserStorageOrigin(slug) {
  if (!webBase) return;
  const res = await fetch(`${webBase}/g/${encodeURIComponent(slug)}`);
  const html = await res.text();
  if (!res.ok) {
    throw new Error(`public HTML smoke failed status=${res.status}`);
  }
  if (/https?:\/\/backend(?::\d+)?\/storage\//i.test(html)) {
    throw new Error("public HTML contains Docker-internal backend storage URLs");
  }
}

async function smokeDashboardGallery() {
  if (!authToken) {
    throw new Error("RAWDRIVE_SMOKE_AUTH_TOKEN is required with RAWDRIVE_SMOKE_GALLERY_ID");
  }
  const headers = { Authorization: `Bearer ${authToken}` };
  const rowsBody = await readJson(
    `/api/v1/galleries/${encodeURIComponent(galleryId)}/assets?include_assets=true`,
    headers,
  );
  const rows = asArray(rowsBody, "dashboard include_assets response");
  assertEmbeddedAssets(rows, "dashboard include_assets");

  const gallery = await readJson(
    `/api/v1/galleries/${encodeURIComponent(galleryId)}`,
    headers,
  );
  assertSlotsResolve(
    designSlotsFromSettings(gallery.settings),
    rows,
    "dashboard gallery",
  );
  console.log(
    `dashboard smoke ok: gallery=${galleryId} photos=${rows.length} embedded=${rows.filter((row) => row.asset).length}`,
  );
}

async function smokePublicGallery() {
  const gallery = await readJson(
    `/api/v1/public/galleries/${encodeURIComponent(publicSlug)}`,
  );
  const assetsBody = await readJson(
    `/api/v1/public/galleries/${encodeURIComponent(publicSlug)}/assets`,
  );
  const assets = asArray(assetsBody, "public assets response", {
    allowEnvelope: true,
  });
  if (assets.length === 0) {
    throw new Error(`public gallery ${publicSlug} returned no photos`);
  }
  assertSlotsResolve(
    designSlotsFromSettings(gallery.settings),
    assets,
    "public gallery",
  );
  assertEncryptedPublicBytesHaveAssetToken(gallery, assets);
  await assertRenderedPublicHtmlUsesBrowserStorageOrigin(publicSlug);
  console.log(`public smoke ok: slug=${publicSlug} photos=${assets.length}`);
}

if (!galleryId && !publicSlug) {
  console.error(usage());
  process.exit(2);
}

try {
  if (galleryId) await smokeDashboardGallery();
  if (publicSlug) await smokePublicGallery();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
