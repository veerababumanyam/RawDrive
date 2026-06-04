import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import InquiriesPage from "../inquiries/page";

const listLeads = vi.fn();
const createLead = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/crm/inquiries",
}));

vi.mock("@/lib/auth", () => ({
  getStoredAccessToken: () => "test-token",
}));

vi.mock("@/lib/api/crm", () => ({
  listLeads: (...args: unknown[]) => listLeads(...args),
  createLead: (...args: unknown[]) => createLead(...args),
}));

vi.mock("@/components/crm/marketplace-inquiries-panel", () => ({
  MarketplaceInquiriesPanel: () => <div>Marketplace inquiries panel</div>,
}));

describe("CRM inquiries page", () => {
  beforeEach(() => {
    listLeads.mockReset();
    createLead.mockReset();
    listLeads.mockResolvedValue([]);
  });

  it("renders the inquiry pipeline empty state", async () => {
    render(<InquiriesPage />);

    expect(
      await screen.findByRole("heading", { name: "Inquiry Pipeline" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(listLeads).toHaveBeenCalledWith("test-token", undefined);
    });

    expect(screen.getByText("No inquiries yet")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "List view" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Kanban view" }),
    ).toBeInTheDocument();
  });
});
