// @ts-check
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API_BASE = "http://localhost:8080";
const GALLERY_ID = "gallery-e2ee";
const ASSET_ID = "asset-e2ee";
const SECOND_ASSET_ID = "asset-e2ee-second";
const ACCESS_TOKEN = makeJwt({
  sub: "user-e2ee",
  workspace_id: "workspace-e2ee",
  platform_role: "photographer",
});

test.describe("E2EE media upload", () => {
  test.use({ serviceWorkers: "block" });

  test("encrypts original and WebP derivatives, stores metadata, and decrypts gallery/lightbox images", async ({ page }) => {
    const photoPath = findPhotoFixture();
    const photoBytes = fs.readFileSync(photoPath);
    const photoName = path.basename(photoPath);

    /** @type {Record<string, any> | null} */
    let createSessionPayload = null;
    /** @type {Buffer[]} */
    const originalChunks = [];
    /** @type {Record<string, any>} */
    const derivativeManifests = {};
    /** @type {Map<string, Buffer>} */
    const derivativeCiphertexts = new Map();
    /** @type {string[]} */
    const storageKeys = [];
    let linkedToGallery = false;

    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const pathname = url.pathname;

      if (method === "POST" && pathname === "/auth/refresh") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: ACCESS_TOKEN }) });
        return;
      }
      if (method === "GET" && pathname === "/api/v1/auth/me") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            display_name: "E2EE Tester",
            email: "e2ee@example.test",
            plan_tier: "enterprise",
            must_change_password: false,
          }),
        });
        return;
      }
      if (method === "GET" && pathname === "/api/v1/workspaces/current/profile") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            name: "E2EE Studio",
            business_profile_slug: "e2ee-studio",
            business_unique_code: "abc12345",
          }),
        });
        return;
      }
      if (method === "GET" && pathname === "/api/v1/upload-policy/versions") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            versions: [{
              policy_version: "upload-screening/2026-04-10",
              published_at: "2026-04-10T00:00:00Z",
              max_age_days: 365,
            }],
          }),
        });
        return;
      }
      if (method === "GET" && pathname === `/api/v1/galleries/${GALLERY_ID}`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(gallery()) });
        return;
      }
      if (method === "GET" && pathname === `/api/v1/galleries/${GALLERY_ID}/assets`) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            assets: linkedToGallery
              ? [
                  galleryAsset({ assetId: ASSET_ID, sortOrder: 0 }),
                  galleryAsset({ assetId: SECOND_ASSET_ID, sortOrder: 1 }),
                ]
              : [],
          }),
        });
        return;
      }
      if (method === "GET" && pathname === `/api/v1/galleries/${GALLERY_ID}/proofing`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ selections: [] }) });
        return;
      }
      if (method === "GET" && pathname === `/api/v1/galleries/${GALLERY_ID}/favorites`) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ gallery_id: GALLERY_ID, total_favorites: 0, unique_assets_count: 0, unique_sessions: 0, by_asset: [] }),
        });
        return;
      }
      if (method === "GET" && pathname === `/api/v1/galleries/${GALLERY_ID}/albums`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        return;
      }
      if (method === "POST" && pathname === "/api/v1/uploads") {
        createSessionPayload = request.postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ upload_id: "upload-e2ee", chunk_size: 5 * 1024 * 1024, offset: 0 }),
        });
        return;
      }
      if (method === "PATCH" && pathname === "/api/v1/uploads/upload-e2ee") {
        originalChunks.push(request.postDataBuffer() ?? Buffer.alloc(0));
        const uploaded = Buffer.concat(originalChunks);
        const isFinal = createSessionPayload && uploaded.length >= createSessionPayload.total_size;
        await route.fulfill({
          status: isFinal ? 200 : 204,
          headers: isFinal ? { "Content-Type": "application/json" } : {},
          body: isFinal ? JSON.stringify({ asset: { id: ASSET_ID } }) : "",
        });
        return;
      }
      if (method === "POST" && pathname === `/api/v1/assets/${ASSET_ID}/derivatives`) {
        const parsed = parseMultipart(request.postDataBuffer() ?? Buffer.alloc(0), request.headers()["content-type"] || "");
        const variant = parsed.fields.variant;
        const manifest = JSON.parse(parsed.fields.media_encryption);
        derivativeManifests[variant] = manifest;
        derivativeCiphertexts.set(variant, parsed.files.file);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ status: Object.keys(derivativeManifests).length === 4 ? "ready" : "waiting_derivatives" }),
        });
        return;
      }
      if (method === "POST" && pathname === `/api/v1/galleries/${GALLERY_ID}/assets`) {
        linkedToGallery = true;
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
      if (method === "GET" && pathname === `/api/v1/assets/${ASSET_ID}`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(asset(ASSET_ID, photoName, photoBytes.length, createSessionPayload, derivativeManifests)) });
        return;
      }
      if (method === "GET" && pathname === `/api/v1/assets/${SECOND_ASSET_ID}`) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(asset(SECOND_ASSET_ID, `Second ${photoName}`, photoBytes.length, createSessionPayload, derivativeManifests)) });
        return;
      }
      if (method === "GET" && pathname.startsWith("/storage/")) {
        const key = decodeURIComponent(pathname.replace(/^\/storage\//, ""));
        storageKeys.push(key);
        const variant = key.includes("display_webp")
          ? "display_webp"
          : key.includes("thumb_lg_webp")
            ? "thumb_lg_webp"
            : key.includes("thumb_sm_webp")
              ? "thumb_sm_webp"
              : "thumb_md_webp";
        await route.fulfill({
          status: 200,
          contentType: "application/vnd.rawdrive.encrypted",
          body: derivativeCiphertexts.get(variant) ?? Buffer.alloc(0),
        });
        return;
      }

      await route.continue();
    });

    await page.goto(`/galleries/${GALLERY_ID}`);
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Upload Photos" }).click();
    const uploadDialog = page.getByTestId("gallery-upload-dialog");
    await expect(uploadDialog).toBeVisible();
    await expect(uploadDialog.getByRole("heading", { name: "Upload photos to gallery" })).toBeVisible();
    await expect(uploadDialog).toContainText("Details");
    await expect(uploadDialog).toContainText("Processing");
    await expect(uploadDialog).toContainText("Visibility");
    await expect(uploadDialog.getByRole("button", { name: "Select files" })).toBeVisible();
    await expect(uploadDialog.getByRole("button", { name: "Choose folder" })).toBeVisible();

    await page.evaluate(
      ({ name, bytes }) => {
        const input = document.querySelector<HTMLInputElement>('[data-testid="gallery-photo-file-input"]');
        if (!input) throw new Error("gallery photo input missing");
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(bytes)], name, { type: "image/jpeg" }));
        Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { name: photoName, bytes: Array.from(photoBytes) },
    );
    await expect(uploadDialog.getByText(photoName)).toBeVisible({ timeout: 15_000 });

    await expect(page.locator(`img[alt="${photoName}"]`).first()).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => page.locator(`img[alt="${photoName}"]`).first().evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    await expect(uploadDialog.getByRole("button", { name: "Close upload dialog" })).toBeVisible({ timeout: 15_000 });
    await uploadDialog.getByRole("button", { name: "Close upload dialog" }).click();
    await expect(uploadDialog).toBeHidden();

    const tileImgSrc = await page.locator(`img[alt="${photoName}"]`).first().getAttribute("src");
    expect(tileImgSrc).toContain("blob:");

    await expect(page.getByRole("button", { name: `Share ${photoName}` })).toBeVisible();
    await page.getByRole("button", { name: `Delete ${photoName}` }).click();
    await expect(page.getByRole("heading", { name: "Delete photo?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Delete photo?" })).toBeHidden();

    await page.getByRole("button", { name: `View ${photoName}` }).click();
    const dialogImg = page.getByRole("dialog", { name: `Photo: ${photoName}` }).locator(`img[alt="${photoName}"]`).first();
    await expect(dialogImg).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => dialogImg.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await dialogImg.getAttribute("src")).toContain("blob:");
    const deletePhotoButton = page.getByRole("button", { name: "Delete photo" });
    await expect(deletePhotoButton).toBeVisible();
    await expect(deletePhotoButton).toHaveClass(/bg-feedback-error/);

    const filmstrip = page.getByRole("tablist", { name: "Photo filmstrip" });
    await expect(filmstrip).toBeVisible({ timeout: 30_000 });
    const filmstripImages = filmstrip.locator("img");
    await expect(filmstripImages).toHaveCount(2);
    await expect.poll(async () => filmstripImages.first().evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const filmstripSrcs = await filmstripImages.evaluateAll((imgs) =>
      imgs.map((img) => (img as HTMLImageElement).src),
    );
    expect(filmstripSrcs.every((src) => src.startsWith("blob:"))).toBe(true);
    expect(storageKeys.some((key) => key.includes("thumb_sm_webp"))).toBe(true);

    expect(createSessionPayload?.media_encryption?.scheme).toBe("rawdrive-e2ee-v1");
    expect(createSessionPayload?.media_encryption?.algorithm).toBe("AES-256-GCM");
    expect(createSessionPayload?.media_encryption?.key_id).toMatch(/^gallery:gallery-e2ee:[0-9a-f]{16}$/);
    expect(createSessionPayload?.media_encryption?.object_type).toBe("original");
    expect(createSessionPayload?.source_metadata?.original_filename).toBe(photoName);
    expect(createSessionPayload?.source_metadata?.original_size_bytes).toBe(photoBytes.length);
    expect(createSessionPayload?.source_metadata?.image_width).toBeGreaterThan(0);
    expect(createSessionPayload?.source_metadata?.image_height).toBeGreaterThan(0);

    const originalCiphertext = Buffer.concat(originalChunks);
    expect(originalCiphertext.length).toBe(createSessionPayload?.media_encryption?.ciphertext_size);
    expect(sha256Hex(originalCiphertext)).toBe(createSessionPayload?.media_encryption?.ciphertext_sha256);
    expect(sha256Hex(originalCiphertext)).not.toBe(sha256Hex(photoBytes));
    expect(originalCiphertext.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))).toBe(false);

    expect(Object.keys(derivativeManifests).sort()).toEqual(["display_webp", "thumb_lg_webp", "thumb_md_webp", "thumb_sm_webp"]);
    for (const [variant, manifest] of Object.entries(derivativeManifests)) {
      const ciphertext = derivativeCiphertexts.get(variant);
      expect(ciphertext, `${variant} ciphertext`).toBeTruthy();
      expect(manifest.scheme).toBe("rawdrive-e2ee-v1");
      expect(manifest.algorithm).toBe("AES-256-GCM");
      expect(manifest.key_id).toBe(createSessionPayload?.media_encryption?.key_id);
      expect(manifest.object_type).toBe(variant);
      expect(manifest.content_type).toBe("image/webp");
      expect(sha256Hex(ciphertext)).toBe(manifest.ciphertext_sha256);
      expect(ciphertext?.subarray(0, 4).toString("ascii")).not.toBe("RIFF");
    }

    const stored = await page.evaluate((galleryId) => {
      const baseKeyId = `gallery:${galleryId}`;
      const activeKeyId = localStorage.getItem(`rawdrive:media-key-active:${baseKeyId}`);
      return {
        activeKeyId,
        activeKey: activeKeyId ? localStorage.getItem(`rawdrive:media-key:${activeKeyId}`) : null,
        legacyKey: localStorage.getItem(`rawdrive:media-key:${baseKeyId}`),
      };
    }, GALLERY_ID);
    expect(stored.activeKeyId).toBe(createSessionPayload?.media_encryption?.key_id);
    expect(stored.activeKey).toBeTruthy();
    expect(stored.legacyKey).toBeNull();
  });
});

function gallery() {
  return {
    id: GALLERY_ID,
    workspace_id: "workspace-e2ee",
    title: "E2EE Gallery",
    slug: "e2ee-gallery",
    description: "Encrypted upload gallery",
    gallery_type: "delivery",
    is_published: true,
    max_selections: 0,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    download_enabled: true,
  };
}

function galleryAsset({ assetId, sortOrder }) {
  return {
    id: `gallery-asset-${assetId}`,
    gallery_id: GALLERY_ID,
    asset_id: assetId,
    sort_order: sortOrder,
    is_hero: false,
  };
}

function asset(id, filename, originalSize, createPayload, variantManifests) {
  return {
    id,
    workspace_id: "workspace-e2ee",
    filename,
    content_type: "image/jpeg",
    size_bytes: originalSize,
    storage_key: `originals/${id}.jpg.enc`,
    exif_data: createPayload?.source_metadata ?? {},
    thumbnail_urls: {
      thumb_sm_webp: `thumbnails/${id}/thumb_sm_webp.webp`,
      thumb_md_webp: `thumbnails/${id}/thumb_md_webp.webp`,
      thumb_lg_webp: `thumbnails/${id}/thumb_lg_webp.webp`,
      display_webp: `derivatives/${id}/display_webp.webp.enc`,
    },
    status: "ready",
    created_at: "2026-01-01T00:00:00Z",
    is_encrypted: true,
    encryption_algo: "client-side-aes-256-gcm",
    encryption_version: 1,
    media_encryption: {
      ...(createPayload?.media_encryption ?? {}),
      variants: variantManifests,
    },
  };
}

function parseMultipart(body, contentType) {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (!boundary) throw new Error("missing multipart boundary");
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let offset = 0;

  while (offset < body.length) {
    const start = body.indexOf(delimiter, offset);
    if (start < 0) break;
    let partStart = start + delimiter.length;
    if (body.subarray(partStart, partStart + 2).toString("ascii") === "--") break;
    if (body.subarray(partStart, partStart + 2).toString("ascii") === "\r\n") partStart += 2;

    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), partStart);
    if (headerEnd < 0) break;
    const headers = body.subarray(partStart, headerEnd).toString("utf8");
    const name = /name="([^"]+)"/.exec(headers)?.[1];
    const bodyStart = headerEnd + 4;
    const next = body.indexOf(delimiter, bodyStart);
    if (next < 0 || !name) break;
    const bodyEnd = next >= 2 && body[next - 2] === 13 && body[next - 1] === 10 ? next - 2 : next;
    const value = Buffer.from(body.subarray(bodyStart, bodyEnd));

    if (/filename="/.test(headers)) {
      files[name] = value;
    } else {
      fields[name] = value.toString("utf8");
    }
    offset = next;
  }
  return { fields, files };
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makeJwt(payload) {
  const encodedHeader = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.`;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function findPhotoFixture() {
  const candidates = [
    "../tests/photos/Wedding (42).jpg",
    "../tests/photos/veera.jpg",
  ].map((candidate) => path.resolve(process.cwd(), candidate));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      "Missing required tests/photos JPEG fixture for E2EE upload test; do not fall back to landing images.",
    );
  }
  return found;
}
