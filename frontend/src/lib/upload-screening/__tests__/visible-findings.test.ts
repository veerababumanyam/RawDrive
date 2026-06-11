import { describe, expect, it } from "vitest";

import { visibleUploadWarnings } from "../visible-findings";

describe("visibleUploadWarnings", () => {
  it("hides benign camera MPF preview findings from the upload row", () => {
    expect(visibleUploadWarnings([
      {
        category: "appended_payload",
        severity: "low",
        message: "camera-authored JPEG preview/MPF data detected after the primary JPEG image",
      },
    ])).toEqual([]);
  });

  it("hides benign camera-authored trailer findings from the upload row", () => {
    expect(visibleUploadWarnings([
      {
        category: "appended_payload",
        severity: "low",
        message: "2897141 bytes of camera-authored trailer data after the primary JPEG image (allowed)",
      },
      {
        category: "appended_payload",
        severity: "low",
        message: "479744 bytes of trailing data past JPEG EOI (no archive signature - allowed)",
      },
    ])).toEqual([]);
  });

  it("keeps actionable low-severity warnings visible", () => {
    expect(visibleUploadWarnings([
      {
        category: "metadata_budget",
        severity: "low",
        message: "JPEG camera metadata exceeds the quick-scan budget",
      },
    ])).toHaveLength(1);
  });
});
