import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
  getStoredPlatformRole: vi.fn(() => "super_admin"),
}));

vi.mock("@/lib/api/admin", () => ({
  createPricingChangeRequest: vi.fn(),
  getAdminPricingCatalog: vi.fn(),
  listPricingChangeRequests: vi.fn(),
  submitPricingChangeRequest: vi.fn(),
  approvePricingChangeRequest: vi.fn(),
  rejectPricingChangeRequest: vi.fn(),
  publishPricingChangeRequest: vi.fn(),
}));

import {
  approvePricingChangeRequest,
  createPricingChangeRequest,
  getAdminPricingCatalog,
  listPricingChangeRequests,
  publishPricingChangeRequest,
  submitPricingChangeRequest,
  type AdminBillingProduct,
  type AdminPlan,
} from "@/lib/api/admin";
import AdminPlansPage from "../plans/page";

const mockGetAdminPricingCatalog = vi.mocked(getAdminPricingCatalog);
const mockListPricingChangeRequests = vi.mocked(listPricingChangeRequests);
const mockCreatePricingChangeRequest = vi.mocked(createPricingChangeRequest);
const mockSubmitPricingChangeRequest = vi.mocked(submitPricingChangeRequest);
const mockApprovePricingChangeRequest = vi.mocked(approvePricingChangeRequest);
const mockPublishPricingChangeRequest = vi.mocked(publishPricingChangeRequest);

function planFixture(overrides: Partial<AdminPlan>): AdminPlan {
  return {
    tier: "creator",
    name: "Creator",
    description: "Side photographers moving into paid client delivery.",
    currency: "INR",
    monthly_price_paise: 49900,
    annual_price_paise: 499000,
    quota_bytes: 100 * 2 ** 30,
    gallery_limit: 10,
    client_limit: -1,
    features: ["100GB Storage", "10 Events / Month"],
    popular: false,
    rank: 2,
    paid: true,
    active: true,
    self_serve: true,
    trial_days: 0,
    ...overrides,
  };
}

function productFixture(
  overrides: Partial<AdminBillingProduct>,
): AdminBillingProduct {
  return {
    code: "event_upload_standard",
    product_type: "event_upload",
    version_id: "version-1",
    version: 1,
    name: "Event upload",
    description: "One-off event upload cycle for occasional shoots.",
    currency: "INR",
    price_paise: 19900,
    billing_interval: "one_time",
    metadata: {
      active_days: 30,
      upload_window_days: 30,
      retention_days: 30,
      upload_credits: 500,
      quota_bytes: 10 * 2 ** 30,
    },
    rank: 10,
    active: true,
    effective_from: new Date("2026-06-07T00:00:00Z").toISOString(),
    ...overrides,
  };
}

const starterPlan = planFixture({
  tier: "free",
  name: "Starter",
  description: "Free starter gallery.",
  monthly_price_paise: 0,
  annual_price_paise: 0,
  quota_bytes: 5 * 2 ** 30,
  gallery_limit: 1,
  client_limit: 0,
  features: ["5GB storage"],
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
  monthly_price_paise: 99900,
  annual_price_paise: 999000,
  quota_bytes: 300 * 2 ** 30,
  gallery_limit: -1,
  features: ["300GB Storage", "Unlimited Events"],
  popular: true,
  rank: 3,
});
const studioPlan = planFixture({
  tier: "studio",
  name: "Studio",
  monthly_price_paise: 199900,
  annual_price_paise: 1999000,
  quota_bytes: 1024 * 2 ** 30,
  gallery_limit: -1,
  popular: true,
  rank: 4,
});
const elitePlan = planFixture({
  tier: "elite_studio",
  name: "Elite Studio",
  monthly_price_paise: 399900,
  annual_price_paise: 3999000,
  quota_bytes: 3 * 1024 * 2 ** 30,
  gallery_limit: -1,
  self_serve: true,
  rank: 5,
});

const eventUploadProduct = productFixture({});
const weddingUploadProduct = productFixture({
  code: "event_upload_wedding",
  name: "Wedding upload",
  description: "Longer upload cycle for weddings.",
  price_paise: 49900,
  metadata: {
    active_days: 30,
    upload_window_days: 30,
    retention_days: 30,
    upload_credits: 2000,
    quota_bytes: 50 * 2 ** 30,
  },
  rank: 20,
});
const extensionProduct = productFixture({
  code: "gallery_extend_30",
  product_type: "gallery_extension",
  name: "Extend +30 days",
  description: "Keep a gallery active for another 30 days.",
  price_paise: 4900,
  metadata: { extension_days: 30 },
  rank: 30,
});
const archiveProduct = productFixture({
  code: "gallery_archive_forever",
  product_type: "gallery_extension",
  name: "Download + archive forever",
  description: "Export the gallery package and keep it archived.",
  price_paise: 19900,
  metadata: { archive_forever: true },
  rank: 50,
});
const storageProduct = productFixture({
  code: "storage_boost_50",
  product_type: "storage_booster",
  name: "Boost 50",
  description: "Add 50GB recurring storage.",
  price_paise: 30000,
  billing_interval: "monthly",
  metadata: { quota_bytes: 50 * 2 ** 30 },
  rank: 60,
});

const catalogFixture = {
  generated_at: new Date("2026-06-07T00:00:00Z").toISOString(),
  plans: [
    starterPlan,
    payPerEventPlan,
    creatorPlan,
    proPlan,
    studioPlan,
    elitePlan,
  ],
  event_packs: [eventUploadProduct, weddingUploadProduct],
  gallery_extensions: [extensionProduct, archiveProduct],
  storage_boosters: [storageProduct],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdminPricingCatalog.mockResolvedValue(catalogFixture);
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
  mockApprovePricingChangeRequest.mockResolvedValue({
    id: "change-1",
    request_type: "plan_update",
    target_type: "subscription_plan",
    target_key: "creator",
    status: "approved",
    before_state: creatorPlan as unknown as Record<string, unknown>,
    after_state: {},
    impact_summary: {},
    email_preview: {},
    approval_comment: "Super admin direct publish",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  mockPublishPricingChangeRequest.mockResolvedValue({
    id: "change-1",
    request_type: "plan_update",
    target_type: "subscription_plan",
    target_key: "creator",
    status: "published",
    before_state: creatorPlan as unknown as Record<string, unknown>,
    after_state: {},
    impact_summary: {},
    email_preview: {},
    approval_comment: "Super admin direct publish",
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
});

describe("AdminPlansPage", () => {
  it("loads plans and billing products from the admin catalog", async () => {
    render(<AdminPlansPage />);

    expect(
      await screen.findByRole("heading", { name: "Pricing Catalog" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Starter")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pay Per Event")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Creator")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pro Photographer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Studio")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Elite Studio")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Event upload").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByDisplayValue("Wedding upload")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Extend +30 days")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Download + archive forever"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Boost 50")).toBeInTheDocument();
    expect(screen.getByText("active plans")).toBeInTheDocument();
    expect(screen.getByText("active products")).toBeInTheDocument();
  });

  it("saves and publishes plan edits for a super admin", async () => {
    render(<AdminPlansPage />);

    expect(await screen.findByDisplayValue("Creator")).toBeInTheDocument();

    fireEvent.change(screen.getAllByDisplayValue("499")[0], {
      target: { value: "149" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save & publish plan" })[2],
    );

    await waitFor(() => {
      expect(mockCreatePricingChangeRequest).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({
          request_type: "plan_update",
          target_type: "subscription_plan",
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
    expect(mockApprovePricingChangeRequest).toHaveBeenCalledWith(
      "test-token",
      "change-1",
      "Super admin direct publish",
    );
    expect(mockPublishPricingChangeRequest).toHaveBeenCalledWith(
      "test-token",
      "change-1",
    );
    expect(
      await screen.findByText("Creator plan saved and published."),
    ).toBeInTheDocument();
    expect(mockGetAdminPricingCatalog).toHaveBeenCalledTimes(2);
  });

  it("does not create a pricing change when a plan has no edits", async () => {
    render(<AdminPlansPage />);

    expect(await screen.findByDisplayValue("Creator")).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Save & publish plan" })[2],
    );

    expect(
      await screen.findByText("Creator plan has no changes to publish."),
    ).toBeInTheDocument();
    expect(mockCreatePricingChangeRequest).not.toHaveBeenCalled();
    expect(mockSubmitPricingChangeRequest).not.toHaveBeenCalled();
    expect(mockApprovePricingChangeRequest).not.toHaveBeenCalled();
    expect(mockPublishPricingChangeRequest).not.toHaveBeenCalled();
    expect(mockGetAdminPricingCatalog).toHaveBeenCalledTimes(2);
  });

  it("submits billing product edits with structured metadata", async () => {
    render(<AdminPlansPage />);

    const eventUploadFields =
      await screen.findAllByDisplayValue("Event upload");
    const eventUploadNameInput =
      eventUploadFields.find(
        (field) => field.tagName.toLowerCase() === "input",
      ) ?? eventUploadFields[0];

    fireEvent.change(eventUploadNameInput, {
      target: { value: "Event Upload Plus" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save & publish product" })[0],
    );

    await waitFor(() => {
      expect(mockCreatePricingChangeRequest).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({
          request_type: "product_update",
          target_type: "billing_product",
          target_key: "event_upload_standard",
          after_state: expect.objectContaining({
            code: "event_upload_standard",
            product_type: "event_upload",
            name: "Event Upload Plus",
            metadata: expect.objectContaining({
              active_days: 30,
              upload_window_days: 30,
              retention_days: 30,
              upload_credits: 500,
              quota_bytes: 10 * 2 ** 30,
            }),
          }),
        }),
      );
    });
  });

  it("requires quota metadata before submitting an active event product", async () => {
    mockGetAdminPricingCatalog.mockResolvedValueOnce({
      ...catalogFixture,
      event_packs: [
        {
          ...eventUploadProduct,
          metadata: {
            active_days: 30,
            upload_window_days: 30,
            retention_days: 30,
            upload_credits: 500,
          },
        },
      ],
    });
    render(<AdminPlansPage />);

    expect(
      (await screen.findAllByDisplayValue("Event upload")).length,
    ).toBeGreaterThan(0);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Save & publish product" })[0],
    );

    expect(
      await screen.findByText("Active event products require a storage quota."),
    ).toBeInTheDocument();
    expect(mockCreatePricingChangeRequest).not.toHaveBeenCalled();
  });
});
