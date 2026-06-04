import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

describe("Footer", () => {
  it("renders the CoBolt powered-by logo", () => {
    render(<Footer />);
    expect(screen.getByAltText("CoBolt Logo")).toBeInTheDocument();
  });

  it("renders RawDrive contact details without public Swaz branding", () => {
    const { container } = render(<Footer />);

    expect(screen.getByAltText("RawDrive Logo")).toBeInTheDocument();
    expect(screen.getByText("info@rawdrive.in")).toBeInTheDocument();
    expect(screen.getByText("support@rawdrive.in")).toBeInTheDocument();
    expect(screen.getByText("contactus@rawdrive.in")).toBeInTheDocument();
    // Each phone number is its own formatted tel: link — no "contact:" prefix,
    // no two-numbers-but-one-href bug (public-pages review 2026-06-04, P0 #1).
    const firstPhone = screen.getByText("+91 92811 2993");
    expect(firstPhone.closest("a")).toHaveAttribute("href", "tel:+91928112993");
    const secondPhone = screen.getByText("+91 90100 12299");
    expect(secondPhone.closest("a")).toHaveAttribute(
      "href",
      "tel:+919010012299",
    );
    expect(screen.queryByText(/contact:\+91/)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/Swaz Consultants/i);
    expect(container.innerHTML).not.toMatch(/swaz-consultants-logo/i);

    // No arbitrary hex utility (text-[#......]) anywhere in the rendered footer.
    expect(container.innerHTML).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/);
  });
});
