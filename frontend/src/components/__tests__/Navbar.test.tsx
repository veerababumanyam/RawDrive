import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

function renderNavbar() {
  return render(
    <ThemeProvider>
      <Navbar />
    </ThemeProvider>,
  );
}

describe("Navbar", () => {
  it("renders the RawDrive logo", () => {
    renderNavbar();
    expect(screen.getByText("RawDrive")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    renderNavbar();
    const productsLinks = screen.getAllByText("Products & Solutions");
    const pricingLinks = screen.getAllByText("Pricing");
    const partnerProgramLinks = screen.getAllByText("Partner Program");
    expect(productsLinks.length).toBeGreaterThan(0);
    expect(pricingLinks.length).toBeGreaterThan(0);
    expect(partnerProgramLinks.length).toBeGreaterThan(0);
  });

  it("renders login and get started links", () => {
    renderNavbar();
    const loginLinks = screen.getAllByText("Login");
    const getStartedLinks = screen.getAllByText("Get Started");
    expect(loginLinks.length).toBeGreaterThan(0);
    expect(getStartedLinks.length).toBeGreaterThan(0);
  });

  it("toggles mobile menu on hamburger click", () => {
    renderNavbar();
    const menuButton = screen.getByLabelText("Open menu");
    fireEvent.click(menuButton);
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("has sticky positioning", () => {
    renderNavbar();
    const header = screen.getByRole("banner");
    expect(header.className).toContain("sticky");
  });
});
