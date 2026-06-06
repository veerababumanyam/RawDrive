// @ts-check
import { test, expect, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const API_BASE =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.PLAYWRIGHT_API_BASE ||
  "http://host.docker.internal:8080";

const SEED_EMAIL = process.env.E2E_TEST_EMAIL || "super@rawdrive.test";
const SEED_PASSWORD = process.env.E2E_TEST_PASSWORD || "UatPho@2026";

const FIXTURE_RELATIVE_PATHS = [
  "../tests/photos/Wedding (42).jpg",
  "../tests/photos/Wedding (43).jpg",
  "../tests/photos/Wedding (44).jpg",
];

const READY_POLL_TIMEOUT_MS = 90_000;

type Seed = {
  token: string;
  galleryId: string;
  assetIds: string[];
  filenames: string[];
};

let seed: Seed | null = null;
let skipReason: string | null = null;

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function loginWithFetch(): Promise<string> {
  for (const authPath of ["/api/v1/auth/login", "/auth/login"]) {
    const res = await fetch(`${API_BASE}${authPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
    }).catch(() => null);
    if (!res || !res.ok) continue;
    const data = (await res.json()) as { access_token?: string };
    if (data.access_token) return data.access_token;
  }
  throw new Error("login failed on both /api/v1/auth/login and /auth/login");
}

async function loginBrowserContext(context: BrowserContext): Promise<void> {
  for (const authPath of ["/api/v1/auth/login", "/auth/login"]) {
    const res = await context.request.post(`${API_BASE}${authPath}`, {
      data: { email: SEED_EMAIL, password: SEED_PASSWORD },
    });
    if (res.ok()) return;
  }
  throw new Error("browser-context login failed");
}

async function createGallery(token: string): Promise<{ id: string; slug: string }> {
  const res = await fetch(`${API_BASE}/api/v1/galleries`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      title: `Cover Design E2E ${Date.now()}`,
      gallery_type: "delivery",
    }),
  });
  if (res.status !== 201) throw new Error(`create gallery failed: ${res.status}`);
  const body = (await res.json()) as { id?: string; slug?: string };
  if (!body.id || !body.slug) throw new Error("create gallery returned no id/slug");
  return { id: body.id, slug: body.slug };
}

async function uploadAsset(token: string, filePath: string): Promise<string> {
  const bytes = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), filename);
  const res = await fetch(`${API_BASE}/api/v1/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.status !== 201) throw new Error(`upload asset ${filename} failed: ${res.status}`);
  const body = (await res.json()) as { Asset?: { id?: string } };
  const assetId = body.Asset?.id;
  if (!assetId) throw new Error(`upload asset ${filename} returned no id`);
  return assetId;
}

async function waitForDerivatives(token: string, assetId: string): Promise<void> {
  const deadline = Date.now() + READY_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/api/v1/assets/${assetId}`, {
      headers: authHeaders(token),
    });
    if (res.ok) {
      const asset = (await res.json()) as {
        status?: string;
        thumbnail_urls?: Record<string, string> | null;
      };
      const thumbs = asset.thumbnail_urls ?? {};
      if (
        asset.status === "ready" &&
        (thumbs.thumb_lg_webp || thumbs.thumb_md_webp || thumbs.display_webp)
      ) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`asset ${assetId} did not become ready with thumbnails`);
}

async function linkAssetToGallery(
  token: string,
  galleryId: string,
  assetId: string,
  sortOrder: number,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/assets`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ asset_id: assetId, sort_order: sortOrder }),
  });
  if (res.status !== 201) throw new Error(`link asset failed: ${res.status}`);
}

function resolveFixtures(): string[] {
  return FIXTURE_RELATIVE_PATHS.map((rel) => path.resolve(process.cwd(), rel)).filter((abs) =>
    fs.existsSync(abs),
  );
}

async function readGalleryAssets(token: string, galleryId: string): Promise<Array<Record<string, any>>> {
  const res = await fetch(
    `${API_BASE}/api/v1/galleries/${galleryId}/assets?include_assets=true`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error(`include_assets failed: ${res.status}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error("include_assets did not return a bare array");
  return body as Array<Record<string, any>>;
}

async function readGallery(token: string, galleryId: string): Promise<Record<string, any>> {
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`get gallery failed: ${res.status}`);
  return (await res.json()) as Record<string, any>;
}

test.beforeAll(async () => {
  try {
    const fixtures = resolveFixtures();
    if (fixtures.length < 3) {
      skipReason = `tests/photos fixtures not found at process.cwd()=${process.cwd()} (need Wedding 42/43/44)`;
      return;
    }

    const token = await loginWithFetch();
    const gallery = await createGallery(token);
    const assetIds: string[] = [];
    const filenames: string[] = [];
    for (const [index, fixture] of fixtures.slice(0, 3).entries()) {
      const assetId = await uploadAsset(token, fixture);
      await waitForDerivatives(token, assetId);
      await linkAssetToGallery(token, gallery.id, assetId, index);
      assetIds.push(assetId);
      filenames.push(path.basename(fixture));
    }

    const rows = await readGalleryAssets(token, gallery.id);
    if (rows.length < 3 || rows.some((row) => !row.asset?.id)) {
      throw new Error("include_assets did not return three embedded assets for the seeded gallery");
    }

    seed = {
      token,
      galleryId: gallery.id,
      assetIds,
      filenames,
    };
  } catch (err) {
    skipReason = `Cover Design E2E requires a running stack with storage workers: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
});

test("cover photo picker drives the selected template photo slot in realtime and persists it", async ({
  page,
  context,
}) => {
  test.skip(Boolean(skipReason), skipReason ?? "");
  if (!seed) throw new Error("missing seed");

  await loginBrowserContext(context);
  await page.goto(`${BASE_URL}/galleries/${seed.galleryId}/cover`);

  await expect(page.getByRole("heading", { name: "Cover photo" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", {
      name: new RegExp(`use ${seed.filenames[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} as template photo 1`, "i"),
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: /use four grid cover template/i }).click();
  await page.getByRole("button", { name: /^Photo 2$/ }).click();

  const selectedFilename = seed.filenames[2];
  const selectedTile = page.getByRole("button", {
    name: new RegExp(
      `use ${selectedFilename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} as template photo 2`,
      "i",
    ),
  });
  await selectedTile.click();
  await expect(selectedTile.locator(".cover-photo-tile__slot-badge")).toContainText("Photo 2");

  const previewSlot = page
    .getByLabel(/Cover preview/i)
    .getByRole("button", { name: "Cover template photo 2" });
  await expect(previewSlot.getByRole("img", { name: selectedFilename })).toBeVisible();

  await page.getByRole("button", { name: /save cover and design/i }).click();
  await expect(page.getByText("Cover & Design saved.")).toBeVisible({
    timeout: 15_000,
  });

  const saved = await readGallery(seed.token, seed.galleryId);
  const slots = saved.settings?.design_config?.cover?.assetSlots;
  expect(Array.isArray(slots)).toBeTruthy();
  expect(slots[1]).toBe(seed.assetIds[2]);
});
