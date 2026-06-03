import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The HEIC WASM decoder is mocked so the test never instantiates the real
// libheif Emscripten module. We assert decodeHeicBuffer surfaces exactly what
// `heic-decode` returns, and that decodeHeic shapes it into an ImageBitmap.
const heicDecodeMock = vi.fn(
  async (_input: { buffer: Uint8Array | ArrayBuffer }) => ({
    width: 2,
    height: 2,
    data: new Uint8ClampedArray(2 * 2 * 4),
  }),
);
vi.mock("heic-decode", () => ({
  default: heicDecodeMock,
}));

import {
  __resetHeicDecoderCacheForTests,
  decodeAvif,
  decodeHeic,
  decodeHeicBuffer,
  supportsNativeAvifDecode,
} from "../heic";

type CapturedImageData = { data: Uint8ClampedArray; width: number; height: number };

type FakeBitmap = { width: number; height: number; close: ReturnType<typeof vi.fn> };

let imageDataInputs: CapturedImageData[] = [];
let createImageBitmapMock: ReturnType<typeof vi.fn> | null = null;

// jsdom implements neither ImageData nor createImageBitmap. Install structural
// stand-ins that capture their inputs and hand back an ImageBitmap-shaped fake.
function installImageBitmap(
  impl: (source: unknown) => Promise<FakeBitmap>,
): ReturnType<typeof vi.fn> {
  createImageBitmapMock = vi.fn(impl);
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap =
    createImageBitmapMock;
  return createImageBitmapMock;
}

function installImageData() {
  class FakeImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
      imageDataInputs.push({ data, width, height });
    }
  }
  (globalThis as unknown as { ImageData: unknown }).ImageData = FakeImageData;
}

function bitmap(width: number, height: number): FakeBitmap {
  return { width, height, close: vi.fn() };
}

function fileFromBytes(bytes: number[], type: string): File {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  return new File([blob], "sample", { type });
}

beforeEach(() => {
  __resetHeicDecoderCacheForTests();
  heicDecodeMock.mockClear();
  imageDataInputs = [];
  installImageData();
});

afterEach(() => {
  delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
  delete (globalThis as unknown as { ImageData?: unknown }).ImageData;
  createImageBitmapMock = null;
  vi.restoreAllMocks();
});

describe("decodeHeicBuffer", () => {
  it("returns the decoded {data,width,height} from heic-decode", async () => {
    const buffer = new ArrayBuffer(8);
    const result = await decodeHeicBuffer(buffer);

    expect(heicDecodeMock).toHaveBeenCalledTimes(1);
    // heic-decode brand-sniffs by spreading bytes, so it must get a Uint8Array
    // view over the buffer, not the raw ArrayBuffer.
    const passed = heicDecodeMock.mock.calls[0][0];
    expect(passed.buffer).toBeInstanceOf(Uint8Array);
    expect((passed.buffer as Uint8Array).buffer).toBe(buffer);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result.data.length).toBe(2 * 2 * 4);
  });

  it("throws a typed error when the decoder rejects", async () => {
    heicDecodeMock.mockRejectedValueOnce(new Error("corrupt heic"));
    await expect(decodeHeicBuffer(new ArrayBuffer(4))).rejects.toThrow(
      /HEIC decode failed/i,
    );
  });

  it("throws when the decoder yields no pixel data", async () => {
    heicDecodeMock.mockResolvedValueOnce({
      width: 0,
      height: 0,
      data: undefined as unknown as Uint8ClampedArray<ArrayBuffer>,
    });
    await expect(decodeHeicBuffer(new ArrayBuffer(4))).rejects.toThrow(
      /HEIC decode failed/i,
    );
  });
});

describe("decodeHeic", () => {
  it("builds ImageData of the decoded dimensions and returns the bitmap", async () => {
    const probe = installImageBitmap(async () => bitmap(2, 2));
    const file = fileFromBytes([0, 0, 0, 0], "image/heic");

    const result = await decodeHeic(file);

    expect(heicDecodeMock).toHaveBeenCalledTimes(1);
    // ImageData constructed with the decoded dims and a fresh clamped array.
    expect(imageDataInputs).toHaveLength(1);
    expect(imageDataInputs[0].width).toBe(2);
    expect(imageDataInputs[0].height).toBe(2);
    expect(imageDataInputs[0].data).toBeInstanceOf(Uint8ClampedArray);
    expect(imageDataInputs[0].data.length).toBe(2 * 2 * 4);
    // The created bitmap is returned unchanged.
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it("propagates a decode failure as an error", async () => {
    installImageBitmap(async () => bitmap(2, 2));
    heicDecodeMock.mockRejectedValueOnce(new Error("boom"));
    const file = fileFromBytes([0, 0, 0, 0], "image/heic");

    await expect(decodeHeic(file)).rejects.toThrow(/HEIC decode failed/i);
  });
});

describe("supportsNativeAvifDecode", () => {
  it("returns true when the AVIF probe decodes to a non-empty bitmap", async () => {
    const probe = installImageBitmap(async () => bitmap(1, 1));
    await expect(supportsNativeAvifDecode()).resolves.toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("returns false when the AVIF probe rejects (unsupported)", async () => {
    installImageBitmap(async () => {
      throw new Error("unsupported format");
    });
    await expect(supportsNativeAvifDecode()).resolves.toBe(false);
  });

  it("returns false when the probe resolves to a zero-width bitmap", async () => {
    installImageBitmap(async () => bitmap(0, 0));
    await expect(supportsNativeAvifDecode()).resolves.toBe(false);
  });

  it("returns false when createImageBitmap is unavailable (non-DOM)", async () => {
    delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
    await expect(supportsNativeAvifDecode()).resolves.toBe(false);
  });

  it("caches the detection so the probe runs only once", async () => {
    const probe = installImageBitmap(async () => bitmap(1, 1));

    await supportsNativeAvifDecode();
    await supportsNativeAvifDecode();
    await supportsNativeAvifDecode();

    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe("decodeAvif", () => {
  it("decodes the file natively via createImageBitmap", async () => {
    const probe = installImageBitmap(async () => bitmap(640, 480));
    const file = fileFromBytes([0, 0, 0, 0], "image/avif");

    const result = await decodeAvif(file);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe.mock.calls[0][0]).toBe(file);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it("throws when native AVIF decode is unavailable", async () => {
    delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
    const file = fileFromBytes([0, 0, 0, 0], "image/avif");
    await expect(decodeAvif(file)).rejects.toThrow(/AVIF decode/i);
  });
});
