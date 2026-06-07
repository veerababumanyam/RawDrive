import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_WORKSPACE_PROFILE,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { WorkspaceBrandIdentityHeader } from "../workspace-brand-identity-header";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "test-token",
}));

function renderHeader(overrides: Partial<WorkspaceProfile> = {}) {
  const profile = { ...EMPTY_WORKSPACE_PROFILE, ...overrides };
  render(
    <WorkspaceBrandIdentityHeader
      profile={profile}
      brandName="Acme Studio"
      logoControlId="studio-logo-control"
    />,
  );
}

describe("WorkspaceBrandIdentityHeader", () => {
  it("shows the brand name prominently and the logo at the top when set", () => {
    renderHeader({
      logo_asset_id: "asset-1",
      logo_url: "workspaces/logo.webp",
      logo_metadata: { storage_key: "workspaces/logo.webp" },
    });

    expect(screen.getByText("Acme Studio")).toBeVisible();
    const frame = screen.getByRole("img", { name: /acme studio logo/i });
    const img = frame.querySelector("img");
    expect(img?.getAttribute("src")).toContain("/storage/workspaces/logo.webp");
    // No add-logo CTA once a logo exists.
    expect(
      screen.queryByRole("button", { name: /add studio logo/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a placeholder initial and an add-logo CTA when no logo is set", () => {
    renderHeader();

    expect(screen.getByText("Acme Studio")).toBeVisible();
    // Brand initial placeholder (no <img>).
    const frame = screen.getByRole("img", { name: /acme studio logo/i });
    expect(frame.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /add studio logo/i }),
    ).toBeVisible();
  });
});
