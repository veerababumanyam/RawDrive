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
