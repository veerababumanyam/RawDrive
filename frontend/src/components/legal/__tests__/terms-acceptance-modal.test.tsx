import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { TermsAcceptanceModal } from "@/components/legal/terms-acceptance-modal";
import * as legalApi from "@/lib/api/legal";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api/legal", () => ({
  getCurrentTerms: vi.fn(),
  acceptTerms: vi.fn(),
  getTermsStatus: vi.fn(),
}));

const mockedLegal = vi.mocked(legalApi);

const sampleTerms = {
  version: "tos-privacy/2026-04",
  effective_at: "2026-04-01T00:00:00Z",
  document_types: ["terms_of_service", "privacy_policy"],
  text: "You warrant you own all uploaded content.",
  hash: "abc123",
};

describe("TermsAcceptanceModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLegal.getCurrentTerms.mockResolvedValue(sampleTerms);
    mockedLegal.acceptTerms.mockResolvedValue(undefined);
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <TermsAcceptanceModal
        open={false}
        token="t"
        onAccepted={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("loads and shows the operative terms text when open", async () => {
    render(
      <TermsAcceptanceModal
        open
        token="t"
        onAccepted={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("You warrant you own all uploaded content."),
    ).toBeInTheDocument();
    expect(mockedLegal.getCurrentTerms).toHaveBeenCalledWith("t");
  });

  it("disables Accept until the box is checked, then records acceptance", async () => {
    const onAccepted = vi.fn();
    render(
      <TermsAcceptanceModal
        open
        token="t"
        onAccepted={onAccepted}
        onCancel={vi.fn()}
      />,
    );

    // Wait for terms to load (checkbox is disabled until then).
    await screen.findByText("You warrant you own all uploaded content.");

    const acceptBtn = screen.getByRole("button", {
      name: /accept & continue/i,
    });
    expect(acceptBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(acceptBtn).toBeEnabled();

    fireEvent.click(acceptBtn);
    await waitFor(() =>
      expect(mockedLegal.acceptTerms).toHaveBeenCalledWith(
        "t",
        "tos-privacy/2026-04",
      ),
    );
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
  });

  it("does not record acceptance and calls onCancel when dismissed", async () => {
    const onCancel = vi.fn();
    render(
      <TermsAcceptanceModal
        open
        token="t"
        onAccepted={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await screen.findByText("You warrant you own all uploaded content.");

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(mockedLegal.acceptTerms).not.toHaveBeenCalled();
  });

  it("reloads terms and resets acceptance state when replayed after close", async () => {
    const replayedTerms = {
      ...sampleTerms,
      version: "tos-privacy/2026-06",
      text: "Updated terms for replayed upload.",
    };
    mockedLegal.getCurrentTerms
      .mockResolvedValueOnce(sampleTerms)
      .mockResolvedValueOnce(replayedTerms);
    const onAccepted = vi.fn();

    const { rerender } = render(
      <TermsAcceptanceModal
        open
        token="t"
        onAccepted={onAccepted}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByText("You warrant you own all uploaded content.");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();

    rerender(
      <TermsAcceptanceModal
        open={false}
        token="t"
        onAccepted={onAccepted}
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <TermsAcceptanceModal
        open
        token="t"
        onAccepted={onAccepted}
        onCancel={vi.fn()}
      />,
    );

    await screen.findByText("Updated terms for replayed upload.");
    const checkbox = screen.getByRole("checkbox");
    const acceptBtn = screen.getByRole("button", {
      name: /accept & continue/i,
    });
    expect(checkbox).not.toBeChecked();
    expect(acceptBtn).toBeDisabled();

    fireEvent.click(checkbox);
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockedLegal.acceptTerms).toHaveBeenCalledWith(
        "t",
        "tos-privacy/2026-06",
      );
    });
    expect(mockedLegal.getCurrentTerms).toHaveBeenCalledTimes(2);
  });
});
