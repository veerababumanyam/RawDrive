import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShareQrPopover } from "../share-qr-popover";

vi.mock("qrcode", () => ({
  default: {
    toCanvas: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("ShareQrPopover", () => {
  it("prepares a tokenized share URL before opening the QR", async () => {
    const shareUrl = "https://rawdrive.in/g/event?share=SHARETOKEN";
    const getShareUrl = vi.fn().mockResolvedValue(shareUrl);

    render(
      <ShareQrPopover
        getShareUrl={getShareUrl}
        label="Show QR code for gallery share link"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show QR code for gallery share link",
      }),
    );

    await waitFor(() => expect(getShareUrl).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("dialog", { name: "Share QR code" }),
    ).toBeInTheDocument();
    expect(screen.getByText(shareUrl)).toBeInTheDocument();
  });

  it("can report why QR is unavailable instead of becoming a silent disabled button", () => {
    const onUnavailable = vi.fn();

    render(
      <ShareQrPopover
        url=""
        disabled
        label="Show QR code for gallery share link"
        onUnavailable={onUnavailable}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "Show QR code for gallery share link",
    });
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(toggle).not.toBeDisabled();

    fireEvent.click(toggle);

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Share QR code" })).toBeNull();
  });
});
