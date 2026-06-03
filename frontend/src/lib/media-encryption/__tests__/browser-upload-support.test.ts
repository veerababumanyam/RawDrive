import { describe, expect, it } from "vitest";
import {
  BROWSER_E2EE_MAX_ORIGINAL_BYTES,
  getBrowserE2EEUploadBlockReason,
} from "../browser-upload-support";

describe("browser E2EE upload support", () => {
  it("allows browser-decodable still images", () => {
    const file = new File(["jpeg"], "Wedding (42).jpg", { type: "image/jpeg" });
    expect(getBrowserE2EEUploadBlockReason(file)).toBeNull();
  });

  it("allows JPEG-family camera/export files with JFIF extension or MIME type", () => {
    expect(getBrowserE2EEUploadBlockReason(new File(["jpeg"], "camera.jfif", { type: "" }))).toBeNull();
    expect(getBrowserE2EEUploadBlockReason(new File(["jpeg"], "camera.bin", { type: "image/jfif" }))).toBeNull();
  });

  // CD4: HEIC/HEIF/AVIF + cr2/nef/arw/dng/orf/raf/rw2 now decode in-browser, so
  // the E2EE gate must allow them (the per-file decode result, not the gate,
  // decides AVIF capability later).
  it.each([
    ["iphone.HEIC", "image/heic"],
    ["clip.HEIF", "image/heif"],
    ["apple.HIF", ""],
    ["hero.AVIF", "image/avif"],
    ["IMG_0001.CR2", "image/x-canon-cr2"],
    ["DSC_0001.NEF", "image/x-nikon-nef"],
    ["sony.ARW", "image/x-sony-arw"],
    ["adobe.DNG", "image/x-adobe-dng"],
    ["fuji.RAF", "image/x-fujifilm-raf"],
    ["panasonic.RW2", "image/x-panasonic-rw2"],
  ])("allows now-browser-decodable %s (MIME %s), even with image/x-* MIME", (name, type) => {
    expect(getBrowserE2EEUploadBlockReason(new File(["bytes"], name, { type }))).toBeNull();
  });

  it.each(["canon-legacy.CRW", "sony-pixel-shift.ARQ", "gopro.GPR", "sigma.X3F", "kodak.KDC"])(
    "routes desktop-only %s to desktop before attempting source-side encryption",
    (filename) => {
      const file = new File(["raw"], filename, { type: "" });
      expect(getBrowserE2EEUploadBlockReason(file)).toContain("RawDrive Desktop");
    },
  );

  it("allows CR3 (even with an image/x-* MIME) on the in-browser decode path", () => {
    const file = new File(["raw"], "IMG.CR3", { type: "image/x-canon-cr3" });
    expect(getBrowserE2EEUploadBlockReason(file)).toBeNull();
  });

  it("routes raw MIME aliases to desktop when the extension is not browser-decodable", () => {
    const file = new File(["raw"], "capture.raw", { type: "image/x-sony-arq" });
    expect(getBrowserE2EEUploadBlockReason(file)).toContain("RawDrive Desktop");
  });

  it("rejects non-image files", () => {
    expect(getBrowserE2EEUploadBlockReason(new File(["pdf"], "contract.pdf", { type: "application/pdf" }))).toContain(
      "still-image files only",
    );
  });

  it("routes oversized originals to the desktop streaming path", () => {
    const file = new File(["x"], "large.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: BROWSER_E2EE_MAX_ORIGINAL_BYTES + 1 });

    expect(getBrowserE2EEUploadBlockReason(file)).toContain("streaming source-side encryption");
  });
});
