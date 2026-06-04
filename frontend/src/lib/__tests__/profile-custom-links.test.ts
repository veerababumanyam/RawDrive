import { describe, expect, it } from "vitest";

import {
  customLinkHref,
  displayCustomLinkUrl,
  normalizeCustomLinks,
  normalizeCustomLinkUrl,
} from "@/lib/profile-custom-links";

describe("profile custom links", () => {
  it("normalizes web URLs for public link blocks", () => {
    expect(normalizeCustomLinkUrl("rawdrive.in/book")).toBe(
      "https://rawdrive.in/book",
    );
    expect(customLinkHref("www.rawdrive.in/book")).toBe(
      "https://www.rawdrive.in/book",
    );
    expect(displayCustomLinkUrl("https://www.rawdrive.in/book/")).toBe(
      "rawdrive.in/book",
    );
  });

  it("filters incomplete or unsafe custom link drafts", () => {
    expect(
      normalizeCustomLinks([
        { label: " Booking ", url: "rawdrive.in/book" },
        { label: "", url: "rawdrive.in/portfolio" },
        { label: "Bad", url: "javascript:alert(1)" },
      ]),
    ).toEqual([{ label: "Booking", url: "https://rawdrive.in/book" }]);
  });
});
