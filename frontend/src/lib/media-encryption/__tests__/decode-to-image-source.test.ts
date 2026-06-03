import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The format-specific decoders are mocked so this test exercises ONLY the
// routing logic of `decodeToImageSource` — which decoder it picks per format,
// and that every failure path collapses to `{ ok: false }` (never throws).
const decodeHeicMock = vi.fn();
const decodeAvifMock = vi.fn();
const supportsNativeAvifDecodeMock = vi.fn();
const decodeRawMock = vi.fn();

vi.mock("../decoders/heic", () => ({
  decodeHeic: (...args: unknown[]) => decodeHeicMock(...args),
  decodeAvif: (...args: unknown[]) => decodeAvifMock(...args),
  supportsNativeAvifDecode: (...args: unknown[]) => supportsNativeAvifDecodeMock(...args),
}));

vi.mock("../decoders/raw-preview", () => ({
  decodeRaw: (...args: unknown[]) => decodeRawMock(...args),
}));

import { decodeToImageSource } from "../decode-to-image-source";

type FakeBitmap = { width: number; height: number; close: ReturnType<typeof vi.fn> };

let createImageBitmapMock: ReturnType<typeof vi.fn> | null = null;

function installImageBitmap(impl: (source: unknown) => Promise<FakeBitmap>): ReturnType<typeof vi.fn> {
  createImageBitmapMock = vi.fn(impl);
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = createImageBitmapMock;
  return createImageBitmapMock;
}

function bitmap(width: number, height: number): FakeBitmap {
  return { width, height, close: vi.fn() };
}

// JPEG SOI, PNG, GIF, RIFF/WEBP, TIFF(II), ISO-BMFF heic, ISO-BMFF avif, ISO-BMFF cr3 heads.
const HEADS: Record<string, number[]> = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0],
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  // ISO-BMFF: size(4) "ftyp" major-brand minor...
  heic: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // "ftyp" + "heic"
  heif: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31], // "ftyp" + "mif1"
  avif: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], // "ftyp" + "avif"
  cr3: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x63, 0x72, 0x78, 0x20], // "ftyp" + "crx "
  tiffLE: [0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0, 0, 0, 0, 0],
};

function fileWith(name: string, head: number[], type = ""): File {
  return new File([new Uint8Array(head)], name, { type });
}

beforeEach(() => {
  decodeHeicMock.mockReset();
  decodeAvifMock.mockReset();
  supportsNativeAvifDecodeMock.mockReset();
  decodeRawMock.mockReset();
});

afterEach(() => {
  delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
  createImageBitmapMock = null;
  vi.restoreAllMocks();
});

describe("decodeToImageSource routing", () => {
  it("routes JPEG through native createImageBitmap (not the HEIC/RAW decoders)", async () => {
    const probe = installImageBitmap(async () => bitmap(800, 600));
    const file = fileWith("Wedding (42).jpg", HEADS.jpeg, "image/jpeg");

    const result = await decodeToImageSource(file);

    expect(result).toMatchObject({ ok: true, width: 800, height: 600 });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0][0]).toBe(file);
    expect(decodeHeicMock).not.toHaveBeenCalled();
    expect(decodeAvifMock).not.toHaveBeenCalled();
    expect(decodeRawMock).not.toHaveBeenCalled();
  });

  it.each([
    ["photo.png", HEADS.png],
    ["loop.gif", HEADS.gif],
    ["delivery.webp", HEADS.webp],
  ])("routes %s through native createImageBitmap", async (name, head) => {
    const probe = installImageBitmap(async () => bitmap(10, 10));
    const result = await decodeToImageSource(fileWith(name, head));
    expect(result.ok).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(decodeHeicMock).not.toHaveBeenCalled();
  });

  it("routes HEIC through decodeHeic and wraps the bitmap", async () => {
    installImageBitmap(async () => bitmap(1, 1));
    decodeHeicMock.mockResolvedValueOnce(bitmap(4000, 3000));
    const file = fileWith("IMG_0001.heic", HEADS.heic, "image/heic");

    const result = await decodeToImageSource(file);

    expect(decodeHeicMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, width: 4000, height: 3000 });
  });

  it("routes HEIF (mif1 brand) through decodeHeic", async () => {
    decodeHeicMock.mockResolvedValueOnce(bitmap(12, 8));
    const result = await decodeToImageSource(fileWith("clip.heif", HEADS.heif));
    expect(decodeHeicMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, width: 12, height: 8 });
  });

  it("falls back to needs-desktop when decodeHeic throws (never throws itself)", async () => {
    decodeHeicMock.mockRejectedValueOnce(new Error("libheif blew up"));
    const result = await decodeToImageSource(fileWith("IMG_0001.heic", HEADS.heic));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs-desktop");
  });

  it("routes AVIF through native decodeAvif when supported", async () => {
    supportsNativeAvifDecodeMock.mockResolvedValueOnce(true);
    decodeAvifMock.mockResolvedValueOnce(bitmap(640, 480));
    const result = await decodeToImageSource(fileWith("hero.avif", HEADS.avif, "image/avif"));
    expect(supportsNativeAvifDecodeMock).toHaveBeenCalledTimes(1);
    expect(decodeAvifMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, width: 640, height: 480 });
  });

  it("routes AVIF to needs-desktop when native decode is unsupported", async () => {
    supportsNativeAvifDecodeMock.mockResolvedValueOnce(false);
    const result = await decodeToImageSource(fileWith("hero.avif", HEADS.avif));
    expect(decodeAvifMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs-desktop");
  });

  it("routes CR2 through decodeRaw with its extension", async () => {
    decodeRawMock.mockResolvedValueOnce(bitmap(5000, 3333));
    const file = fileWith("IMG_0001.CR2", HEADS.tiffLE);

    const result = await decodeToImageSource(file);

    expect(decodeRawMock).toHaveBeenCalledTimes(1);
    expect(decodeRawMock.mock.calls[0][0]).toBe(file);
    expect(decodeRawMock.mock.calls[0][1]).toBe("cr2");
    expect(result).toMatchObject({ ok: true, width: 5000, height: 3333 });
  });

  it.each(["a.nef", "b.arw", "c.dng", "d.orf", "e.raf", "f.rw2"])(
    "routes %s through decodeRaw",
    async (name) => {
      decodeRawMock.mockResolvedValueOnce(bitmap(100, 100));
      const result = await decodeToImageSource(fileWith(name, HEADS.tiffLE));
      expect(decodeRawMock).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    },
  );

  it("falls back to needs-desktop when decodeRaw returns null", async () => {
    decodeRawMock.mockResolvedValueOnce(null);
    const result = await decodeToImageSource(fileWith("IMG_0001.CR2", HEADS.tiffLE));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs-desktop");
  });

  it("routes CR3 to needs-desktop without calling decodeRaw", async () => {
    const result = await decodeToImageSource(fileWith("IMG_0001.CR3", HEADS.cr3));
    expect(decodeRawMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs-desktop");
  });

  it("routes unknown/exotic formats to needs-desktop", async () => {
    const result = await decodeToImageSource(fileWith("scan.x3f", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs-desktop");
  });

  it("never throws even when createImageBitmap rejects on the native path", async () => {
    installImageBitmap(async () => {
      throw new Error("decode error");
    });
    const result = await decodeToImageSource(fileWith("Wedding (42).jpg", HEADS.jpeg));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("needs-desktop");
  });

  it("disambiguates HEIC vs AVIF by magic brand when extension is absent", async () => {
    decodeHeicMock.mockResolvedValueOnce(bitmap(2, 2));
    const noExtHeic = new File([new Uint8Array(HEADS.heic)], "blob", { type: "" });
    const result = await decodeToImageSource(noExtHeic);
    expect(decodeHeicMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});
