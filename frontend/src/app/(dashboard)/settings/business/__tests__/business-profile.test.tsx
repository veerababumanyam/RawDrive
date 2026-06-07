import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      gallery_branding_defaults: {
        logo_placement: "top-right",
        monogram: "KS",
        watermark_style: "subtle-corner",
        logo_size: 48,
        logo_opacity: 92,
        watermark_text: "Kaveri Stories",
        watermark_opacity: 58,
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
    expect(screen.getByLabelText(/default monogram/i)).toHaveValue("KS");
    expect(screen.getByLabelText(/default logo placement/i)).toHaveValue(
      "top-right",
    );
    expect(screen.getByLabelText(/default watermark style/i)).toHaveValue(
      "subtle-corner",
    );
    expect(screen.getByLabelText(/default watermark text/i)).toHaveValue(
      "Kaveri Stories",
    );
    expect(
      screen.getByLabelText(/show studio branding on public galleries/i),
    ).toBeInTheDocument();
    // A logo is set in the mock, so the crop uploader offers Change + Remove.
    expect(
      screen.getByRole("button", { name: /change logo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove logo/i }),
    ).toBeInTheDocument();
    const logoFrame = screen.getByRole("img", { name: /studio logo/i });
    const logoImg = logoFrame.querySelector("img");
    expect(logoImg?.getAttribute("src")).toContain(
      "/storage/workspaces/logo.webp",
    );
    expect(logoImg?.getAttribute("src")).not.toContain("token=");
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

  it("saves gallery branding defaults through Business Profile", async () => {
    render(<BusinessProfilePage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Business Profile" }),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/default monogram/i), {
      target: { value: "AR" },
    });
    fireEvent.change(screen.getByLabelText(/default logo placement/i), {
      target: { value: "bottom-right" },
    });
    fireEvent.change(screen.getByLabelText(/default watermark style/i), {
      target: { value: "tiled" },
    });
    fireEvent.change(screen.getByLabelText(/default watermark text/i), {
      target: { value: "Asha Ravi Studio" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/workspaces/current/profile"),
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const saveCall = fetchMock.mock.calls.find(
      ([, init]) => init && (init as RequestInit).method === "PUT",
    );
    const body = JSON.parse((saveCall?.[1] as RequestInit).body as string);
    expect(body.gallery_branding_defaults).toMatchObject({
      logo_placement: "bottom-right",
      monogram: "AR",
      watermark_style: "tiled",
      watermark_text: "Asha Ravi Studio",
    });
  });
});
