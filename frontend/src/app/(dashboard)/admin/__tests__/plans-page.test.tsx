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

const creatorPlan: AdminPlan = {
  tier: "creator",
  name: "Creator",
  description: "For solo photographers.",
  currency: "INR",
  monthly_price_paise: 49900,
  annual_price_paise: 499000,
  quota_bytes: 100 * 2 ** 30,
  gallery_limit: 10,
  client_limit: -1,
  features: ["100GB Storage", "10 Events / Month"],
  popular: false,
  rank: 1,
  paid: true,
  active: true,
  self_serve: true,
  trial_days: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListAdminPlans.mockResolvedValue([creatorPlan]);
  mockUpdateAdminPlan.mockImplementation(async (_token, tier, input) => ({
    tier,
    ...input,
  }));
});

describe("AdminPlansPage", () => {
  it("loads tier plans and saves edits", async () => {
    render(<AdminPlansPage />);

    expect(await screen.findByRole("heading", { name: "Tier Plans" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Creator")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("499"), {
      target: { value: "149" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => {
      expect(mockUpdateAdminPlan).toHaveBeenCalledWith(
        "test-token",
        "creator",
        expect.objectContaining({
          monthly_price_paise: 14900,
          name: "Creator",
        }),
      );
    });
    expect(await screen.findByText("Creator plan updated.")).toBeInTheDocument();
  });
});
