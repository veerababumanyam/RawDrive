import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import RefundPage from "@/app/refund/page";
import LegalPage from "@/app/legal/page";
import ContactPage from "@/app/contact/page";

describe("Legal Notice Page", () => {
  it("keeps the legal operator details on the dedicated legal page", () => {
    render(<LegalPage />);
    expect(screen.getByText("Legal Notice")).toBeInTheDocument();
    expect(screen.getByText("Swaz Consultants Pvt. Ltd.")).toBeInTheDocument();
    expect(screen.getByAltText("Swaz Consultants logo")).toBeInTheDocument();
  });

  it("uses the approved public contact addresses", () => {
    render(<LegalPage />);
    expect(screen.getByText("info@rawdrive.in")).toBeInTheDocument();
    expect(screen.getByText("support@rawdrive.in")).toBeInTheDocument();
    expect(screen.getByText("contactus@rawdrive.in")).toBeInTheDocument();
  });
});

describe("Contact Page", () => {
  it("shows the approved phone and WhatsApp contacts", () => {
    render(<ContactPage />);
    expect(
      screen.getByText("contact:+91 928112993 ,+91 9010012299"),
    ).toBeInTheDocument();
  });
});

describe("Privacy Page", () => {
  it("renders the privacy policy heading", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("has 12 numbered sections", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("1. Introduction")).toBeInTheDocument();
    expect(screen.getByText("12. Changes to This Policy")).toBeInTheDocument();
  });

  it("mentions DPDPA compliance", () => {
    render(<PrivacyPage />);
    const elements = screen.getAllByText(/DPDPA/);
    expect(elements.length).toBeGreaterThan(0);
  });

  it("mentions GDPR compliance", () => {
    render(<PrivacyPage />);
    const elements = screen.getAllByText(/GDPR/);
    expect(elements.length).toBeGreaterThan(0);
  });
});

describe("Terms of Service Page", () => {
  it("renders the terms heading", () => {
    render(<TermsPage />);
    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
  });

  it("has 13 numbered sections", () => {
    render(<TermsPage />);
    expect(screen.getByText("1. Acceptance of Terms")).toBeInTheDocument();
    expect(screen.getByText("13. Changes to Terms")).toBeInTheDocument();
  });

  it("includes marketplace disclaimers", () => {
    render(<TermsPage />);
    expect(screen.getByText("8. Marketplace Disclaimers")).toBeInTheDocument();
  });
});

describe("Refund Policy Page", () => {
  it("renders the refund heading", () => {
    render(<RefundPage />);
    expect(screen.getByText("Refund Policy")).toBeInTheDocument();
  });

  it("has 8 numbered sections", () => {
    render(<RefundPage />);
    expect(screen.getByText("1. Overview")).toBeInTheDocument();
    expect(screen.getByText("8. Contact Information")).toBeInTheDocument();
  });

  it("mentions 7-day refund guarantee", () => {
    render(<RefundPage />);
    expect(screen.getByText("2. 7-Day Refund Guarantee")).toBeInTheDocument();
  });
});
