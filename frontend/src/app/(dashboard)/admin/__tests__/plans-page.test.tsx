import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  getStoredPlatformRole: vi.fn(() => "super_admin"),
}));

vi.mock("@/lib/api/admin", () => ({
  createPricingChangeRequest: vi.fn(),
  listAdminPlans: vi.fn(),
  listPricingChangeRequests: vi.fn(),
  submitPricingChangeRequest: vi.fn(),
  approvePricingChangeRequest: vi.fn(),
  rejectPricingChangeRequest: vi.fn(),
  publishPricingChangeRequest: vi.fn(),
}));

import {
  createPricingChangeRequest,
  listAdminPlans,
  listPricingChangeRequests,
  submitPricingChangeRequest,
  type AdminPlan,
} from "@/lib/api/admin";
import AdminPlansPage from "../plans/page";

const mockListAdminPlans = vi.mocked(listAdminPlans);
const mockListPricingChangeRequests = vi.mocked(listPricingChangeRequests);
const mockCreatePricingChangeRequest = vi.mocked(createPricingChangeRequest);
const mockSubmitPricingChangeRequest = vi.mocked(submitPricingChangeRequest);

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
  mockListPricingChangeRequests.mockResolvedValue([]);
  mockCreatePricingChangeRequest.mockResolvedValue({
    id: "change-1",
    request_type: "plan_update",
    target_type: "subscription_plan",
    target_key: "creator",
    status: "draft",
    before_state: creatorPlan as unknown as Record<string, unknown>,
    after_state: {},
    impact_summary: {},
    email_preview: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  mockSubmitPricingChangeRequest.mockResolvedValue({
    id: "change-1",
    request_type: "plan_update",
    target_type: "subscription_plan",
    target_key: "creator",
    status: "pending_approval",
    before_state: creatorPlan as unknown as Record<string, unknown>,
    after_state: {},
    impact_summary: {},
    email_preview: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

describe("AdminPlansPage", () => {
  it("loads tier plans and submits edits for approval", async () => {
    render(<AdminPlansPage />);

    expect(await screen.findByRole("heading", { name: "Tier Plans" })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Creator")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("499"), {
      target: { value: "149" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit change" }));

    await waitFor(() => {
      expect(mockCreatePricingChangeRequest).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({
          request_type: "plan_update",
          target_key: "creator",
          after_state: expect.objectContaining({
            monthly_price_paise: 14900,
            name: "Creator",
          }),
        }),
      );
    });
    expect(mockSubmitPricingChangeRequest).toHaveBeenCalledWith(
      "test-token",
      "change-1",
    );
    expect(
      await screen.findByText("Creator pricing change submitted for approval."),
    ).toBeInTheDocument();
  });
});
