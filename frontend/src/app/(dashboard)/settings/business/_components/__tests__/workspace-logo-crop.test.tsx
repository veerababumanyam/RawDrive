import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_WORKSPACE_PROFILE,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { WorkspaceLogoCrop } from "../workspace-logo-crop";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "test-token",
}));

const cropWorkspaceLogo = vi.fn();
const uploadWorkspaceLogoCrop = vi.fn();
const updateWorkspaceProfile = vi.fn();

vi.mock("@/lib/api/workspace-profile", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/workspace-profile")
  >("@/lib/api/workspace-profile");
  return {
    ...actual,
    cropWorkspaceLogo: (...args: unknown[]) => cropWorkspaceLogo(...args),
    uploadWorkspaceLogoCrop: (...args: unknown[]) =>
      uploadWorkspaceLogoCrop(...args),
    updateWorkspaceProfile: (...args: unknown[]) =>
      updateWorkspaceProfile(...args),
  };
});

function renderCrop(overrides: Partial<WorkspaceProfile> = {}) {
  const profile = { ...EMPTY_WORKSPACE_PROFILE, ...overrides };
  const onProfileChange = vi.fn();
  render(
    <WorkspaceLogoCrop
      profile={profile}
      brandName="Acme Studio"
      onProfileChange={onProfileChange}
      onError={vi.fn()}
      onNotice={vi.fn()}
    />,
  );
  return { onProfileChange };
}

describe("WorkspaceLogoCrop", () => {
  beforeEach(() => {
    cropWorkspaceLogo.mockReset();
    uploadWorkspaceLogoCrop.mockReset();
    updateWorkspaceProfile.mockReset();
  });

  it("invites an upload and shows the brand initial when no logo is set", () => {
    renderCrop();
    expect(
      screen.getByRole("button", { name: "Upload studio logo" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Adjust crop" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove logo" }),
    ).not.toBeInTheDocument();
    // Placeholder shows the brand initial.
    expect(screen.getByText("A")).toBeVisible();
  });

  it("reveals crop sliders only after clicking Adjust crop on an existing logo", () => {
    renderCrop({
      logo_asset_id: "asset-1",
      logo_url: "/storage/ws/render.webp",
      logo_metadata: {
        storage_key: "/storage/ws/render.webp",
        original_storage_key: "/storage/ws/original.png",
        crop: { x: 0, y: 0, zoom: 1 },
      },
    });

    expect(screen.getByRole("button", { name: "Change logo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove logo" })).toBeVisible();
    expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));

    expect(screen.getByLabelText("Horizontal")).toBeVisible();
    expect(screen.getByLabelText("Vertical")).toBeVisible();
    expect(screen.getByLabelText("Zoom")).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply crop" })).toBeVisible();
  });

  it("does not offer Adjust crop when there is no re-croppable original", () => {
    renderCrop({
      logo_asset_id: "asset-1",
      logo_url: "/storage/ws/render.webp",
      logo_metadata: { storage_key: "/storage/ws/render.webp" },
    });
    expect(
      screen.queryByRole("button", { name: "Adjust crop" }),
    ).not.toBeInTheDocument();
  });

  it("Apply crop calls the workspace crop endpoint with the chosen position", async () => {
    const updated = {
      ...EMPTY_WORKSPACE_PROFILE,
      logo_asset_id: "asset-2",
      logo_url: "/storage/ws/render2.webp",
    };
    cropWorkspaceLogo.mockResolvedValue(updated);
    const { onProfileChange } = renderCrop({
      logo_asset_id: "asset-1",
      logo_url: "/storage/ws/render.webp",
      logo_metadata: {
        storage_key: "/storage/ws/render.webp",
        original_storage_key: "/storage/ws/original.png",
        crop: { x: 0, y: 0, zoom: 1 },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));

    await waitFor(() => expect(cropWorkspaceLogo).toHaveBeenCalledTimes(1));
    const [, pos] = cropWorkspaceLogo.mock.calls[0];
    expect(pos).toMatchObject({ zoom: 2 });
    await waitFor(() => expect(onProfileChange).toHaveBeenCalledWith(updated));
  });

  it("Cancel hides the sliders without calling the crop endpoint", () => {
    renderCrop({
      logo_asset_id: "asset-1",
      logo_url: "/storage/ws/render.webp",
      logo_metadata: {
        storage_key: "/storage/ws/render.webp",
        original_storage_key: "/storage/ws/original.png",
        crop: { x: 0, y: 0, zoom: 1 },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Adjust crop" }));
    expect(screen.getByLabelText("Zoom")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Zoom")).not.toBeInTheDocument();
    expect(cropWorkspaceLogo).not.toHaveBeenCalled();
  });
});
