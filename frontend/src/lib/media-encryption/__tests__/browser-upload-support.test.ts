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

  it.each(["Wedding (42).CR3", "canon-legacy.CRW", "sony-pixel-shift.ARQ", "gopro.GPR"])(
    "routes %s to desktop before attempting source-side encryption",
    (filename) => {
      const file = new File(["raw"], filename, { type: "" });
      expect(getBrowserE2EEUploadBlockReason(file)).toContain("RawDrive Desktop");
    },
  );

  it("routes raw MIME aliases to desktop even when the extension is generic", () => {
    const file = new File(["raw"], "capture.raw", { type: "image/x-sony-arq" });
    expect(getBrowserE2EEUploadBlockReason(file)).toContain("RawDrive Desktop");
  });

  it("routes oversized originals to the desktop streaming path", () => {
    const file = new File(["x"], "large.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: BROWSER_E2EE_MAX_ORIGINAL_BYTES + 1 });

    expect(getBrowserE2EEUploadBlockReason(file)).toContain("streaming source-side encryption");
  });
});
