import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the underlying `qrcode` package (jsdom has no real canvas). lib/qr runs
// for real on top of these spies, so this exercises the card -> lib/qr ->
// qrcode integration. Mirrors the share-qr-popover / preview-chrome convention.
const { toCanvas, toDataURL, toString } = vi.hoisted(() => ({
  toCanvas: vi.fn().mockResolvedValue(undefined),
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,FAKEPNG"),
  toString: vi.fn().mockResolvedValue('<svg data-fake="1"></svg>'),
}));
vi.mock("qrcode", () => ({ default: { toCanvas, toDataURL, toString } }));

import { GalleryShareQrCard } from "@/components/gallery/gallery-share-qr-card";

// A per-business subdomain URL carrying the E2E `#rd_key` fragment, exactly
// what buildShareUrl() returns on the gallery page.
const SHARE_URL =
  "https://studio-ab12.rawdrive.in/sharma-wedding#rd_key=SECRETKEY";

describe("GalleryShareQrCard", () => {
  beforeEach(() => {
    toCanvas.mockClear();
    toDataURL.mockClear();
    toString.mockClear();
  });

  it("renders the QR, a clean public address, and both download actions when a URL is available", async () => {
    render(
      <GalleryShareQrCard
        getShareUrl={() => SHARE_URL}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    const canvas = await screen.findByTestId("share-qr-card-canvas");
    expect(canvas).toHaveAttribute("role", "img");
    // a11y: label names the gallery, not the raw key-bearing URL
    expect(canvas.getAttribute("aria-label")).toContain("Sharma Wedding");

    // The visible address is clean (no protocol, no #rd_key fragment).
    expect(
      screen.getByText("studio-ab12.rawdrive.in/sharma-wedding"),
    ).toBeInTheDocument();

    await waitFor(() => expect(toCanvas).toHaveBeenCalled());

    expect(screen.getByTestId("share-qr-card-download-png")).toBeInTheDocument();
    expect(screen.getByTestId("share-qr-card-download-svg")).toBeInTheDocument();
  });

  it("downloads a high-res PNG named after the slug when the PNG action is clicked", async () => {
    const downloads: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    render(
      <GalleryShareQrCard
        getShareUrl={() => SHARE_URL}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    fireEvent.click(await screen.findByTestId("share-qr-card-download-png"));
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    await waitFor(() => expect(downloads).toContain("sharma-wedding-qr.png"));
    clickSpy.mockRestore();
  });

  it("downloads a vector SVG when the SVG action is clicked", async () => {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi
      .fn()
      .mockReturnValue("blob:fake-svg");
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL =
      vi.fn();
    const downloads: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    render(
      <GalleryShareQrCard
        getShareUrl={() => SHARE_URL}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    fireEvent.click(await screen.findByTestId("share-qr-card-download-svg"));
    await waitFor(() => expect(toString).toHaveBeenCalled());
    await waitFor(() => expect(downloads).toContain("sharma-wedding-qr.svg"));
    clickSpy.mockRestore();
  });

  it("copies the full (key-bearing) public URL to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <GalleryShareQrCard
        getShareUrl={() => SHARE_URL}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    fireEvent.click(await screen.findByTestId("share-qr-card-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHARE_URL));
  });

  it("shows an unavailable state (no QR) when no URL is available", () => {
    render(
      <GalleryShareQrCard
        getShareUrl={() => ""}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );
    expect(
      screen.queryByTestId("share-qr-card-canvas"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("share-qr-card-unavailable"),
    ).toBeInTheDocument();
  });
});
