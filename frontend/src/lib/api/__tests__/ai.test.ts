import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// We need to import after setting up the mock
import {
  getGalleryFaceIndexStatus,
  getFaceClusters,
  getClusterFaces,
  linkClusterContact,
  searchAssets,
  getAIConfig,
  getCredits,
  getAssetTags,
  getDuplicates,
  isFaceIndexUnavailableError,
  splitCluster,
  setSpendCap,
  validateAIKey,
  uploadAssetFaceEmbeddings,
  uploadAssetFaceIndexImage,
  listPublicPeople,
  listPublicPersonPhotos,
  searchPublicFaceInGallery,
  isPhotoSearchDisabledError,
  isPhotoSearchUnavailableError,
  PhotoSearchUnavailableError,
  unlinkClusterContact,
} from "../ai";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";

beforeEach(() => {
  mockFetch.mockReset();
  // getFaceClusters routes through authFetch, which reads the in-memory
  // access-token cache (getStoredAccessToken) rather than its token arg.
  // Seed the cache so authFetch attaches the Authorization header that the
  // endpoint assertion below verifies.
  persistAuthTokens("test-token");
});

afterEach(() => {
  clearAuthTokens();
});

describe("AI API Client", () => {
  const token = "test-token";

  it("getFaceClusters calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { cluster_label: "abc", cluster_name: "Bride", face_count: 10 },
        ]),
    });

    const result = await getFaceClusters(token);
    expect(result).toHaveLength(1);
    expect(result[0].cluster_name).toBe("Bride");
    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/ai/clusters");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
  });

  it("getFaceClusters with gallery filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await getFaceClusters(token, "gallery-123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("?gallery_id=gallery-123"),
      expect.any(Object),
    );
  });

  it("getGalleryFaceIndexStatus calls the gallery status endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          gallery_id: "gallery-123",
          uploaded_photos: 4,
          indexable_photos: 4,
          indexed_faces: 0,
          indexed_people: 0,
          indexed_photos: 0,
          status: "empty",
        }),
    });

    const result = await getGalleryFaceIndexStatus(token, "gallery-123");
    expect(result.uploaded_photos).toBe(4);
    expect(result.status).toBe("empty");
    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain(
      "/api/v1/ai/galleries/gallery-123/face-index-status",
    );
    expect(init.credentials).toBe("include");
  });

  it("getClusterFaces uses the gallery-scoped review endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          cluster_label: "person-1",
          faces: [
            {
              id: "face-1",
              asset_id: "asset-1",
              face_index: 0,
              bounding_box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
              cluster_label: "person-1",
              cluster_name: "Bride",
              confidence: 0.92,
              source: "client",
            },
          ],
          count: 1,
        }),
    });

    const result = await getClusterFaces(token, "person-1", "gallery-123");
    expect(result.faces).toHaveLength(1);
    expect(result.faces[0].id).toBe("face-1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/ai/clusters/person-1/faces?gallery_id=gallery-123",
      ),
      expect.any(Object),
    );
  });

  it("linkClusterContact stores the CRM contact link with gallery provenance", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          contact: {
            contact_id: "contact-1",
            name: "Priya Client",
          },
        }),
    });

    const result = await linkClusterContact(
      token,
      "person-1",
      "contact-1",
      "gallery-123",
    );
    expect(result?.name).toBe("Priya Client");

    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/ai/clusters/person-1/contact");
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      contact_id: "contact-1",
      gallery_id: "gallery-123",
    });
  });

  it("unlinkClusterContact clears the CRM contact link", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    await unlinkClusterContact(token, "person-1");

    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/ai/clusters/person-1/contact");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("include");
  });

  it("splitCluster posts selected face IDs to the source cluster", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ new_cluster_label: "person-new" }),
    });

    const result = await splitCluster(
      token,
      "person-1",
      ["face-1", "face-2"],
      "Groom",
    );
    expect(result.new_cluster_label).toBe("person-new");

    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain("/api/v1/ai/clusters/person-1/split");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.face_ids).toEqual(["face-1", "face-2"]);
    expect(body.new_cluster_name).toBe("Groom");
  });

  it("searchAssets sends POST with query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [], total: 0 }),
    });

    const result = await searchAssets(token, "sunset portrait");
    expect(result.total).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/ai/search"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("getAIConfig returns config", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          configured: true,
          provider: "gemini",
          key_masked: "AIza...xxxx",
        }),
    });

    const config = await getAIConfig(token);
    expect(config.configured).toBe(true);
    expect(config.key_masked).toBe("AIza...xxxx");
  });

  it("getCredits returns credit summary", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          monthly_cap_paisa: 500000,
          spent_this_month_paisa: 125000,
        }),
    });

    const credits = await getCredits(token);
    expect(credits.monthly_cap_paisa).toBe(500000);
  });

  it("getAssetTags returns tags and caption", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ai_tags: [{ tag: "sunset", category: "scene", confidence: 0.95 }],
          ai_caption: "A sunset",
          ai_tag_status: "done",
        }),
    });

    const result = await getAssetTags(token, "asset-1");
    expect(result.ai_tags).toHaveLength(1);
    expect(result.ai_caption).toBe("A sunset");
  });

  it("getDuplicates returns groups", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ groups: [], total: 0 }),
    });

    const result = await getDuplicates(token, "pending");
    expect(result.groups).toHaveLength(0);
  });

  it("setSpendCap sends PUT with cap value", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await setSpendCap(token, 500000);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/ai/spend/cap"),
      expect.objectContaining({ method: "PUT" }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.monthly_cap_paisa).toBe(500000);
  });

  it("validateAIKey returns validation result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ valid: true }),
    });

    const result = await validateAIKey(token);
    expect(result.valid).toBe(true);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(getFaceClusters(token)).rejects.toThrow("500");
  });
});

// Public Find Me / People surface — these are GUEST endpoints gated by
// gateGalleryAccess (S4-G5). The durable gallery_session lives in a
// host-only cookie on the FRONTEND origin (minted by SharePinGate's
// relative /api/v1 rewrite fetch / written by the password gate). For the
// cookie to reach the backend gate, these calls MUST go SAME-ORIGIN
// (relative /api/v1/... via the next.config.ts rewrite) with
// credentials:"include" — NOT the absolute cross-origin API base with
// credentials:"omit" (which strips the cookie → 403
// "gallery access requires a valid share link or invite"). Regression guard
// for that 403 (issue #135).
describe("Public face/people API client (gallery-session credential)", () => {
  const RELATIVE_PREFIX = "/api/v1/public/galleries/";

  it("listPublicPeople is same-origin relative + sends credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await listPublicPeople("wedding-abcd1234");

    const [url, init] = mockFetch.mock.calls[0];
    const calledUrl = String(url);
    expect(calledUrl).not.toMatch(/^https?:\/\//); // not absolute cross-origin
    expect(
      calledUrl.startsWith(`${RELATIVE_PREFIX}wedding-abcd1234/people`),
    ).toBe(true);
    expect(init.credentials).toBe("include");
  });

  it("listPublicPersonPhotos is same-origin relative + sends credentials", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ asset_ids: [], count: 0 }),
    });

    await listPublicPersonPhotos("wedding-abcd1234", "person-1");

    const [url, init] = mockFetch.mock.calls[0];
    const calledUrl = String(url);
    expect(calledUrl).not.toMatch(/^https?:\/\//);
    expect(
      calledUrl.startsWith(
        `${RELATIVE_PREFIX}wedding-abcd1234/people/person-1/photos`,
      ),
    ).toBe(true);
    expect(init.credentials).toBe("include");
  });

  // REGRESSION (#175): the People surface is gated by the same gateGalleryAccess
  // as photo-search. A no-PIN share visitor has no gallery_session cookie, so the
  // share token (+ws) must be forwarded or the People GETs 403.
  it("listPublicPeople forwards the share token + ws scope (#175)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await listPublicPeople("wedding-abcd1234", {
      shareToken: "share-tok-123",
      ws: "legacy-scope-9e8a5927",
    });

    const calledUrl = String(mockFetch.mock.calls[0][0]);
    expect(calledUrl).not.toMatch(/^https?:\/\//);
    const q = new URL(calledUrl, "https://x.test").searchParams;
    expect(q.get("share")).toBe("share-tok-123");
    expect(q.get("ws")).toBe("legacy-scope-9e8a5927");
  });

  it("listPublicPersonPhotos forwards the share token + ws scope (#175)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ asset_ids: [], count: 0 }),
    });

    await listPublicPersonPhotos("wedding-abcd1234", "person-1", {
      shareToken: "share-tok-123",
      ws: "legacy-scope-9e8a5927",
    });

    const calledUrl = String(mockFetch.mock.calls[0][0]);
    expect(calledUrl).not.toMatch(/^https?:\/\//);
    const q = new URL(calledUrl, "https://x.test").searchParams;
    expect(q.get("share")).toBe("share-tok-123");
    expect(q.get("ws")).toBe("legacy-scope-9e8a5927");
  });

  it("searchPublicFaceInGallery POSTs same-origin relative + sends credentials + multipart body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          found: false,
          faces_detected: 0,
          asset_ids: [],
          count: 0,
        }),
    });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await searchPublicFaceInGallery("wedding-abcd1234", blob);

    const [url, init] = mockFetch.mock.calls[0];
    const calledUrl = String(url);
    expect(calledUrl).not.toMatch(/^https?:\/\//);
    expect(
      calledUrl.startsWith(`${RELATIVE_PREFIX}wedding-abcd1234/photo-search`),
    ).toBe(true);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
  });

  // REGRESSION (#175): a visitor who arrived via a no-PIN share link has no
  // gallery_session cookie on the standalone Find Me route. The share token
  // (and ws) must be forwarded on the relative URL so tryBindShareSession
  // authorizes the POST — otherwise gateGalleryAccess returns 403
  // "gallery access requires a valid share link or invite".
  it("searchPublicFaceInGallery forwards the share token + ws scope (#175)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          found: false,
          faces_detected: 0,
          asset_ids: [],
          count: 0,
        }),
    });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await searchPublicFaceInGallery("wedding-abcd1234", blob, {
      shareToken: "share-tok-123",
      ws: "legacy-scope-9e8a5927",
    });

    const [url, init] = mockFetch.mock.calls[0];
    const calledUrl = String(url);
    // Still same-origin relative so the cookie path is preserved for password
    // galleries (which have no share token).
    expect(calledUrl).not.toMatch(/^https?:\/\//);
    expect(
      calledUrl.startsWith(`${RELATIVE_PREFIX}wedding-abcd1234/photo-search`),
    ).toBe(true);
    // ...but now also carries the share scope.
    const q = new URL(calledUrl, "https://x.test").searchParams;
    expect(q.get("share")).toBe("share-tok-123");
    expect(q.get("ws")).toBe("legacy-scope-9e8a5927");
    expect(init.credentials).toBe("include");
  });

  // GAL-FR-107 (slice 3c): the 3b backend now returns 403
  // `biometric_consent_required` unless the photo-search POST carries an
  // affirmative `consent_given`. When the guest accepted the consent affordance,
  // the page passes `consentGiven: true` and the multipart body MUST include
  // `consent_given=true` (parseConsentGiven accepts that encoding).
  it("searchPublicFaceInGallery sends consent_given=true when consent is accepted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          found: false,
          faces_detected: 0,
          asset_ids: [],
          count: 0,
        }),
    });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await searchPublicFaceInGallery("wedding-abcd1234", blob, {
      consentGiven: true,
    });

    const init = mockFetch.mock.calls[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("consent_given")).toBe("true");
  });

  // Without affirmative consent the flag must NOT be fabricated — the request
  // omits `consent_given`, so the backend's fail-closed 403 holds.
  it("searchPublicFaceInGallery omits consent_given without acceptance", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          found: false,
          faces_detected: 0,
          asset_ids: [],
          count: 0,
        }),
    });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    await searchPublicFaceInGallery("wedding-abcd1234", blob);

    const init = mockFetch.mock.calls[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("consent_given")).toBeNull();
  });

  // FE-5: "feature not available right now" is classified from the HTTP STATUS
  // CODE (not a regex on the error copy), so a backend wording change cannot
  // silently break the friendly disabled/unavailable panels.
  it("searchPublicFaceInGallery throws PhotoSearchUnavailableError on 503 (typed, status-keyed)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      // Deliberately DIFFERENT copy than the page ever regex-matched — proves
      // detection keys on the status code, not the text.
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: "completely reworded service message" }),
        ),
    });
    const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    await expect(
      searchPublicFaceInGallery("wedding-abcd1234", blob),
    ).rejects.toBeInstanceOf(PhotoSearchUnavailableError);
  });

  it("searchPublicFaceInGallery throws PhotoSearchDisabledError on 403 disabled (typed, status-keyed)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: "photo search disabled for this gallery" }),
        ),
    });
    const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    const err = await searchPublicFaceInGallery(
      "wedding-abcd1234",
      blob,
    ).catch((e) => e);
    expect(isPhotoSearchDisabledError(err)).toBe(true);
    expect(isPhotoSearchUnavailableError(err)).toBe(false);
  });

  it("searchPublicFaceInGallery does NOT classify a 403 biometric_consent_required as disabled", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () =>
        Promise.resolve(JSON.stringify({ error: "biometric_consent_required" })),
    });
    const blob = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
    const err = await searchPublicFaceInGallery(
      "wedding-abcd1234",
      blob,
    ).catch((e) => e);
    // Consent is enforced pre-capture in the standalone flow; mislabeling it as
    // "disabled" would be wrong, so it falls through to a generic Error.
    expect(isPhotoSearchDisabledError(err)).toBe(false);
    expect(err).toBeInstanceOf(Error);
  });
});

// Upload-side client for the slice-1 ingest endpoint. Authenticated owner call
// (the photographer), so it goes through authFetch (Authorization + include).
describe("uploadAssetFaceEmbeddings (client face-index ingest)", () => {
  it("POSTs embeddings to the asset face-embeddings endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stored: 2 }),
    });

    const faces = [
      {
        face_index: 0,
        bounding_box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        embedding: new Array(512).fill(0),
        det_score: 0.99,
      },
      { face_index: 1, embedding: new Array(512).fill(0.01), det_score: 0.8 },
    ];
    const result = await uploadAssetFaceEmbeddings("asset-1", faces, {
      galleryId: "g-1",
    });
    expect(result.stored).toBe(2);

    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain(
      "/api/v1/assets/asset-1/face-embeddings",
    );
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include"); // authFetch attaches credentials
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    const body = JSON.parse(init.body);
    expect(body.gallery_id).toBe("g-1");
    expect(body.faces).toHaveLength(2);
    expect(body.faces[0].embedding).toHaveLength(512);
  });

  it("throws on a non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("face recognition disabled"),
    });
    await expect(
      uploadAssetFaceEmbeddings("asset-1", [
        { embedding: new Array(512).fill(0) },
      ]),
    ).rejects.toThrow(/disabled|403/);
  });
});

describe("uploadAssetFaceIndexImage (server-assisted encrypted face index)", () => {
  it("POSTs a downscaled image frame to the asset face-index-image endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ stored: 1 }),
    });

    const result = await uploadAssetFaceIndexImage(
      "asset-1",
      new Blob(["webp"], { type: "image/webp" }),
      { galleryId: "g-1" },
    );
    expect(result.stored).toBe(1);

    const [calledUrl, init] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain(
      "/api/v1/assets/asset-1/face-index-image",
    );
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("gallery_id")).toBe("g-1");
    expect(body.get("image")).toBeInstanceOf(File);
  });

  it("throws on a non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: () => Promise.resolve("failed to index faces"),
    });
    await expect(
      uploadAssetFaceIndexImage(
        "asset-1",
        new Blob(["webp"], { type: "image/webp" }),
      ),
    ).rejects.toThrow(/failed to index|502/);
  });

  it("maps face index service unavailability to a typed error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: () => Promise.resolve('{"error":"face_index_unavailable"}'),
    });

    let caught: unknown;
    try {
      await uploadAssetFaceIndexImage(
        "asset-1",
        new Blob(["webp"], { type: "image/webp" }),
      );
    } catch (err) {
      caught = err;
    }
    expect(isFaceIndexUnavailableError(caught)).toBe(true);
  });
});
