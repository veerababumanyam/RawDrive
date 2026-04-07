import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PricingContent } from "@/components/pricing/PricingContent";

describe("Pricing Page", () => {
  it("renders the pricing headline", () => {
    render(<PricingContent />);
    expect(screen.getByText("Pricing Plans")).toBeInTheDocument();
  });

  it("renders all 5 plan cards", () => {
    render(<PricingContent />);
    // Plan names appear in cards and in comparison table header
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Starter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Professional").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Business").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enterprise").length).toBeGreaterThan(0);
  });

  it("shows Popular badge on Professional plan", () => {
    render(<PricingContent />);
    expect(screen.getByText("Popular")).toBeInTheDocument();
  });

  it("toggles between monthly and annual billing", () => {
    render(<PricingContent />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("renders feature comparison table", () => {
    render(<PricingContent />);
    expect(screen.getByText("Feature Comparison")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
  });

  it("renders storage boosters", () => {
    render(<PricingContent />);
    expect(screen.getByText("Storage Boosters")).toBeInTheDocument();
    expect(screen.getByText("50GB Booster")).toBeInTheDocument();
  });

  it("renders streaming packs", () => {
    render(<PricingContent />);
    expect(screen.getByText("Streaming Session Packs")).toBeInTheDocument();
    expect(screen.getByText("5 Sessions")).toBeInTheDocument();
  });

  it("renders FAQ section with 8 items", () => {
    render(<PricingContent />);
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("Is there a free trial?")).toBeInTheDocument();
    expect(screen.getByText("Is my data stored in India?")).toBeInTheDocument();
  });

  it("renders coupon code input", () => {
    render(<PricingContent />);
    expect(screen.getByPlaceholderText("Enter coupon code")).toBeInTheDocument();
  });
});
