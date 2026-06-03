import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the router seam so this test controls exactly what `decodeImage` sees:
// an `{ ok: true }` native decode (jpeg) must flow through to a derivative set,
// and an `{ ok: false }` route must surface as a NeedsDesktopDecodeError.
const decodeToImageSourceMock = vi.fn();
vi.mock("../decode-to-image-source", () => ({
  decodeToImageSource: (...args: unknown[]) => decodeToImageSourceMock(...args),
}));

// Keep the WebP encoder + crypto deterministic and DOM-free.
vi.mock("../webp-encoder", () => ({
  encodeCanvasToWebP: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" })),
}));
vi.mock("../media-crypto", () => ({
  encryptBlob: vi.fn(async () => ({
    ciphertext: new Blob([new Uint8Array([9])], { type: "image/webp" }),
    manifest: { keyId: "k", iv: "iv" },
  })),
}));

import {
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
    // close() is invoked exactly once in the finally block.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("an { ok: false } route throws NeedsDesktopDecodeError carrying the detail", async () => {
    decodeToImageSourceMock.mockResolvedValue({
      ok: false,
      reason: "needs-desktop",
      detail: "CR3 requires RawDrive Desktop",
    });
    const file = new File([new Uint8Array([0, 0, 0, 0])], "IMG.CR3", { type: "" });

    await expect(createEncryptedWebPDerivativeSet(file, key, "key-1")).rejects.toBeInstanceOf(
      NeedsDesktopDecodeError,
    );
    await expect(
      createEncryptedWebPDerivativeSet(file, key, "key-1"),
    ).rejects.toThrow(/CR3 requires RawDrive Desktop/);
  });
});
