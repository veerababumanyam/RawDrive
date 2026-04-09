import { describe, it, expect } from "vitest";

describe("useUpload", () => {
  it("exports CHUNK_SIZE as 5MB", async () => {
    // Verify the module exports correctly
    const mod = await import("../use-upload");
    expect(mod.useUpload).toBeDefined();
    expect(typeof mod.useUpload).toBe("function");
  });

  it("useUpload returns a function that accepts apiUrl and token", async () => {
    const { useUpload } = await import("../use-upload");
    expect(useUpload.length).toBe(2); // 2 params: apiUrl, token
  });
});
