import { describe, expect, it } from "vitest";
import { getAssetPreviewUrl, getStorageBackedUrl } from "../dashboard-ui";

describe("dashboard UI asset URLs", () => {
  it("prefixes backend storage paths and appends the session token", () => {
    expect(getStorageBackedUrl("/storage/workspaces/w1/photo.webp", "jwt-token")).toBe(
      "http://localhost:8080/storage/workspaces/w1/photo.webp?token=jwt-token",
    );
  });

  it("converts bare derivative storage keys into authenticated backend storage URLs", () => {
    expect(getStorageBackedUrl("derivatives/asset-1/display_webp.webp", "jwt-token")).toBe(
      "http://localhost:8080/storage/derivatives/asset-1/display_webp.webp?token=jwt-token",
    );
  });

  it("does not rewrite app-relative non-storage URLs", () => {
    expect(getStorageBackedUrl("/api/v1/public/galleries/wedding/branding/logo", "jwt-token")).toBe(
      "/api/v1/public/galleries/wedding/branding/logo",
    );
  });

  it("does not rewrite data or blob URLs", () => {
    expect(getStorageBackedUrl("data:image/webp;base64,abc", "jwt-token")).toBe("data:image/webp;base64,abc");
    expect(getStorageBackedUrl("blob:http://localhost/photo", "jwt-token")).toBe("blob:http://localhost/photo");
  });

  it("does not rewrite external presigned URLs", () => {
    const url = "https://example.r2.cloudflarestorage.com/photo.webp?signature=abc";

    expect(getStorageBackedUrl(url, "jwt-token")).toBe(url);
  });

  it("selects WebP thumbnails before legacy variants", () => {
    expect(
      getAssetPreviewUrl(
        {
          thumbnail_urls: {
            thumb_sm: "/storage/workspaces/w1/photo-small.jpg",
            thumb_sm_webp: "/storage/workspaces/w1/photo-small.webp",
          },
        },
        "jwt-token",
      ),
    ).toBe("http://localhost:8080/storage/workspaces/w1/photo-small.webp?token=jwt-token");
  });
});
