import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the router seam so this test controls exactly what `decodeImage` sees:
// an `{ ok: true }` native decode (jpeg) must flow through to a derivative set,
// and an `{ ok: false }` route must surface as a NeedsDesktopDecodeError.
const decodeToImageSourceMock = vi.fn();
vi.mock("../decode-to-image-source", () => ({
  decodeToImageSource: (...args: unknown[]) => decodeToImageSourceMock(...args),
}));

// Keep the WebP encoder + crypto deterministic and DOM-free. The encoder is
// size-aware: it reports a blob size proportional to the canvas pixel count so
// the face-index pre-downscale path (which shrinks until the frame fits under
// the cap) can be exercised deterministically. `encodedBytesPerPixel` is tuned
// per test to put the 2400px frame over/under the cap.
let encodedBytesPerPixel = 0;
vi.mock("../webp-encoder", () => ({
  encodeCanvasToWebP: vi.fn(async (canvas: HTMLCanvasElement) => {
    const pixels = (canvas.width || 1) * (canvas.height || 1);
    const size = Math.max(3, Math.round(pixels * encodedBytesPerPixel));
    return new Blob([new Uint8Array(size)], { type: "image/webp" });
  }),
}));
vi.mock("../media-crypto", () => ({
  encryptBlob: vi.fn(async () => ({
    ciphertext: new Blob([new Uint8Array([9])], { type: "image/webp" }),
    manifest: { keyId: "k", iv: "iv" },
  })),
}));

import {
  FACE_INDEX_MAX_BYTES,
  NeedsDesktopDecodeError,
  createEncryptedWebPDerivativeSet,
} from "../webp-derivatives";

function installCanvas() {
  const ctx = { drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
  };
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "canvas") return canvas as unknown as HTMLCanvasElement;
    return {} as HTMLElement;
  }) as typeof document.createElement);
}

beforeEach(() => {
  decodeToImageSourceMock.mockReset();
  encodedBytesPerPixel = 0;
  installCanvas();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const key = { type: "secret" } as unknown as CryptoKey;

describe("createEncryptedWebPDerivativeSet decodeImage seam", () => {
  it("jpeg native decode flows to a full derivative set with source dims", async () => {
    const close = vi.fn();
    decodeToImageSourceMock.mockResolvedValueOnce({
      ok: true,
      source: {} as CanvasImageSource,
      width: 4000,
      height: 3000,
      close,
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "Wedding (42).jpg", { type: "image/jpeg" });

    const set = await createEncryptedWebPDerivativeSet(file, key, "key-1");

    expect(set.source).toEqual({ width: 4000, height: 3000 });
    expect(set.derivatives).toHaveLength(4);
    expect(set.derivatives.map((d) => d.variant)).toEqual([
      "thumb_sm_webp",
      "thumb_md_webp",
      "thumb_lg_webp",
      "display_webp",
    ]);
    expect(set.faceIndexImage?.blob.type).toBe("image/webp");
    expect(set.faceIndexImage?.width).toBe(2400);
    expect(set.faceIndexImage?.height).toBe(1800);
    // close() is invoked exactly once in the finally block.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("an { ok: false } route throws NeedsDesktopDecodeError carrying the detail", async () => {
    decodeToImageSourceMock.mockResolvedValue({
      ok: false,
      reason: "needs-desktop",
      detail: "X3F requires RawDrive Desktop",
    });
    const file = new File([new Uint8Array([0, 0, 0, 0])], "scan.x3f", { type: "" });

    await expect(createEncryptedWebPDerivativeSet(file, key, "key-1")).rejects.toBeInstanceOf(
      NeedsDesktopDecodeError,
    );
    await expect(
      createEncryptedWebPDerivativeSet(file, key, "key-1"),
    ).rejects.toThrow(/X3F requires RawDrive Desktop/);
  });
});

describe("createEncryptedWebPDerivativeSet face-index pre-downscale (3e)", () => {
  it("keeps the 2400px display frame when it already fits under the cap", async () => {
    encodedBytesPerPixel = 0.0001; // 2400*1800*0.0001 ≈ 432KB, well under cap
    decodeToImageSourceMock.mockResolvedValueOnce({
      ok: true,
      source: {} as CanvasImageSource,
      width: 4000,
      height: 3000,
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "small.jpg", {
      type: "image/jpeg",
    });

    const set = await createEncryptedWebPDerivativeSet(file, key, "key-1");

    expect(set.faceIndexImage?.width).toBe(2400);
    expect(set.faceIndexImage?.height).toBe(1800);
    expect(set.faceIndexImage?.blob.size).toBeLessThanOrEqual(
      FACE_INDEX_MAX_BYTES,
    );
  });

  it("pre-downscales the face-index frame below the 10MB cap before any POST", async () => {
    // ~3 bytes/px puts 2400x1800 (~13MB) OVER the cap, forcing a shrink, but
    // 1600x1200 (~5.7MB) fits — so the chosen frame must be smaller than 2400px
    // AND under the cap, proving we never hand the caller the blind 2400 frame.
    encodedBytesPerPixel = 3;
    decodeToImageSourceMock.mockResolvedValueOnce({
      ok: true,
      source: {} as CanvasImageSource,
      width: 6000,
      height: 4500,
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "dense.jpg", {
      type: "image/jpeg",
    });

    const set = await createEncryptedWebPDerivativeSet(file, key, "key-1");

    expect(set.faceIndexImage).toBeDefined();
    expect(set.faceIndexImage!.blob.size).toBeLessThanOrEqual(
      FACE_INDEX_MAX_BYTES,
    );
    // The frame was shrunk below the 2400px display size to fit the cap.
    expect(set.faceIndexImage!.width).toBeLessThan(2400);
    // The decode happened exactly once — the shrink reuses decoded pixels and
    // never re-fetches/re-decodes the source file (perf hot-path law).
    expect(decodeToImageSourceMock).toHaveBeenCalledTimes(1);
  });
});
