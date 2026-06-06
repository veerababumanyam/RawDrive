import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  getStoredPlatformRole: vi.fn(() => "super_admin"),
}));

vi.mock("@/lib/api/admin", () => ({
  listAdminPlans: vi.fn(),
  updateAdminPlan: vi.fn(),
}));

import {
  listAdminPlans,
  updateAdminPlan,
  type AdminPlan,
} from "@/lib/api/admin";
import AdminPlansPage from "../plans/page";

const mockListAdminPlans = vi.mocked(listAdminPlans);
const mockUpdateAdminPlan = vi.mocked(updateAdminPlan);

const starterPlan: AdminPlan = {
  tier: "starter",
  name: "Starter",
  description: "For solo photographers.",
  currency: "INR",
  monthly_price_paise: 9900,
  annual_price_paise: 99000,
  quota_bytes: 30 * 2 ** 30,
  gallery_limit: 10,
  client_limit: 20,
  features: ["30GB Storage", "10 Galleries"],
  popular: false,
  rank: 1,
  paid: true,
  active: true,
  self_serve: true,
  trial_days: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListAdminPlans.mockResolvedValue([starterPlan]);
  mockUpdateAdminPlan.mockImplementation(async (_token, tier, input) => ({
    tier,
    ...input,
  }));
});

describe("AdminPlansPage", () => {
  it("loads tier plans and saves edits", async () => {
    render(<AdminPlansPage />);

    expect(await screen.findByRole("heading", { name: "Tier Plans" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Starter")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("99"), {
      target: { value: "149" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => {
      expect(mockUpdateAdminPlan).toHaveBeenCalledWith(
        "test-token",
        "starter",
        expect.objectContaining({
          monthly_price_paise: 14900,
          name: "Starter",
        }),
      );
    });
    expect(await screen.findByText("Starter plan updated.")).toBeInTheDocument();
  });
});
