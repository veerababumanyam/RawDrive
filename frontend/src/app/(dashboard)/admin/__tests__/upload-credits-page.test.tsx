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

const fakeBalance: adminApi.AdminWorkspaceUploadBalance = {
  workspace_id: WORKSPACE_ID,
  available_credits: 1234,
  plan_granted: 200,
  purchased: 1000,
  reserved: 0,
  consumed: -66,
  refunded: 100,
  updated_at: "2026-04-21T10:00:00Z",
  low_balance: false,
  low_balance_threshold: 100,
};

describe("AdminUploadCreditsPage (/admin/upload-credits)", () => {
  it("renders the workspace list and exposes a per-row Grant button", async () => {
    vi.spyOn(adminApi, "listWorkspaces").mockResolvedValue({
      items: [fakeWorkspace],
      total_count: 1,
    });
    vi.spyOn(adminApi, "getAdminWorkspaceUploadBalance").mockResolvedValue(fakeBalance);

    render(<AdminUploadCreditsPage />);

    await waitFor(() => {
      expect(screen.getByText("Acme Studios")).toBeDefined();
    });

    expect(
      screen.getByTestId(`upload-credits-grant-action-${WORKSPACE_ID}`),
    ).toBeDefined();
    expect(screen.getByTestId("admin-upload-credits-page")).toBeDefined();
  });

  it("shows the available balance and granted/purchased breakdown per workspace", async () => {
    vi.spyOn(adminApi, "listWorkspaces").mockResolvedValue({
      items: [fakeWorkspace],
      total_count: 1,
    });
    vi.spyOn(adminApi, "getAdminWorkspaceUploadBalance").mockResolvedValue(fakeBalance);

    render(<AdminUploadCreditsPage />);

    // Wait until the balance has resolved — the cell should show the
    // en-IN-formatted available credits and the granted/purchased split
    // so the admin can gauge existing coverage before granting more.
    await waitFor(() => {
      const available = screen.getByTestId(`balance-available-${WORKSPACE_ID}`);
      expect(available.textContent).toBe("1,234");
    });
    const breakdown = screen.getByTestId(`balance-breakdown-${WORKSPACE_ID}`);
    expect(breakdown.textContent).toBe("200 / 1,000");
  });

  it("surfaces a balance error inline when the admin balance endpoint fails", async () => {
    vi.spyOn(adminApi, "listWorkspaces").mockResolvedValue({
      items: [fakeWorkspace],
      total_count: 1,
    });
    vi.spyOn(adminApi, "getAdminWorkspaceUploadBalance").mockRejectedValue(
      new Error("Balance lookup failed: HTTP 500"),
    );

    render(<AdminUploadCreditsPage />);

    // Failed balance must render as a visible "error" marker so admins
    // aren't fooled by a silent zero (the whole reason the admin
    // endpoint 500s instead of falling back on the server side).
    await waitFor(() => {
      expect(screen.getByTestId(`balance-error-${WORKSPACE_ID}`)).toBeDefined();
    });
  });

  it("opens GrantUploadCreditsDialog for the selected workspace on click and refreshes balance after grant", async () => {
    vi.spyOn(adminApi, "listWorkspaces").mockResolvedValue({
      items: [fakeWorkspace],
      total_count: 1,
    });
    const balanceSpy = vi
      .spyOn(adminApi, "getAdminWorkspaceUploadBalance")
      .mockResolvedValue(fakeBalance);

    render(<AdminUploadCreditsPage />);

    // Wait for the initial balance load so we can count fetches reliably.
    await waitFor(() => {
      expect(balanceSpy).toHaveBeenCalledTimes(1);
    });

    const action = screen.getByTestId(`upload-credits-grant-action-${WORKSPACE_ID}`);
    fireEvent.click(action);

    await waitFor(() => {
      const dialog = screen.getByTestId("grant-upload-credits-dialog");
      expect(dialog).toBeDefined();
      expect(dialog.textContent).toContain("Acme Studios");
    });

    // Simulate a successful grant by firing the dialog's submit path.
    // We set up the fetch stub the dialog uses via window.fetch so a
    // 200 triggers onGranted → page re-fetches the workspace's balance.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ledger_entry_id: "entry-xyz",
          workspace_id: WORKSPACE_ID,
          amount_credits: 500,
          idempotency_key: "ignored",
          created_at: "2026-04-21T10:05:00Z",
        }),
      } as Response),
    );

    fireEvent.change(screen.getByTestId("grant-upload-credits-amount"), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByTestId("grant-upload-credits-reason"), {
      target: { value: "Top-up for Acme" },
    });
    fireEvent.click(screen.getByTestId("grant-upload-credits-submit"));

    // After the grant succeeds the page must re-query the balance for
    // the affected workspace (admin expects the number to tick up
    // without a full reload).
    await waitFor(() => {
      expect(balanceSpy).toHaveBeenCalledTimes(2);
    });
    expect(balanceSpy.mock.calls[1][1]).toBe(WORKSPACE_ID);
  });
});
