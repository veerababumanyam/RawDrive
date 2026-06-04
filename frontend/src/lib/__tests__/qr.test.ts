import { describe, it, expect, vi, beforeEach } from "vitest";

// jsdom has no real canvas/2d context and the `qrcode` browser build writes to
// one, so the whole module is mocked — mirrors the existing
// share-qr-popover / preview-chrome test convention. `vi.hoisted` lets the
// assertions reference the same spies the hoisted vi.mock factory installs.
const { toCanvas, toDataURL, toString } = vi.hoisted(() => ({
  toCanvas: vi.fn().mockResolvedValue(undefined),
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,FAKEPNG"),
  toString: vi.fn().mockResolvedValue('<svg data-fake="1"></svg>'),
}));

vi.mock("qrcode", () => ({
  default: { toCanvas, toDataURL, toString },
}));

import {
  renderQrToCanvas,
  qrPngDataUrl,
  qrSvgString,
  downloadQrPng,
  downloadQrSvg,
} from "@/lib/qr";
import { components } from "@/lib/tokens";

const QR_COLORS = {
  dark: components.qrCode.dark,
  light: components.qrCode.light,
};

describe("lib/qr", () => {
  beforeEach(() => {
    toCanvas.mockClear();
    toDataURL.mockClear();
    toString.mockClear();
  });

  it("renderQrToCanvas draws into the canvas at high error correction with token colors", async () => {
    const canvas = document.createElement("canvas");
    await renderQrToCanvas(canvas, "https://x/g/slug");
    expect(toCanvas).toHaveBeenCalledWith(
      canvas,
      "https://x/g/slug",
      expect.objectContaining({
        errorCorrectionLevel: "H",
        color: QR_COLORS,
      }),
    );
  });

  it("qrPngDataUrl requests a high-resolution (2048px) PNG with token colors", async () => {
    const out = await qrPngDataUrl("https://x/g/slug");
    expect(toDataURL).toHaveBeenCalledWith(
      "https://x/g/slug",
      expect.objectContaining({
        type: "image/png",
        width: 2048,
        errorCorrectionLevel: "H",
        color: QR_COLORS,
      }),
    );
    expect(out).toBe("data:image/png;base64,FAKEPNG");
  });

  it("qrSvgString produces a vector SVG via qrcode.toString (not a hand-rolled matrix)", async () => {
    const out = await qrSvgString("https://x/g/slug");
    expect(toString).toHaveBeenCalledWith(
      "https://x/g/slug",
      expect.objectContaining({
        type: "svg",
        errorCorrectionLevel: "H",
        color: QR_COLORS,
      }),
    );
    expect(out).toContain("<svg");
  });

  it("downloadQrPng triggers a .png anchor download from a generated high-res data URL", async () => {
    const downloads: Array<{ download: string; href: string }> = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ download: this.download, href: this.href });
      });
    await downloadQrPng("https://x/g/slug", "sharma-wedding-qr");
    expect(toDataURL).toHaveBeenCalled();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].download).toBe("sharma-wedding-qr.png");
    expect(downloads[0].href).toContain("data:image/png");
    clickSpy.mockRestore();
  });

  it("downloadQrSvg triggers a .svg object-URL download and revokes it", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:fake-svg");
    const revokeObjectURL = vi.fn();
    (
      URL as unknown as { createObjectURL: typeof createObjectURL }
    ).createObjectURL = createObjectURL;
    (
      URL as unknown as { revokeObjectURL: typeof revokeObjectURL }
    ).revokeObjectURL = revokeObjectURL;
    const downloads: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    await downloadQrSvg("https://x/g/slug", "sharma-wedding-qr");
    expect(toString).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(downloads).toContain("sharma-wedding-qr.svg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-svg");
    clickSpy.mockRestore();
  });
});
