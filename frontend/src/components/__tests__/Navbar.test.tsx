import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Navbar } from "@/components/layout/Navbar";

describe("Navbar", () => {
  it("renders the RawDrive logo", () => {
    render(<Navbar />);
    expect(screen.getByText("RawDrive")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    render(<Navbar />);
    const featuresLinks = screen.getAllByText("Features");
    const pricingLinks = screen.getAllByText("Pricing");
    expect(featuresLinks.length).toBeGreaterThan(0);
    expect(pricingLinks.length).toBeGreaterThan(0);
  });

  it("renders login and get started links", () => {
    render(<Navbar />);
    const loginLinks = screen.getAllByText("Login");
    const getStartedLinks = screen.getAllByText("Get Started");
    expect(loginLinks.length).toBeGreaterThan(0);
    expect(getStartedLinks.length).toBeGreaterThan(0);
  });

  it("toggles mobile menu on hamburger click", () => {
    render(<Navbar />);
    const menuButton = screen.getByLabelText("Open menu");
    fireEvent.click(menuButton);
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
  });

  it("has sticky positioning", () => {
    render(<Navbar />);
    const header = screen.getByRole("banner");
    expect(header.className).toContain("sticky");
  });
});
