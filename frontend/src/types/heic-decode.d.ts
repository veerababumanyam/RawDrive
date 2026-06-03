// Minimal type shim for `heic-decode` (no bundled types, no @types package).
//
// The package's default export decodes the PRIMARY image of a HEIC/HEIF
// container to raw RGBA pixels; `.all` returns one descriptor per image (for
// multi-image HEIC / Live Photos), each lazily decodable via `.decode()`.
// Source: node_modules/heic-decode/lib.js. Kept intentionally narrow — we only
// consume the default (primary-image) decode in `decoders/heic.ts`.
declare module "heic-decode" {
  /** A HEIC source buffer. `heic-decode` brand-sniffs by spreading bytes, so
   * it requires an (iterable) typed-array view, not a raw ArrayBuffer. */
  type HeicInput = { buffer: Uint8Array | ArrayBufferLike };

  type DecodedImage = {
    width: number;
    height: number;
    data: Uint8ClampedArray<ArrayBuffer>;
  };

  type ImageDescriptor = {
    width: number;
    height: number;
    decode: () => Promise<DecodedImage>;
  };

  /** Decodes the primary image of the container. */
  const decode: {
    (input: HeicInput): Promise<DecodedImage>;
    /** Decodes the container into per-image descriptors (multi-image/Live Photo). */
    all: (input: HeicInput) => Promise<ImageDescriptor[]>;
  };

  export default decode;
}
