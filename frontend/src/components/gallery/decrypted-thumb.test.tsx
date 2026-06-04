import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Drive the decryption hook deterministically so we can assert DecryptedThumb's
// three render states without real crypto / network.
vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: vi.fn(),
}));

import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { DecryptedThumb } from "./decrypted-thumb";

const mockHook = vi.mocked(useDecryptedAssetUrl);

afterEach(cleanup);

const encryptedAsset = {
  id: "a1",
  filename: "p.jpg",
  is_encrypted: true,
  media_encryption: { scheme: "rawdrive-e2ee-v1" },
  thumbnail_urls: { thumb_md_webp: "k.webp.enc" },
};

describe("DecryptedThumb (L2 decrypted thumbnails)", () => {
  it("renders the decrypted blob: URL as an <img> (not the raw ciphertext path)", () => {
    mockHook.mockReturnValue({ src: "blob:abc", loading: false, error: null });
    render(
      <DecryptedThumb asset={encryptedAsset} alt="photo" className="x" />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "blob:abc");
    expect(img).toHaveAttribute("alt", "photo");
    // Must NOT fall back to a raw /storage ciphertext URL.
    expect(img.getAttribute("src")).not.toContain("/storage/");
  });

  it("shows a skeleton (no img) while decrypting", () => {
    mockHook.mockReturnValue({ src: "", loading: true, error: null });
    const { container } = render(<DecryptedThumb asset={encryptedAsset} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows a fallback (no img) when the key is unavailable", () => {
    mockHook.mockReturnValue({
      src: "",
      loading: false,
      error: "Photo key unavailable",
    });
    const { container } = render(<DecryptedThumb asset={encryptedAsset} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect((container.textContent ?? "").length).toBeGreaterThan(0);
  });

  it("feeds the asset + grid variants to the decryption hook", () => {
    mockHook.mockReturnValue({ src: "blob:z", loading: false, error: null });
    render(<DecryptedThumb asset={encryptedAsset} />);
    const call = mockHook.mock.calls.at(-1)!;
    expect(call[0]).toBe(encryptedAsset);
    expect(Array.isArray(call[1])).toBe(true);
    expect(call[1]).toContain("thumb_md_webp");
  });

  it("renders a fallback (no crash) when the asset is missing", () => {
    mockHook.mockReturnValue({ src: "", loading: false, error: null });
    expect(() => render(<DecryptedThumb asset={undefined} />)).not.toThrow();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
