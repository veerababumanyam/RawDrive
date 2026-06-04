import QRCodeLib from "qrcode";

import { components } from "@/lib/tokens";

// Shared QR-code generation for RawDrive share surfaces. The `qrcode` package
// (already a dependency) is the single source of truth for the QR matrix — we
// never hand-roll one (the dead share-dialog.tsx encoder is non-spec and not
// scannable). Colors come from the `qrCode` design tokens, which are
// intentionally fixed high-contrast (black-on-white) for scanner reliability
// across all three themes rather than theme-dependent — see
// design-tokens.json `components.qrCode`.
//
// All three entry points are browser-safe (qrcode's browser build exposes
// toCanvas / toDataURL / toString; toFile/toBuffer are Node-only and unused).

const QR_COLORS = {
  dark: components.qrCode.dark,
  light: components.qrCode.light,
} as const;

// ECC level "H" (~30% recovery) so a printed QR survives folding, glare on a
// marketing card, or a phone screenshot.
const ERROR_CORRECTION = "H" as const;

// Print-resolution default for the downloadable PNG. 2048px prints crisply on
// cards/signage and scales down cleanly for screens/WhatsApp.
const PRINT_PNG_WIDTH = 2048;

/** Render a QR for `text` into an existing on-screen `<canvas>`. */
export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  size = 224,
): Promise<void> {
  await QRCodeLib.toCanvas(canvas, text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: ERROR_CORRECTION,
    color: QR_COLORS,
  });
}

/** High-resolution PNG data URL (print quality). */
export async function qrPngDataUrl(
  text: string,
  width = PRINT_PNG_WIDTH,
): Promise<string> {
  return QRCodeLib.toDataURL(text, {
    type: "image/png",
    width,
    margin: 2,
    errorCorrectionLevel: ERROR_CORRECTION,
    color: QR_COLORS,
  });
}

/** Spec-correct, infinitely-scalable SVG string (vector — best for print). */
export async function qrSvgString(text: string): Promise<string> {
  return QRCodeLib.toString(text, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: ERROR_CORRECTION,
    color: QR_COLORS,
  });
}

// Trigger a browser download of `href` (a data: or blob: URL) as `filename`.
// Appending to the document before clicking is required for the click to be
// honored in Firefox.
function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function withExtension(filename: string, ext: ".png" | ".svg"): string {
  return filename.endsWith(ext) ? filename : `${filename}${ext}`;
}

/** Generate and download a high-resolution PNG of the QR for `text`. */
export async function downloadQrPng(
  text: string,
  filename: string,
  width = PRINT_PNG_WIDTH,
): Promise<void> {
  const dataUrl = await qrPngDataUrl(text, width);
  triggerDownload(dataUrl, withExtension(filename, ".png"));
}

/** Generate and download a vector SVG of the QR for `text`. */
export async function downloadQrSvg(
  text: string,
  filename: string,
): Promise<void> {
  const svg = await qrSvgString(text);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerDownload(objectUrl, withExtension(filename, ".svg"));
  } finally {
    // The click is synchronous, so the blob has already been read by the time
    // we revoke — safe to release immediately rather than leaking the URL.
    URL.revokeObjectURL(objectUrl);
  }
}
