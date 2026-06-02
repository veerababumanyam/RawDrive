import { describe, expect, it } from "vitest";
import {
  MEDIA_KEY_MISMATCH_MESSAGE,
  MEDIA_KEY_UNAVAILABLE_MESSAGE,
} from "../media-key-store";
import { publicMediaErrorMessage } from "../public-media-error";

describe("publicMediaErrorMessage", () => {
  it("maps encrypted fetch authorization failures to secure-link guidance", () => {
    expect(publicMediaErrorMessage("Encrypted media fetch failed: 401")).toBe(
      "Encrypted photo locked. Open the secure gallery link from the photographer.",
    );
  });

  it("maps missing and mismatched media keys to client-safe copy", () => {
    expect(publicMediaErrorMessage(MEDIA_KEY_UNAVAILABLE_MESSAGE)).toBe(
      "Encrypted photo locked. Open the secure gallery link from the photographer.",
    );
    expect(publicMediaErrorMessage(MEDIA_KEY_MISMATCH_MESSAGE)).toBe(
      "This secure gallery link does not match the encrypted photo.",
    );
  });

  it("preserves non-encryption errors for existing diagnostics", () => {
    expect(publicMediaErrorMessage("Image unavailable")).toBe("Image unavailable");
  });
});
