import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CRMPage from "../page";

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/api/crm", () => ({
  listLeads: vi.fn(async () => [
    {
      id: "lead-1",
      name: "Anika Wedding",
      source: "instagram",
      stage: "qualified",
      event_type: "wedding",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
  ]),
  listProjects: vi.fn(async () => [
    {
      id: "project-1",
      contact_id: "contact-1",
      name: "Anika + Rohan",
      project_type: "wedding",
      status: "booked",
      expected_value_paisa: 20000000,
      booked_value_paisa: 20000000,
      balance_due_paisa: 0,
      contract_status: "not_started",
      gallery_status: "not_started",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
  ]),
}));

vi.mock("@/lib/api/billing", () => ({
  listInvoices: vi.fn(async () => [
    {
      id: "invoice-1",
      invoice_number: "INV-1",
      invoice_type: "tax_invoice",
      status: "sent",
      subtotal_paisa: 100000,
      cgst_paisa: 9000,
      sgst_paisa: 9000,
      igst_paisa: 0,
      total_paisa: 118000,
      amount_paid_paisa: 18000,
      line_items: [],
      created_at: "2026-04-01T00:00:00Z",
    },
  ]),
  formatPaisa: (paisa: number) => `Rs ${(paisa / 100).toLocaleString("en-IN")}`,
}));

vi.mock("@/lib/api/calendar", () => ({
  listEvents: vi.fn(async () => [
    {
      id: "event-1",
      title: "Wedding shoot",
      event_type: "shoot",
      start_at: "2026-04-20T09:00:00Z",
      end_at: "2026-04-20T18:00:00Z",
      all_day: false,
      status: "confirmed",
      workspace_id: "workspace-1",
      created_at: "2026-04-01T00:00:00Z",
    },
  ]),
}));

vi.mock("@/lib/api/galleries", () => ({
  listGalleries: vi.fn(async () => [
    {
      id: "gallery-1",
      title: "Wedding Gallery",
      slug: "wedding-gallery",
      description: "",
      gallery_type: "proofing",
      is_published: true,
      max_selections: 0,
      status: "active",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
  ]),
}));

describe("Studio CRM overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a business overview rather than the old lead-only pipeline", async () => {
    render(<CRMPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /studio crm/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/today in your studio/i)).toBeInTheDocument();
    expect(screen.getByText(/hot inquiries/i)).toBeInTheDocument();
    expect(screen.getByText(/upcoming shoots/i)).toBeInTheDocument();
    expect(screen.getByText(/overdue invoices/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /lead pipeline/i }),
    ).not.toBeInTheDocument();
  });
});
