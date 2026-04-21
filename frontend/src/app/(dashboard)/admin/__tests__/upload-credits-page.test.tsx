import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import AdminUploadCreditsPage from "../upload-credits/page";
import { persistAuthTokens, clearAuthTokens } from "@/lib/auth";
import * as adminApi from "@/lib/api/admin";

beforeEach(() => {
  persistAuthTokens("test-token");
});

afterEach(() => {
  clearAuthTokens();
  vi.restoreAllMocks();
});

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000abc";

const fakeWorkspace = {
  id: WORKSPACE_ID,
  name: "Acme Studios",
  owner_id: "o1",
  owner_name: "Owner One",
  owner_email: "owner@example.com",
  state_id: "s1",
  state_name: "Karnataka",
  storage_used_bytes: 1_000_000,
  asset_count: 42,
  subscription_tier: "Pro",
  created_at: "2025-01-01T00:00:00Z",
  status: "active",
} as adminApi.WorkspaceOverview;

describe("AdminUploadCreditsPage (/admin/upload-credits)", () => {
  it("renders the workspace list and exposes a per-row Grant button", async () => {
    vi.spyOn(adminApi, "listWorkspaces").mockResolvedValue({
      items: [fakeWorkspace],
      total_count: 1,
    });

    render(<AdminUploadCreditsPage />);

    await waitFor(() => {
      expect(screen.getByText("Acme Studios")).toBeDefined();
    });

    // The action button is the load-bearing UX element here — it's the
    // "option for admin to set credits for upload" the user was looking
    // for. Regression lock so a future refactor can't silently drop it.
    expect(
      screen.getByTestId(`upload-credits-grant-action-${WORKSPACE_ID}`),
    ).toBeDefined();
    expect(screen.getByTestId("admin-upload-credits-page")).toBeDefined();
  });

  it("opens GrantUploadCreditsDialog for the selected workspace on click", async () => {
    vi.spyOn(adminApi, "listWorkspaces").mockResolvedValue({
      items: [fakeWorkspace],
      total_count: 1,
    });

    render(<AdminUploadCreditsPage />);

    const action = await waitFor(() =>
      screen.getByTestId(`upload-credits-grant-action-${WORKSPACE_ID}`),
    );
    fireEvent.click(action);

    // The grant dialog carries the workspace name in its header — proves
    // the click handler threaded the correct row through to state.
    await waitFor(() => {
      const dialog = screen.getByTestId("grant-upload-credits-dialog");
      expect(dialog).toBeDefined();
      expect(dialog.textContent).toContain("Acme Studios");
    });
  });
});
