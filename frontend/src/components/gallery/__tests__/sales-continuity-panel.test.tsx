import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SalesContinuityPanel } from "../sales-continuity-panel";

describe("SalesContinuityPanel", () => {
  it("renders a working invoice link when invoiceId is set", () => {
    render(
      <SalesContinuityPanel
        invoiceId="inv-42"
        dealId="deal-1"
        projectId="proj-1"
        cartCount={3}
      />,
    );
    const link = screen.getByTestId("sales-invoice-link");
    expect(link.getAttribute("href")).toBe("/invoices/inv-42");
    expect(screen.getByTestId("sales-cart-count")).toHaveTextContent("3");
    expect(screen.getAllByText("Linked")).toHaveLength(2); // deal + project
  });

  it('shows "Not linked" when records are absent', () => {
    render(<SalesContinuityPanel />);
    expect(screen.queryByTestId("sales-invoice-link")).toBeNull();
    expect(screen.getAllByText("Not linked").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId("sales-cart-count")).toHaveTextContent("0");
  });
});
