// Canvas-to-WebP encoder with a lazy WASM fallback.
//
// WHY THIS EXISTS: the E2EE upload pipeline produces every display/thumbnail
// derivative by drawing onto a <canvas> and calling
// `canvas.toBlob(cb, "image/webp", quality)`. Chromium and Firefox honor the
// "image/webp" MIME type, but Safari / iOS (all versions through 2026) ignore
// it for `toBlob`/`toDataURL` — they silently hand back a PNG blob (or null).
// That made WebP derivative generation fail silently on every iPhone.
//
// This module keeps the native fast path UNCHANGED on browsers that can encode
// WebP natively, and only on browsers that cannot does it lazily import the
// `@jsquash/webp` WASM encoder. The WASM module is dynamically imported so it
// never lands in the main bundle for the (vast) majority of clients that take
// the native path.

let nativeWebPSupport: Promise<boolean> | null = null;

/**
 * Detects — once, then caches — whether `canvas.toBlob(cb, "image/webp", q)`
 * actually produces a WebP blob in this browser.
 *
 * Safari/iOS resolve the callback with a PNG blob (or `null`) for the
 * "image/webp" type, so a truthful detection must inspect the resulting
 * blob's MIME type rather than just trusting the call to succeed.
 *
 * The detection promise is memoized on the module, so the 1×1 probe canvas is
 * encoded at most once per page lifetime no matter how many derivatives are
 * generated.
 */
export function supportsNativeWebPEncode(): Promise<boolean> {
  if (nativeWebPSupport === null) {
    nativeWebPSupport = probeNativeWebPEncode();
  }
  return nativeWebPSupport;
}

function probeNativeWebPEncode(): Promise<boolean> {
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    return Promise.resolve(false);
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
  } catch {
    return Promise.resolve(false);
  }

  if (typeof canvas.toBlob !== "function") {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    try {
      canvas.toBlob(
        (blob) => {
          resolve(blob !== null && blob.type === "image/webp");
        },
        "image/webp",
        0.8,
      );
    } catch {
      resolve(false);
    }
  });
}

/**
 * Encodes the current contents of `canvas` to a WebP `Blob`.
 *
 * Fast path (Chromium/Firefox): uses the browser's native
 * `canvas.toBlob(cb, "image/webp", quality)` — behaviorally identical to the
 * pre-existing pipeline.
 *
 * Fallback (Safari/iOS): reads the canvas's `ImageData` and encodes it with
 * the lazily-imported `@jsquash/webp` WASM encoder.
 *
 * @param quality 0..1 quality, matching the `canvas.toBlob` convention.
 */
export async function encodeCanvasToWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  if (await supportsNativeWebPEncode()) {
    const native = await encodeNative(canvas, quality);
    if (native) return native;
    // Extremely defensive: capability said yes but this canvas produced no
    // blob. Fall through to the WASM path rather than failing the upload.
  }
  return encodeWithWasm(canvas, quality);
}

function encodeNative(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/webp", quality);
    } catch {
      resolve(null);
    }
  });
}

async function encodeWithWasm(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("WebP fallback unavailable: canvas 2D context missing");
  }
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const { encode } = await import("@jsquash/webp");
  const encoded = await encode(imageData, { quality: Math.round(clamp01(quality) * 100) });

  return new Blob([encoded], { type: "image/webp" });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Test-only: clears the memoized native-encode detection so each test can
 * exercise a fresh native/fallback decision. Not used in production code.
 */
export function __resetWebPEncoderCacheForTests(): void {
  nativeWebPSupport = null;
}
