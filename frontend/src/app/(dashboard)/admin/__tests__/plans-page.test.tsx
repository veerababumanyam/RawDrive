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

function planFixture(overrides: Partial<AdminPlan>): AdminPlan {
  return {
    tier: "creator",
    name: "Creator",
    description: "Side & weekend photographers getting started.",
    currency: "INR",
    monthly_price_paise: 49900,
    annual_price_paise: 499000,
    quota_bytes: 100 * 2 ** 30,
    gallery_limit: 10,
    client_limit: -1,
    features: ["100 GB storage", "10 events / month"],
    popular: false,
    rank: 2,
    paid: true,
    active: true,
    self_serve: true,
    trial_days: 0,
    ...overrides,
  };
}

const starterPlan = planFixture({
  tier: "free",
  name: "Starter",
  description: "Hook beginners.",
  monthly_price_paise: 0,
  annual_price_paise: 0,
  quota_bytes: 5 * 2 ** 30,
  gallery_limit: 1,
  client_limit: 0,
  features: ["5 GB storage"],
  paid: false,
  rank: 0,
});
const payPerEventPlan = planFixture({
  tier: "pay_per_event",
  name: "Pay Per Event",
  monthly_price_paise: 19900,
  annual_price_paise: 0,
  quota_bytes: 0,
  gallery_limit: 1,
  client_limit: 0,
  features: ["Event upload"],
  self_serve: false,
  rank: 1,
});
const creatorPlan = planFixture({});
const proPlan = planFixture({
  tier: "pro_photographer",
  name: "Pro Photographer",
  description: "The main money plan for working pros.",
  monthly_price_paise: 99900,
  annual_price_paise: 999000,
  quota_bytes: 300 * 2 ** 30,
  gallery_limit: -1,
  features: ["300 GB storage", "Unlimited events"],
  popular: true,
  rank: 3,
});
const studioPlan = planFixture({
  tier: "studio",
  name: "Studio",
  description: "Studios with a team and a brand to protect.",
  monthly_price_paise: 199900,
  annual_price_paise: 1999000,
  quota_bytes: 1024 * 2 ** 30,
  gallery_limit: -1,
  features: ["1 TB storage", "Unlimited everything"],
  popular: true,
  rank: 4,
});
const elitePlan = planFixture({
  tier: "elite_studio",
  name: "Elite Studio",
  description: "High-end & multi-branch studios.",
  monthly_price_paise: 399900,
  annual_price_paise: 3999000,
  quota_bytes: 3 * 1024 * 2 ** 30,
  gallery_limit: -1,
  features: ["3 TB+ storage", "Multi-branch studio support"],
  self_serve: false,
  rank: 5,
});

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

    expect(
      await screen.findByRole("heading", { name: "Paid Tier Plans" }),
    ).toBeInTheDocument();
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

  it("shows only editable paid subscription tiers", async () => {
    mockListAdminPlans.mockResolvedValueOnce([
      starterPlan,
      payPerEventPlan,
      creatorPlan,
      proPlan,
      studioPlan,
      elitePlan,
    ]);

    render(<AdminPlansPage />);

    expect(await screen.findByDisplayValue("Creator")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pro Photographer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Studio")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Elite Studio")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Starter")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Pay Per Event")).not.toBeInTheDocument();
    expect(screen.getByText("MOST POPULAR")).toBeInTheDocument();
    expect(screen.getByText("BEST VALUE")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("active paid plans")).toBeInTheDocument();
  });
});
