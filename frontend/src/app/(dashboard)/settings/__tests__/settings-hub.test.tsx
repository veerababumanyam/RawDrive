import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import SettingsHubPage from "../page";
import * as auth from "@/lib/auth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Settings hub (/settings)", () => {
  it("renders every self-serve tile for a photographer", () => {
    vi.spyOn(auth, "getStoredPlatformRole").mockReturnValue("photographer");
    render(<SettingsHubPage />);

    for (const id of [
      "settings-tile-profile",
      "settings-tile-business",
      "settings-tile-security",
      "settings-tile-storage",
      "settings-tile-packages",
    ]) {
      expect(screen.getByTestId(id)).toBeDefined();
    }
    // Non-admin must not see the admin-console entry point.
    expect(screen.queryByTestId("settings-tile-admin")).toBeNull();
  });

  it("shows the Admin Console tile only for admin / super_admin roles", async () => {
    vi.spyOn(auth, "getStoredPlatformRole").mockReturnValue("super_admin");
    render(<SettingsHubPage />);
    // role is set in a useEffect — wait for the re-render before asserting.
    await waitFor(() => {
      expect(screen.getByTestId("settings-tile-admin")).toBeDefined();
    });
    const link = screen.getByTestId("settings-tile-admin") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/dashboard");
  });

  it("shows the Upload Credits tile only for admin / super_admin roles", async () => {
    vi.spyOn(auth, "getStoredPlatformRole").mockReturnValue("admin");
    render(<SettingsHubPage />);
    await waitFor(() => {
      expect(screen.getByTestId("settings-tile-upload-credits")).toBeDefined();
    });
    const link = screen.getByTestId("settings-tile-upload-credits") as HTMLAnchorElement;
    // This contract is the answer to "admin settings not showing option
    // to set credits for upload" — the hub MUST expose a direct path to
    // the admin grant surface.
    expect(link.getAttribute("href")).toBe("/admin/upload-credits");
  });

  it("hides the Upload Credits tile from non-admin roles", () => {
    vi.spyOn(auth, "getStoredPlatformRole").mockReturnValue("photographer");
    render(<SettingsHubPage />);
    expect(screen.queryByTestId("settings-tile-upload-credits")).toBeNull();
  });

  it("Profile tile links to /settings/profile (distinct from hub)", () => {
    vi.spyOn(auth, "getStoredPlatformRole").mockReturnValue("photographer");
    render(<SettingsHubPage />);
    const profile = screen.getByTestId("settings-tile-profile") as HTMLAnchorElement;
    // This is the contract that fixes the "Profile and Settings open the same
    // screen" bug: /settings (hub) and /settings/profile are now two distinct
    // destinations, and the user menu's two entries land on different surfaces.
    expect(profile.getAttribute("href")).toBe("/settings/profile");
  });
});
