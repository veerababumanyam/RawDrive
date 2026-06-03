import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The WASM fallback is mocked so the test never instantiates the real
// Emscripten module. We assert it is ONLY reached on the fallback path.
const webpEncodeMock = vi.fn(
  async (_data: ImageData, _options?: { quality?: number }) => new Uint8Array([1, 2, 3]).buffer,
);
vi.mock("@jsquash/webp", () => ({
  encode: webpEncodeMock,
}));

import {
  __resetWebPEncoderCacheForTests,
  encodeCanvasToWebP,
  supportsNativeWebPEncode,
} from "../webp-encoder";

type ToBlobImpl = (
  callback: BlobCallback,
  type?: string,
  quality?: number,
) => void;

let toBlobSpy: ReturnType<typeof vi.spyOn> | null = null;

function stubToBlob(impl: ToBlobImpl) {
  toBlobSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(impl as unknown as HTMLCanvasElement["toBlob"]);
  return toBlobSpy;
}

// jsdom's getContext returns null by default, so a real getImageData call
// would throw. We stub the 2D context the encoder needs for both paths.
function stubGetContext(imageData: ImageData) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => imageData),
    })) as unknown as HTMLCanvasElement["getContext"]);
}

function makeCanvas(width = 64, height = 48): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fakeImageData(width: number, height: number): ImageData {
  // jsdom does not implement ImageData; supply a structural stand-in.
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: "srgb",
  } as unknown as ImageData;
}

beforeEach(() => {
  __resetWebPEncoderCacheForTests();
  webpEncodeMock.mockClear();
});

afterEach(() => {
  toBlobSpy?.mockRestore();
  toBlobSpy = null;
  vi.restoreAllMocks();
});

describe("supportsNativeWebPEncode", () => {
  it("reports true when toBlob yields an image/webp blob", async () => {
    stubToBlob((cb) => cb(new Blob(["webp"], { type: "image/webp" })));
    await expect(supportsNativeWebPEncode()).resolves.toBe(true);
  });

  it("reports false when toBlob yields null", async () => {
    stubToBlob((cb) => cb(null));
    await expect(supportsNativeWebPEncode()).resolves.toBe(false);
  });

  it("reports false when toBlob falls back to a non-webp blob (Safari)", async () => {
    stubToBlob((cb) => cb(new Blob(["png"], { type: "image/png" })));
    await expect(supportsNativeWebPEncode()).resolves.toBe(false);
  });

  it("caches the detection so the probe runs only once", async () => {
    const probe = stubToBlob((cb) =>
      cb(new Blob(["webp"], { type: "image/webp" })),
    );

    await supportsNativeWebPEncode();
    await supportsNativeWebPEncode();
    await supportsNativeWebPEncode();

    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe("encodeCanvasToWebP — native fast path", () => {
  it("returns the native webp blob and never touches the WASM encoder", async () => {
    const nativeBlob = new Blob(["native"], { type: "image/webp" });
    stubToBlob((cb, type, quality) => {
      // Probe (1x1) and the real encode both run through here.
      expect(type).toBe("image/webp");
      expect(typeof quality).toBe("number");
      cb(nativeBlob);
    });

    const result = await encodeCanvasToWebP(makeCanvas(), 0.82);

    expect(result).toBe(nativeBlob);
    expect(result.type).toBe("image/webp");
    expect(webpEncodeMock).not.toHaveBeenCalled();
  });

  it("forwards the requested quality to canvas.toBlob on the native path", async () => {
    const native = new Blob(["native"], { type: "image/webp" });
    stubToBlob((cb) => cb(native));

    await encodeCanvasToWebP(makeCanvas(), 0.5);

    // First call is the 1x1 probe, second is the real encode.
    expect(toBlobSpy).toHaveBeenCalledTimes(2);
    const realCall = toBlobSpy!.mock.calls[1];
    expect(realCall[1]).toBe("image/webp");
    expect(realCall[2]).toBe(0.5);
    expect(webpEncodeMock).not.toHaveBeenCalled();
  });
});

describe("encodeCanvasToWebP — WASM fallback (Safari/iOS)", () => {
  it("uses @jsquash/webp when native webp encode is unavailable (null blob)", async () => {
    stubToBlob((cb) => cb(null));
    stubGetContext(fakeImageData(64, 48));

    const result = await encodeCanvasToWebP(makeCanvas(64, 48), 0.86);

    expect(webpEncodeMock).toHaveBeenCalledTimes(1);
    // quality maps 0..1 -> 0..100
    expect(webpEncodeMock.mock.calls[0][1]).toMatchObject({ quality: 86 });
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("image/webp");
  });

  it("uses @jsquash/webp when native encode produces a non-webp blob", async () => {
    stubToBlob((cb) => cb(new Blob(["png"], { type: "image/png" })));
    stubGetContext(fakeImageData(10, 10));

    const result = await encodeCanvasToWebP(makeCanvas(10, 10), 0.8);

    expect(webpEncodeMock).toHaveBeenCalledTimes(1);
    expect(result.type).toBe("image/webp");
  });

  it("detects capability once even across many fallback encodes", async () => {
    const probe = stubToBlob((cb) => cb(null));
    stubGetContext(fakeImageData(8, 8));

    await encodeCanvasToWebP(makeCanvas(8, 8), 0.8);
    await encodeCanvasToWebP(makeCanvas(8, 8), 0.8);

    // toBlob is the feature-detect probe; it must only run for the 1x1 probe,
    // which is cached after the first call.
    expect(probe).toHaveBeenCalledTimes(1);
    expect(webpEncodeMock).toHaveBeenCalledTimes(2);
  });
});
