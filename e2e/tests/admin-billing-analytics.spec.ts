import { expect, test, type Route } from "@playwright/test";

const accessToken = makeJwt({
  sub: "00000000-0000-4000-8000-000000000001",
  workspace_id: "00000000-0000-4000-8000-000000000002",
  role: "Owner",
  platform_role: "super_admin",
  state_id: "1",
  mfa_verified: true,
  impersonation: false,
});

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.`;
}

function corsHeadersFor(route: Route): Record<string, string> {
  return {
    "access-control-allow-origin":
      route.request().headers().origin ?? "http://localhost:3000",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };
}

async function fulfillJSON(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeadersFor(route),
    body: JSON.stringify(body),
  });
}

const analyticsPayload = {
  generated_at: "2026-06-06T09:58:42.996862875Z",
  window_days: 30,
  summary: {
    active_subscribers: 128,
    mrr_paise: 8425000,
    arr_paise: 101100000,
    subscription_revenue_paise: 11950000,
    storage_booster_revenue_paise: 2800000,
    expiry_extension_revenue_paise: 760000,
    event_upload_revenue_paise: 440000,
    active_storage_boosters: 19,
    churn_risk_count: 7,
    pending_renewal_failures: 2,
    pending_pricing_approvals: 3,
    safe_reduction_overage_workspaces: 4,
  },
  plans: [
    {
      tier_slug: "studio",
      plan_name: "Studio",
      active_subscribers: 52,
      past_due_subscribers: 1,
      mrr_paise: 5194800,
      arr_paise: 62337600,
      quota_bytes: 2199023255552,
    },
    {
      tier_slug: "pro_photographer",
      plan_name: "Pro Photographer",
      active_subscribers: 76,
      past_due_subscribers: 2,
      mrr_paise: 3230200,
      arr_paise: 38762400,
      quota_bytes: 1099511627776,
    },
  ],
  revenue_by_product: [
    {
      order_type: "storage_booster",
      paid_orders: 14,
      revenue_paise: 2800000,
      average_paise: 200000,
    },
    {
      order_type: "gallery_extension",
      paid_orders: 8,
      revenue_paise: 760000,
      average_paise: 95000,
    },
  ],
  lifecycle: {
    due_renewal_reminders: 11,
    due_expiry_warnings: 6,
    due_deletion_warnings: 2,
    failed_lifecycle_jobs: 1,
    queued_pricing_email_batches: 3,
    sent_proofs: 42,
    failed_proofs: 1,
  },
  approvals: {
    draft: 1,
    pending_approval: 3,
    approved: 2,
    published: 5,
    rejected: 1,
  },
  recent_orders: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      source_table: "billing_orders",
      order_type: "storage_booster",
      target_type: "workspace",
      target_id: "00000000-0000-4000-8000-000000000002",
      status: "paid",
      provider: "razorpay",
      amount_paise: 200000,
      currency: "INR",
      workspace_id: "00000000-0000-4000-8000-000000000002",
      created_at: "2026-06-05T09:00:00Z",
      paid_at: "2026-06-05T09:01:00Z",
    },
  ],
};

test("super admin can view the billing analytics dashboard", async ({ page }) => {
  await page.route("**/auth/refresh", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeadersFor(route) });
      return;
    }
    await fulfillJSON(route, { access_token: accessToken });
  });

  await page.route("**/api/v1/auth/me", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeadersFor(route) });
      return;
    }
    await fulfillJSON(route, {
      display_name: "Platform Owner",
      email: "superadmin@rawdrive.test",
      avatar_url: "",
      plan_tier: "enterprise",
      must_change_password: false,
    });
  });

  await page.route("**/api/v1/admin/billing-analytics**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeadersFor(route) });
      return;
    }
    await fulfillJSON(route, analyticsPayload);
  });

  await page.goto("/admin/billing-analytics");

  await expect(page.getByRole("heading", { name: "Billing Analytics" })).toBeVisible();
  await expect(page.locator("p", { hasText: /^MRR$/ }).first()).toBeVisible();
  await expect(page.getByText("₹84,250")).toBeVisible();
  await expect(page.getByText("Active Subscribers")).toBeVisible();
  await expect(page.getByText("128")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product Revenue" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Storage Booster", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subscribers by Plan" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Pro Photographer/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Orders" })).toBeVisible();

  await page.screenshot({
    path: "_cobolt-output/admin-billing-analytics-dashboard.png",
    fullPage: true,
  });
});
