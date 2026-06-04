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
    expect(
      screen.getByText("contact:+91 928112993 ,+91 9010012299"),
    ).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/Swaz Consultants/i);
    expect(container.innerHTML).not.toMatch(/swaz-consultants-logo/i);

    // No arbitrary hex utility (text-[#......]) anywhere in the rendered footer.
    expect(container.innerHTML).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/);
  });
});
