import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

describe("Landing Page", () => {
  it("renders the hero headline", () => {
    render(<LandingPage />);
    expect(
      screen.getByText("The Operating System for Photography Businesses in India")
    ).toBeInTheDocument();
  });

  it("renders hero CTAs", () => {
    render(<LandingPage />);
    expect(screen.getByText("Get Started Free")).toBeInTheDocument();
    expect(screen.getByText("See Pricing")).toBeInTheDocument();
  });

  it("renders 6 feature cards", () => {
    render(<LandingPage />);
    expect(screen.getByText("Gallery Delivery")).toBeInTheDocument();
    expect(screen.getByText("Client Proofing")).toBeInTheDocument();
    expect(screen.getByText("AI Culling")).toBeInTheDocument();
    expect(screen.getByText("CRM & Bookings")).toBeInTheDocument();
    expect(screen.getByText("Live Streaming")).toBeInTheDocument();
    expect(screen.getByText("Marketplaces")).toBeInTheDocument();
  });

  it("renders pricing teaser", () => {
    render(<LandingPage />);
    expect(screen.getByText("Simple, Transparent Pricing")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Professional")).toBeInTheDocument();
  });

  it("renders social proof stats", () => {
    render(<LandingPage />);
    expect(screen.getByText("10,000+")).toBeInTheDocument();
    expect(screen.getByText("Photographers")).toBeInTheDocument();
  });

  it("renders Made in India badge", () => {
    render(<LandingPage />);
    expect(screen.getByText("Made in India")).toBeInTheDocument();
  });

  it("contains JSON-LD structured data", () => {
    render(<LandingPage />);
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBeGreaterThan(0);
  });
});
