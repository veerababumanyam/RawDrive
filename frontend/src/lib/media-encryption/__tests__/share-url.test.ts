import { beforeEach, describe, expect, it } from "vitest";
import {
  appendCurrentGalleryKeyFragment,
  appendStoredGalleryKeyFragment,
  setUrlSearchParamBeforeFragment,
} from "../share-url";

describe("media encryption share URLs", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/g/wedding");
  });

  it("appends the stored gallery media key as a URL fragment", () => {
    window.localStorage.setItem(
      "rawdrive:media-key-active:gallery:gallery-share-test",
      "gallery:gallery-share-test:fingerprint",
    );
    window.localStorage.setItem(
      "rawdrive:media-key:gallery:gallery-share-test:fingerprint",
      "storedExportedKey",
    );

    expect(
      appendStoredGalleryKeyFragment(
        "https://app.rawdrive.test/g/wedding?album=family",
        "gallery-share-test",
      ),
    ).toBe("https://app.rawdrive.test/g/wedding?album=family#rd_key=storedExportedKey");
  });

  it("keeps share tokens in the search params before the encrypted media key fragment", () => {
    expect(
      setUrlSearchParamBeforeFragment(
        "https://app.rawdrive.test/g/wedding?album=family#rd_key=storedExportedKey",
        "share",
        "share-token",
      ),
    ).toBe("https://app.rawdrive.test/g/wedding?album=family&share=share-token#rd_key=storedExportedKey");
  });

  it("preserves the current gallery key when a public viewer re-shares a photo", () => {
    window.history.replaceState(null, "", "/g/wedding#rd_key=currentExportedKey");

    expect(
      appendCurrentGalleryKeyFragment("https://app.rawdrive.test/g/wedding/photo/asset-1?ws=studio-1"),
    ).toBe("https://app.rawdrive.test/g/wedding/photo/asset-1?ws=studio-1#rd_key=currentExportedKey");
  });

  it("supports relative URLs without losing hash or query ordering", () => {
    expect(
      setUrlSearchParamBeforeFragment("/g/wedding#rd_key=storedExportedKey", "share", "share-token"),
    ).toBe("/g/wedding?share=share-token#rd_key=storedExportedKey");
  });
});
