import { describe, expect, it } from "vitest";
import {
  FILE_PICKER_STILL_IMAGE_ACCEPT,
  isAcceptedStillImageFile,
  isDesktopRequiredStillImageName,
} from "../still-image-formats";

describe("still image format registry", () => {
  it.each(["Wedding (42).JPG", "portrait.PNG", "delivery.WEBP", "animation.GIF"])(
    "accepts browser-decodable image extension %s when MIME is blank",
    (name) => {
      expect(isAcceptedStillImageFile(new File(["image"], name, { type: "" }))).toBe(true);
    },
  );

  it.each(["IMG_0001.CR2", "IMG_0001.CR3", "IMG_0001.CRW", "DSC_0001.NEF", "DSC_0001.NRW"])(
    "accepts Canon/Nikon RAW extension %s",
    (name) => {
      expect(isAcceptedStillImageFile(new File(["raw"], name, { type: "" }))).toBe(true);
      expect(isDesktopRequiredStillImageName(name)).toBe(true);
    },
  );

  it.each(["sony.ARW", "sony.ARQ", "sony.SR2", "sony.SRF", "gopro.GPR", "leica.RWL"])(
    "accepts Sony/GoPro/Leica RAW extension %s",
    (name) => {
      expect(isAcceptedStillImageFile(new File(["raw"], name, { type: "" }))).toBe(true);
      expect(isDesktopRequiredStillImageName(name)).toBe(true);
    },
  );

  it("keeps the file picker accept list in sync with desktop-only still formats", () => {
    expect(FILE_PICKER_STILL_IMAGE_ACCEPT).toContain("image/*");
    for (const ext of [".crw", ".arq", ".gpr", ".hif", ".rwz"]) {
      expect(FILE_PICKER_STILL_IMAGE_ACCEPT).toContain(ext);
    }
  });
});
