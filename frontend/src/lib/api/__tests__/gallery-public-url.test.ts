import { describe, expect, it } from "vitest";
import { galleryPublicUrl } from "../galleries";

const gallery = { slug: "veeru-b08bab82" };
const workspace = {
  business_profile_slug: "aaaa",
  business_unique_code: "ed9e1d7b",
};

describe("galleryPublicUrl", () => {
  it("keeps localhost share links on the local dashboard origin", () => {
    expect(galleryPublicUrl(gallery, workspace, "http://localhost:3000")).toBe(
      "http://localhost:3000/g/veeru-b08bab82",
    );
  });

  it("uses the canonical apex gallery URL outside local development", () => {
    expect(
      galleryPublicUrl(gallery, workspace, "https://app.rawdrive.in"),
    ).toBe("https://rawdrive.in/g/veeru-b08bab82");
  });
});
