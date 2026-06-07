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

// Canonical gallery URL carrying both the public share-session token and the
// E2E `#rd_key` fragment, exactly what the gallery page's tokenized share
// helper returns.
const SHARE_URL =
  "https://rawdrive.in/g/sharma-wedding?share=SHARETOKEN#rd_key=SECRETKEY";

describe("GalleryShareQrCard", () => {
  beforeEach(() => {
    toCanvas.mockClear();
    toDataURL.mockClear();
    toString.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: undefined,
    });
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
      screen.getByText("rawdrive.in/g/sharma-wedding"),
    ).toBeInTheDocument();
    expect(screen.getByText("Secured link")).toBeInTheDocument();

    await waitFor(() => expect(toCanvas).toHaveBeenCalled());

    expect(
      screen.getByTestId("share-qr-card-download-png"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("share-qr-card-download-svg"),
    ).toBeInTheDocument();
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
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

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

  it("falls back to selection copy when async clipboard is blocked", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    render(
      <GalleryShareQrCard
        getShareUrl={() => SHARE_URL}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    fireEvent.click(await screen.findByTestId("share-qr-card-copy"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SHARE_URL));
    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    await waitFor(() =>
      expect(screen.getByTestId("share-qr-card-copy")).toHaveAttribute(
        "aria-label",
        "Gallery address copied",
      ),
    );
    expect(
      screen.queryByText("Couldn't copy — long-press the address to copy it."),
    ).not.toBeInTheDocument();
  });

  it("accepts async share URL preparation before rendering QR actions", async () => {
    const getShareUrl = vi.fn().mockResolvedValue(SHARE_URL);

    render(
      <GalleryShareQrCard
        getShareUrl={getShareUrl}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    expect(await screen.findByTestId("share-qr-card-canvas")).toBeVisible();
    await waitFor(() => expect(getShareUrl).toHaveBeenCalledTimes(1));
  });

  it("keeps the encoded QR URL stable across callback identity changes", async () => {
    const firstGetter = vi.fn().mockResolvedValue(SHARE_URL);
    const secondGetter = vi.fn().mockResolvedValue(SHARE_URL);
    const { rerender } = render(
      <GalleryShareQrCard
        getShareUrl={firstGetter}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    await screen.findByTestId("share-qr-card-canvas");
    await waitFor(() =>
      expect(toCanvas).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        SHARE_URL,
        expect.any(Object),
      ),
    );

    rerender(
      <GalleryShareQrCard
        getShareUrl={secondGetter}
        title="Sharma Wedding"
        slug="sharma-wedding"
      />,
    );

    await waitFor(() => expect(secondGetter).toHaveBeenCalledTimes(1));
    expect(toCanvas.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([SHARE_URL]),
    );
    expect(new Set(toCanvas.mock.calls.map((call) => call[1]))).toEqual(
      new Set([SHARE_URL]),
    );
  });

  it("shows an unavailable state (no QR) when no URL is available", async () => {
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
      await screen.findByTestId("share-qr-card-unavailable"),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByText(
          "Publish this gallery to generate its shareable QR code.",
        ),
      ).toBeInTheDocument(),
    );
  });
});
