// Client-side HEIC/HEIF + AVIF decoders for the E2EE upload pipeline.
//
// WHY THIS EXISTS: gallery uploads are unconditionally end-to-end encrypted —
// the browser generates WebP derivatives then encrypts them at source
// (`webp-derivatives.ts`), so the server never sees plaintext. A <canvas>
// cannot decode HEIC/HEIF, so those formats were blocked with a "use RawDrive
// Desktop" message. This module decodes HEIC/HEIF in-browser (via the libheif
// WASM build behind `heic-decode`) and AVIF natively, producing an
// `ImageBitmap` the existing derivative pipeline consumes unchanged. CD4 wires
// these into the `decodeImage` seam; this module only provides the decoders.
//
// LAZY WASM (load-bearing): `heic-decode` (which pulls in `libheif-js`, ~2MB of
// WASM) MUST stay out of the main bundle. It is reachable ONLY via the dynamic
// `await import("heic-decode")` inside `decodeHeicBuffer` — never a static
// top-level import. Keep it that way; a static import would bundle libheif for
// every client regardless of whether they ever upload a HEIC.
//
// WORKER-AGNOSTIC CORE: `decodeHeicBuffer` is a pure `ArrayBuffer -> pixels`
// function with no DOM dependency, deliberately separated from `decodeHeic`
// (which touches `ImageData`/`createImageBitmap`). This lets the heavy decode
// be moved into a Web Worker later (a documented follow-up optimization)
// without changing its contract. v1 runs it on the main thread, consistent
// with the existing main-thread derivative pipeline.

/** ImageData-shaped pixel buffer returned by the worker-agnostic decode core. */
export type DecodedPixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

class HeicDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HeicDecodeError";
  }
}

class AvifDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AvifDecodeError";
  }
}

/**
 * Worker-agnostic HEIC/HEIF decode core: decodes the primary image of a
 * HEIC/HEIF container to raw RGBA pixels. Has no DOM dependency, so it can run
 * on the main thread (v1) or inside a Web Worker (future optimization).
 *
 * `heic-decode`'s default export returns the container's PRIMARY image, which
 * is exactly what we want for multi-image HEIC and Live Photos (the still
 * frame). We prefer it over `decode.all()[0]` — it is already frame 0.
 *
 * The `heic-decode` / `libheif-js` modules are imported lazily here so the
 * WASM never lands in the main bundle.
 */
export async function decodeHeicBuffer(buffer: ArrayBuffer): Promise<DecodedPixels> {
  let decoded: { width: number; height: number; data: Uint8ClampedArray | ArrayBufferLike };
  try {
    const { default: decode } = await import("heic-decode");
    // `heic-decode` brand-sniffs the input with `buffer.slice(8,12)` then
    // spreads the result into `String.fromCharCode(...)`, so it must receive an
    // (iterable) Uint8Array view, NOT a raw ArrayBuffer.
    decoded = await decode({ buffer: new Uint8Array(buffer) });
  } catch (cause) {
    throw new HeicDecodeError("HEIC decode failed: unable to decode image", { cause });
  }

  const { width, height, data } = decoded;
  if (!data || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new HeicDecodeError("HEIC decode failed: decoder returned no usable pixel data");
  }

  // Normalize to a Uint8ClampedArray without copying when already correct.
  const pixels =
    data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data as ArrayBufferLike);

  return { data: pixels, width, height };
}

/**
 * Decodes a HEIC/HEIF `File`/`Blob` into an `ImageBitmap` the derivative
 * pipeline can draw onto a canvas. Browser-only: relies on `ImageData` and
 * `createImageBitmap` (tests stub both).
 */
export async function decodeHeic(file: File | Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function" || typeof ImageData === "undefined") {
    throw new HeicDecodeError(
      "HEIC decode failed: this environment cannot build an ImageBitmap",
    );
  }

  const buffer = await file.arrayBuffer();
  const { data, width, height } = await decodeHeicBuffer(buffer);

  // Copy into a fresh clamped array so the ImageData owns its backing buffer
  // (the decoder may hand back a view over a shared/transferable buffer).
  const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
  return createImageBitmap(imageData);
}

// A 1×1 transparent AVIF, base64-encoded. Used purely as a feature-detect
// probe for native AVIF decode support (Safari 16.4+, Chrome, Firefox decode
// AVIF; older engines do not). Decoding bytes, not trusting `file.type`, is the
// only reliable detection.
const AVIF_PROBE_BASE64 =
  "AAAAHGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZgAAAPFtZXRhAAAAAAAAAChoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAEVAAAAGwAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAI21kYXQSAAoIGAANCBAAAAAhSAAEAAAAAQ0EAAAAAA==";

let avifSupport: Promise<boolean> | null = null;

/**
 * Detects — once, then caches — whether this browser can natively decode AVIF
 * via `createImageBitmap`. The detection decodes a tiny 1×1 AVIF probe; support
 * is true only if it resolves to a bitmap with a positive width.
 *
 * Guards non-DOM environments (no `createImageBitmap`) to `false`. The promise
 * is memoized on the module so the probe decodes at most once per page lifetime.
 */
export function supportsNativeAvifDecode(): Promise<boolean> {
  if (avifSupport === null) {
    avifSupport = probeNativeAvifDecode();
  }
  return avifSupport;
}

async function probeNativeAvifDecode(): Promise<boolean> {
  if (typeof createImageBitmap !== "function" || typeof Blob === "undefined") {
    return false;
  }
  try {
    const blob = new Blob([base64ToBytes(AVIF_PROBE_BASE64)], { type: "image/avif" });
    const bitmap = await createImageBitmap(blob);
    const ok = bitmap.width > 0;
    bitmap.close?.();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Decodes an AVIF `File`/`Blob` into an `ImageBitmap` natively. Callers should
 * gate on `supportsNativeAvifDecode()` first and fall back to RawDrive Desktop
 * when it is false (CD4 wires that routing). Throws if native decode is
 * unavailable or fails.
 */
export async function decodeAvif(file: File | Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new AvifDecodeError("AVIF decode unavailable: createImageBitmap missing");
  }
  try {
    return await createImageBitmap(file);
  } catch (cause) {
    throw new AvifDecodeError("AVIF decode failed", { cause });
  }
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : // Node/SSR fallback (e.g. tests, prerender) where `atob` is absent.
        Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Test-only: clears the memoized AVIF feature-detect so each test exercises a
 * fresh native/fallback decision. Not used in production code.
 */
export function __resetHeicDecoderCacheForTests(): void {
  avifSupport = null;
}
