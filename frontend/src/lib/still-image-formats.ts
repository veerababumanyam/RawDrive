export const BROWSER_DECODE_STILL_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/jfif",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
  "image/gif",
  // CD4: now decoded in-browser. HEIC/HEIF via the libheif WASM decoder, AVIF
  // natively (gated on feature-detect), camera RAW via embedded-JPEG-preview
  // extraction. The raw `image/x-*` MIME aliases for these families are matched
  // by extension (the `image/x-*` block in browser-upload-support narrows
  // around the BROWSER_DECODE extension check), so they are not listed here.
  "image/heic",
  "image/heif",
  "image/hif",
  "image/avif",
] as const;

export const BROWSER_DECODE_STILL_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "jfi",
  "png",
  "webp",
  "gif",
  // CD4/CD5c: HEIC/HEIF/AVIF + camera RAW whose embedded preview the browser
  // decoders can extract — TIFF-based RAW from common camera families, RAF
  // (Fuji), and CR3 (Canon, via the ISO-BMFF box parser). Exotic RAW and
  // ambiguous TIFF/generic .raw stay desktop-only below.
  "heic",
  "heif",
  "hif",
  "avif",
  "cr2",
  "cr3",
  "nef",
  "nrw",
  "arw",
  "sr2",
  "srf",
  "dng",
  "orf",
  "ori",
  "raf",
  "rw2",
  "pef",
  "3fr",
  "iiq",
] as const;

export const DESKTOP_REQUIRED_STILL_IMAGE_MIME_TYPES = [
  "image/tiff",
  "image/tif",
  "image/x-tiff",
] as const;

// CD4/CD5c: common preview-bearing camera RAW + heic/heif/hif/avif moved to
// the BROWSER_DECODE sets above. Everything below stays desktop-only: exotic /
// proprietary RAW the browser decoders cannot parse, ambiguous generic .raw,
// and multi-page / non-baseline TIFF.
export const DESKTOP_REQUIRED_STILL_IMAGE_EXTENSIONS = [
  "ari",
  "arq",
  "bay",
  "bmq",
  "cap",
  "cine",
  "crw",
  "cs1",
  "dcr",
  "dc2",
  "erf",
  "fff",
  "gpr",
  "ia",
  "k25",
  "kc2",
  "kdc",
  "mdc",
  "mef",
  "mos",
  "mrw",
  "pxn",
  "qtk",
  "r3d",
  "raw",
  "rdc",
  "rw1",
  "rwl",
  "rwz",
  "srw",
  "sti",
  "tif",
  "tiff",
  "x3f",
] as const;

// CD4: the OS file picker must still surface browser-decodable RAW/HEIC files.
// `image/*` covers the HEIC/HEIF/AVIF MIME types, but camera RAW reports an
// empty or `image/x-*` MIME the picker's `image/*` glob won't match — so the
// now-browser-decodable RAW extensions are listed explicitly alongside the
// desktop-only ones. Duplicates between the two sets are de-duped.
export const FILE_PICKER_STILL_IMAGE_ACCEPT = Array.from(
  new Set<string>([
    "image/*",
    ...BROWSER_DECODE_STILL_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
    ...DESKTOP_REQUIRED_STILL_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
  ]),
).join(",");

export const STILL_IMAGE_DROPZONE_ACCEPT: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg", ".jpe", ".jfif", ".jfi"],
  "image/jfif": [".jfif", ".jfi"],
  "image/png": [".png"],
  "image/tiff": [".tiff", ".tif"],
  "image/x-tiff": [".tiff", ".tif"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "image/heic": [".heic", ".heif", ".hif"],
  "image/heif": [".heif", ".hif"],
  "image/hif": [".hif"],
  "image/avif": [".avif"],
  "image/x-canon-cr2": [".cr2"],
  "image/x-canon-cr3": [".cr3"],
  "image/x-canon-crw": [".crw"],
  "image/x-canon-raw": [".crw", ".cr2", ".cr3"],
  "image/x-nikon-nef": [".nef"],
  "image/x-nikon-nrw": [".nrw"],
  "image/x-sony-arq": [".arq"],
  "image/x-sony-arw": [".arw"],
  "image/x-sony-sr2": [".sr2"],
  "image/x-sony-srf": [".srf"],
  "image/x-adobe-dng": [".dng"],
  "image/x-dng": [".dng"],
  "image/x-gopro-gpr": [".gpr"],
  "image/x-fuji-raf": [".raf"],
  "image/x-fujifilm-raf": [".raf"],
  "image/x-olympus-orf": [".orf", ".ori"],
  "image/x-olympus-ori": [".ori"],
  "image/x-panasonic-raw": [".raw"],
  "image/x-panasonic-rw2": [".rw2"],
  "image/x-leica-rwl": [".rwl"],
  "image/x-pentax-pef": [".pef"],
  "image/x-samsung-srw": [".srw"],
  "image/x-sigma-x3f": [".x3f"],
  "image/x-hasselblad-3fr": [".3fr"],
  "image/x-hasselblad-fff": [".fff"],
  "image/x-phaseone-iiq": [".iiq"],
  "image/x-kodak-dcr": [".dcr"],
  "image/x-kodak-dc2": [".dc2"],
  "image/x-kodak-k25": [".k25"],
  "image/x-kodak-kdc": [".kdc"],
  "image/x-mamiya-mdc": [".mdc"],
  "image/x-mamiya-mef": [".mef"],
  "image/x-minolta-mrw": [".mrw"],
  "image/x-leaf-mos": [".mos"],
  "image/x-epson-erf": [".erf"],
  "image/x-casio-bay": [".bay"],
  "image/x-arriflex-ari": [".ari"],
  "image/x-redcode-r3d": [".r3d"],
  "image/x-raw": [
    ".raw",
    ".bay",
    ".bmq",
    ".cap",
    ".cine",
    ".cs1",
    ".ia",
    ".kc2",
    ".pxn",
    ".qtk",
    ".rdc",
    ".rw1",
    ".sti",
  ],
};

const browserDecodeExtensionSet = new Set<string>(
  BROWSER_DECODE_STILL_IMAGE_EXTENSIONS,
);
const desktopRequiredExtensionSet = new Set<string>(
  DESKTOP_REQUIRED_STILL_IMAGE_EXTENSIONS,
);

export function isBrowserDecodableStillImageName(name: string): boolean {
  const ext = extensionOf(name);
  return ext !== "" && browserDecodeExtensionSet.has(ext);
}

export function isDesktopRequiredStillImageName(name: string): boolean {
  const ext = extensionOf(name);
  return ext !== "" && desktopRequiredExtensionSet.has(ext);
}

export function isAcceptedStillImageFile(
  file: Pick<File, "name" | "type">,
): boolean {
  return (
    file.type.startsWith("image/") ||
    isBrowserDecodableStillImageName(file.name) ||
    isDesktopRequiredStillImageName(file.name)
  );
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index < 0 || index === name.length - 1) return "";
  return name.slice(index + 1).toLowerCase();
}
