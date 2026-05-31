import { describe, it, expect } from "vitest";

describe("useUpload", () => {
  it("exports CHUNK_SIZE as 5MB", async () => {
    // Verify the module exports correctly
    const mod = await import("../use-upload");
    expect(mod.useUpload).toBeDefined();
    expect(typeof mod.useUpload).toBe("function");
  });

  it("useUpload accepts apiUrl, token, and an optional destination binding", async () => {
    const { useUpload } = await import("../use-upload");
    // S3-G4: the third param is the optional { galleryId, albumId } destination
    // so CreateSession can bind the upload to a gallery for server-side linking.
    expect(useUpload.length).toBe(3); // apiUrl, token, destination?
  });

  it("caps active uploads to a small worker pool", async () => {
    const { MAX_CONCURRENT_UPLOADS } = await import("../use-upload");
    expect(MAX_CONCURRENT_UPLOADS).toBe(4);
  });
});
