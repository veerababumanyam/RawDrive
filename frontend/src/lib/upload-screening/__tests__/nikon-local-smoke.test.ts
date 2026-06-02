import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { screen } from "../screen";

const smokeDir = process.env.RAWDRIVE_LOCAL_CAMERA_SMOKE_DIR;

describe.skipIf(!smokeDir || !existsSync(smokeDir))("local real-camera JPEG smoke", () => {
  it("accepts Nikon JPEGs with camera-authored MPF/trailing preview data", () => {
    const problemSamples = [
      "DSC_6229.JPG",
      "DSC_6475.JPG",
      "DSC_6477.JPG",
      "DSC_6478.JPG",
      "DSC_7152.JPG",
    ];
    const dirFiles = readdirSync(smokeDir!);
    const files = problemSamples.every((name) => dirFiles.includes(name))
      ? problemSamples
      : dirFiles.filter((name) => /^DSC_\d+\.JPG$/i.test(name)).slice(0, 4);

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const bytes = new Uint8Array(readFileSync(join(smokeDir!, file)));
      const result = screen(bytes, { declaredType: "image/jpeg" });
      expect(result.decision, `${file}: ${JSON.stringify(result.findings)}`).toBe("pass");
    }
  });
});
