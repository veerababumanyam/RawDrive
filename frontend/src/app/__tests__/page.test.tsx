import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

describe("Landing Page", () => {
  it("renders the hero headline", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Professional Photography,\s*Simplified/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders hero CTAs", () => {
    render(<LandingPage />);
    expect(screen.getAllByText("Start Free Trial").length).toBeGreaterThan(0);
    expect(screen.getByText("Watch Demo")).toBeInTheDocument();
    expect(screen.getByText("See Pricing")).toBeInTheDocument();
  });

  it("renders 6 feature cards", () => {
    render(<LandingPage />);
    expect(screen.getByText("Gallery Management")).toBeInTheDocument();
    expect(screen.getByText("Client Proofing")).toBeInTheDocument();
    expect(screen.getByText("GST Invoicing")).toBeInTheDocument();
    expect(screen.getByText("AI Smart Culling")).toBeInTheDocument();
    expect(screen.getByText("Live Streaming")).toBeInTheDocument();
    expect(screen.getByText("Booking Calendar")).toBeInTheDocument();
  });

  it("renders the studio workflow section", () => {
    render(<LandingPage />);
    expect(screen.getByText("Everything your studio needs")).toBeInTheDocument();
    expect(screen.getByText("Trusted by Indian Photographers")).toBeInTheDocument();
  });

  it("renders social proof and growth stats", () => {
    render(<LandingPage />);
    expect(screen.getAllByText(/5,000\+/).length).toBeGreaterThan(0);
    expect(screen.getByText("Active Studios")).toBeInTheDocument();
    expect(screen.getByText("Photos Delivered")).toBeInTheDocument();
    expect(screen.getByText("Revenue Processed")).toBeInTheDocument();
  });

  it("renders Made in India badge", () => {
    render(<LandingPage />);
    expect(screen.getByText("Made in India")).toBeInTheDocument();
  });

  it("renders the closing studio CTA", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(/From first inquiry to final delivery, RawDrive keeps the whole studio moving\./i),
    ).toBeInTheDocument();
  });
});
