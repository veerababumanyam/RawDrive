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
    for (const spec of DERIVATIVE_SPECS) {
      const { width, height } = fitWithin(decoded.width, decoded.height, spec.maxWidth, spec.maxHeight);
      const webp = await renderWebP(decoded.source, width, height, spec.quality);
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
      derivatives: out,
    };
  } finally {
    decoded.close?.();
  }
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
