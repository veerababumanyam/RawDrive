export const BROWSER_DECODE_STILL_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/jfif",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
  "image/gif",
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
] as const;

export const DESKTOP_REQUIRED_STILL_IMAGE_MIME_TYPES = [
  "image/tiff",
  "image/tif",
  "image/x-tiff",
  "image/heic",
  "image/heif",
  "image/hif",
  "image/avif",
] as const;

export const DESKTOP_REQUIRED_STILL_IMAGE_EXTENSIONS = [
  "3fr",
  "ari",
  "arq",
  "arw",
  "bay",
  "bmq",
  "cap",
  "cine",
  "cr2",
  "cr3",
  "crw",
  "cs1",
  "dcr",
  "dc2",
  "dng",
  "erf",
  "fff",
  "gpr",
  "hif",
  "heic",
  "heif",
  "ia",
  "iiq",
  "k25",
  "kc2",
  "kdc",
  "mdc",
  "mef",
  "mos",
  "mrw",
  "nef",
  "nrw",
  "orf",
  "ori",
  "pef",
  "pxn",
  "qtk",
  "r3d",
  "raf",
  "raw",
  "rdc",
  "rw1",
  "rwl",
  "rw2",
  "rwz",
  "sr2",
  "srf",
  "srw",
  "sti",
  "tif",
  "tiff",
  "x3f",
  "avif",
] as const;

export const FILE_PICKER_STILL_IMAGE_ACCEPT = [
  "image/*",
  ...DESKTOP_REQUIRED_STILL_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

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

const browserDecodeExtensionSet = new Set<string>(BROWSER_DECODE_STILL_IMAGE_EXTENSIONS);
const desktopRequiredExtensionSet = new Set<string>(DESKTOP_REQUIRED_STILL_IMAGE_EXTENSIONS);

export function isBrowserDecodableStillImageName(name: string): boolean {
  const ext = extensionOf(name);
  return ext !== "" && browserDecodeExtensionSet.has(ext);
}

export function isDesktopRequiredStillImageName(name: string): boolean {
  const ext = extensionOf(name);
  return ext !== "" && desktopRequiredExtensionSet.has(ext);
}

export function isAcceptedStillImageFile(file: Pick<File, "name" | "type">): boolean {
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
