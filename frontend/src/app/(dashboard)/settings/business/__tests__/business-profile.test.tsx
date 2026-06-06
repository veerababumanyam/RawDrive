import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessProfilePage from "../page";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "token",
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      name: "Kaveri Weddings",
      brand_name: "Kaveri Stories",
      brand_accent_color: "#B7791F",
      public_branding_enabled: true,
      logo_url: "workspaces/logo.webp",
      logo_asset_id: "logo-asset-1",
      logo_metadata: {
        filename: "studio-logo.webp",
        storage_key: "workspaces/logo.webp",
      },
      business_profile_slug: "kaveri-stories",
      business_unique_code: "a1b2c3d4",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("BusinessProfilePage studio identity", () => {
  it("shows logo controls and previews all public-facing brand surfaces", async () => {
    render(<BusinessProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Business Profile" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/public brand name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/brand accent color/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/show studio branding on public galleries/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /upload studio logo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /kaveri stories logo preview/i }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("/storage/workspaces/logo.webp"),
    );
    expect(
      screen
        .getByRole("img", { name: /kaveri stories logo preview/i })
        .getAttribute("src"),
    ).not.toContain("token=");
    expect(screen.queryByText(/rawdrive\.in/)).not.toBeInTheDocument();

    for (const preview of [
      "Gallery preview",
      "Invoice preview",
      "Email signature",
      "Share card",
    ]) {
      expect(screen.getByText(preview)).toBeInTheDocument();
    }
  });
});
