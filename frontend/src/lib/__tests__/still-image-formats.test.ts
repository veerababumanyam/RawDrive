import { describe, expect, it } from "vitest";
import {
  FILE_PICKER_STILL_IMAGE_ACCEPT,
  isAcceptedStillImageFile,
  isBrowserDecodableStillImageName,
  isDesktopRequiredStillImageName,
} from "../still-image-formats";

describe("still image format registry", () => {
  it.each(["Wedding (42).JPG", "portrait.JFIF", "scan.JFI", "portrait.PNG", "delivery.WEBP", "animation.GIF"])(
    "accepts browser-decodable image extension %s when MIME is blank",
    (name) => {
      expect(isAcceptedStillImageFile(new File(["image"], name, { type: "" }))).toBe(true);
    },
  );

  // CD4: cr2/nef/arw/dng/orf/raf/rw2 + heic/heif/hif/avif now decode in-browser.
  it.each([
    "IMG_0001.CR2",
    "DSC_0001.NEF",
    "sony.ARW",
    "adobe.DNG",
    "olympus.ORF",
    "fuji.RAF",
    "panasonic.RW2",
    "IMG_0001.CR3",
    "iphone.HEIC",
    "clip.HEIF",
    "apple.HIF",
    "hero.AVIF",
  ])("treats now-browser-decodable %s as browser-decodable (not desktop-only)", (name) => {
    expect(isAcceptedStillImageFile(new File(["raw"], name, { type: "" }))).toBe(true);
    expect(isBrowserDecodableStillImageName(name)).toBe(true);
    expect(isDesktopRequiredStillImageName(name)).toBe(false);
  });

  // Exotic / proprietary RAW + multi-page TIFF stay desktop-only.
  it.each(["IMG_0001.CRW", "DSC_0001.NRW", "sony.ARQ", "gopro.GPR", "leica.RWL", "sigma.X3F", "scan.TIFF"])(
    "keeps desktop-only RAW/exotic extension %s on the desktop path",
    (name) => {
      expect(isAcceptedStillImageFile(new File(["raw"], name, { type: "" }))).toBe(true);
      expect(isDesktopRequiredStillImageName(name)).toBe(true);
      expect(isBrowserDecodableStillImageName(name)).toBe(false);
    },
  );

  it("keeps the file picker accept list inclusive of browser-decodable and desktop-only formats", () => {
    expect(FILE_PICKER_STILL_IMAGE_ACCEPT).toContain("image/*");
    // browser-decodable RAW/HEIC must still be pickable (RAW reports image/x-* MIME)
    for (const ext of [".cr2", ".cr3", ".nef", ".raf", ".heic", ".avif"]) {
      expect(FILE_PICKER_STILL_IMAGE_ACCEPT).toContain(ext);
    }
    // desktop-only formats remain pickable too
    for (const ext of [".crw", ".arq", ".gpr", ".rwz", ".x3f"]) {
      expect(FILE_PICKER_STILL_IMAGE_ACCEPT).toContain(ext);
    }
  });
});
