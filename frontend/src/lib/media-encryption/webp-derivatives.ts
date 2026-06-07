import { decodeToImageSource } from "./decode-to-image-source";
import { encryptBlob, type MediaEncryptionManifest } from "./media-crypto";
import { encodeCanvasToWebP } from "./webp-encoder";

/**
 * Thrown by `decodeImage` when a file cannot be decoded in-browser (HEIC/RAW
 * engine failure, CR3/exotic RAW, corrupt input, or an unsupported browser).
 * `createEncryptedWebPDerivativeSet` rejects with it, and `use-upload`'s catch
 * routes the file to the existing `needs_desktop` status. Carries the router's
 * `detail` so operators see WHY a specific file fell back.
 */
export class NeedsDesktopDecodeError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "NeedsDesktopDecodeError";
  }
}

export type EncryptedDerivative = {
  variant: "thumb_sm_webp" | "thumb_md_webp" | "thumb_lg_webp" | "display_webp";
  width: number;
  height: number;
  ciphertext: Blob;
  manifest: MediaEncryptionManifest;
};

export type EncryptedDerivativeSet = {
  source: {
    width: number;
    height: number;
  };
  // Plain display-sized WebP frame used only for face indexing. The caller
  // sends it immediately to the authenticated face-index endpoint; it is not
  // stored as gallery media and is derived from the same decoded source as the
  // encrypted display derivative, so upload does not decode the file twice.
  faceIndexImage?: {
    blob: Blob;
    width: number;
    height: number;
  };
  derivatives: EncryptedDerivative[];
};

const DERIVATIVE_SPECS: Array<{
  variant: EncryptedDerivative["variant"];
  maxWidth: number;
  maxHeight: number;
  quality: number;
}> = [
  { variant: "thumb_sm_webp", maxWidth: 200, maxHeight: 200, quality: 0.78 },
  { variant: "thumb_md_webp", maxWidth: 600, maxHeight: 600, quality: 0.8 },
  { variant: "thumb_lg_webp", maxWidth: 1200, maxHeight: 1200, quality: 0.82 },
  { variant: "display_webp", maxWidth: 2400, maxHeight: 2400, quality: 0.86 },
];

// The face-index endpoint caps the multipart body at 10MB
// (backend handler `maxFaceIndexImageBody = 10 << 20`). A blind 2400px
// display_webp can exceed that on dense, high-detail frames — in prod the
// over-cap body triggers a MaxBytesReader reset (nginx 502), not a clean 413,
// so the upload silently no-indexed. We pick the face-index frame BELOW this
// cap before the first POST. The budget is well under 10MB so the multipart
// envelope (form boundary + headers) still fits comfortably.
export const FACE_INDEX_MAX_BYTES = 9 * 1024 * 1024;

// Progressive shrink ladder applied to the SAME already-decoded source if the
// display-sized frame is over the cap. Each step re-renders from the decoded
// pixels we already hold (no re-fetch, no re-decode of the file). Ordered
// largest → smallest; the first frame under the cap wins.
const FACE_INDEX_FALLBACK_STEPS: Array<{ maxEdge: number; quality: number }> = [
  { maxEdge: 2400, quality: 0.8 },
  { maxEdge: 1600, quality: 0.8 },
  { maxEdge: 1200, quality: 0.78 },
  { maxEdge: 1000, quality: 0.75 },
];

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

export async function createEncryptedWebPDerivatives(
  file: File,
  key: CryptoKey,
  keyId: string,
): Promise<EncryptedDerivative[]> {
  const result = await createEncryptedWebPDerivativeSet(file, key, keyId);
  return result.derivatives;
}

export async function createEncryptedWebPDerivativeSet(
  file: File,
  key: CryptoKey,
  keyId: string,
): Promise<EncryptedDerivativeSet> {
  const decoded = await decodeImage(file);
  try {
    const out: EncryptedDerivative[] = [];
    let faceIndexImage: EncryptedDerivativeSet["faceIndexImage"];
    for (const spec of DERIVATIVE_SPECS) {
      const { width, height } = fitWithin(decoded.width, decoded.height, spec.maxWidth, spec.maxHeight);
      const webp = await renderWebP(decoded.source, width, height, spec.quality);
      if (spec.variant === "display_webp") {
        // Proactively pick a face-index frame UNDER the server's 10MB cap. The
        // display_webp is the starting candidate (already rendered above, so no
        // extra decode); if it is over budget we shrink from the SAME decoded
        // source until it fits, rather than blindly shipping the 2400px frame
        // and relying on a server reject + downscale-retry round trip.
        faceIndexImage =
          webp.size <= FACE_INDEX_MAX_BYTES
            ? { blob: webp, width, height }
            : await buildCappedFaceIndexFrame(decoded);
      }
      const encrypted = await encryptBlob(webp, {
        key,
        keyId,
        objectType: spec.variant,
        contentType: "image/webp",
      });
      out.push({
        variant: spec.variant,
        width,
        height,
        ciphertext: encrypted.ciphertext,
        manifest: encrypted.manifest,
      });
    }
    return {
      source: {
        width: decoded.width,
        height: decoded.height,
      },
      faceIndexImage,
      derivatives: out,
    };
  } finally {
    decoded.close?.();
  }
}

// buildCappedFaceIndexFrame walks the progressive shrink ladder against the
// already-decoded source and returns the first WebP frame that fits under the
// face-index body cap. Every step re-renders from the decoded pixels we already
// hold — no re-fetch of the file and no second decode (perf hot-path law: no
// double full-file reads). If even the smallest step is still over the cap we
// return it anyway: a too-big frame that the server may still reject is strictly
// better than shipping the full 2400px frame, and the browser retry classifier
// will fall back to a smaller stored derivative from there.
async function buildCappedFaceIndexFrame(
  decoded: DecodedImage,
): Promise<EncryptedDerivativeSet["faceIndexImage"]> {
  let last: { blob: Blob; width: number; height: number } | undefined;
  for (const step of FACE_INDEX_FALLBACK_STEPS) {
    const { width, height } = fitWithin(
      decoded.width,
      decoded.height,
      step.maxEdge,
      step.maxEdge,
    );
    const blob = await renderWebP(decoded.source, width, height, step.quality);
    last = { blob, width, height };
    if (blob.size <= FACE_INDEX_MAX_BYTES) return last;
  }
  return last;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  // CD4: route by format. jpeg/png/gif/webp resolve through the router's native
  // path — the SAME `createImageBitmap(file)` call (and same `{source,width,
  // height,close}` shape) used before; HEIC/HEIF/AVIF/RAW go through their
  // dedicated decoders. Anything the browser cannot decode collapses to an
  // `{ok:false}` result, which we surface to callers as a typed
  // NeedsDesktopDecodeError so `use-upload` flags the file "needs desktop".
  const decoded = await decodeToImageSource(file);
  if (decoded.ok) {
    return {
      source: decoded.source,
      width: decoded.width,
      height: decoded.height,
      close: decoded.close,
    };
  }

  // Legacy non-`createImageBitmap` environments (older SSR/prerender) kept a
  // <img>-based fallback for the native path. Preserve it ONLY when the router
  // bailed because `createImageBitmap` is missing — never for unsupported
  // formats, which must throw to reach the needs-desktop path.
  if (typeof createImageBitmap !== "function" && typeof URL?.createObjectURL === "function") {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight };
    } catch {
      // fall through to the typed error below
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  throw new NeedsDesktopDecodeError(decoded.detail);
}

function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function renderWebP(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas rendering unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  // Encode through encodeCanvasToWebP: native canvas.toBlob fast path on
  // Chromium/Firefox, lazy @jsquash/webp WASM fallback on Safari/iOS where
  // canvas.toBlob ignores the "image/webp" type.
  return encodeCanvasToWebP(canvas, quality);
}
