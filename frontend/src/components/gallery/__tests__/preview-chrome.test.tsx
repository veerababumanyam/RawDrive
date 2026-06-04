import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { PreviewChrome } from "../preview-chrome";
import type { Gallery } from "@/lib/api/galleries";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The `qrcode` library writes to a real canvas 2D context which jsdom
// stubs to return `null` (the upstream warning is benign but noisy).
// We resolve immediately so the popover renders deterministically and
// keep an unmodified canvas element in the DOM for assertions.
vi.mock("qrcode", () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined) },
}));

function buildGallery(overrides: Partial<Gallery> = {}): Gallery {
  return {
    id: "gallery-42",
    workspace_id: "ws-1",
    title: "Wedding 2026",
    slug: "wedding-2026",
    description: "",
    gallery_type: "wedding",
    is_published: true,
    max_selections: 0,
    status: "shared",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PreviewChrome", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { origin: "https://app.rawdrive.test" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the share link and a Back link to the gallery workspace", () => {
    render(
      <PreviewChrome
        gallery={buildGallery()}
        publicUrl="https://app.rawdrive.test/g/wedding-2026"
      />,
    );

    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/galleries/gallery-42",
    );
    expect(
      screen.getByText("app.rawdrive.test/g/wedding-2026"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("preview-share-button")).toBeEnabled();
  });

  it("copies the public URL to clipboard and shows a Copied state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <PreviewChrome
        gallery={buildGallery()}
        publicUrl="https://app.rawdrive.test/g/wedding-2026"
      />,
    );

    fireEvent.click(screen.getByTestId("preview-share-button"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "https://app.rawdrive.test/g/wedding-2026",
      );
    });
    // Confirm the button flips to its Copied state — the sr-only
    // aria-live region announces the transition and is single-text-node
    // friendly for RTL's text matcher.
    await waitFor(() => {
      expect(
        screen.getByText("Share link copied to clipboard."),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("preview-share-button")).toHaveAttribute(
      "aria-label",
      "Share link copied",
    );
  });

  it("surfaces an unpublished warning and disables sharing when slug missing", () => {
    render(
      <PreviewChrome
        gallery={buildGallery({ is_published: false })}
        publicUrl=""
      />,
    );

    expect(screen.getByText(/unpublished/i)).toBeInTheDocument();
    expect(screen.getByTestId("preview-share-button")).toBeDisabled();
    expect(
      screen.getByText("Publish to generate a public URL"),
    ).toBeInTheDocument();
  });

  it("offers a QR popover beside the copy button and renders a QR canvas on demand", async () => {
    render(
      <PreviewChrome
        gallery={buildGallery()}
        publicUrl="https://app.rawdrive.test/g/wedding-2026"
      />,
    );

    // Toggle button is present beside the Copy share link button and
    // wired to the share URL via aria-label.
    const qrToggle = screen.getByTestId("share-qr-toggle");
    expect(qrToggle).toHaveAttribute("aria-label", "Show QR for share link");
    expect(qrToggle).toBeEnabled();

    // No popover before click.
    expect(screen.queryByTestId("share-qr-popover")).toBeNull();

    fireEvent.click(qrToggle);

    const popover = await screen.findByTestId("share-qr-popover");
    const canvas = within(popover).getByTestId("share-qr-canvas");
    expect(canvas).toHaveAttribute(
      "aria-label",
      "QR code for https://app.rawdrive.test/g/wedding-2026",
    );
    // The full URL is rendered inside the popover so the photographer
    // can sanity-check what was encoded before downloading.
    expect(
      within(popover).getByText("https://app.rawdrive.test/g/wedding-2026"),
    ).toBeInTheDocument();
    // Download CTA is wired and enabled once the QR has rendered.
    expect(
      within(popover).getByTestId("share-qr-download"),
    ).toBeInTheDocument();
  });

  it("disables the QR toggle when no public URL is available", () => {
    render(
      <PreviewChrome
        gallery={buildGallery({ is_published: false })}
        publicUrl=""
      />,
    );

    expect(screen.getByTestId("share-qr-toggle")).toBeDisabled();
  });

  it("falls back to error feedback when clipboard write throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    render(
      <PreviewChrome
        gallery={buildGallery()}
        publicUrl="https://app.rawdrive.test/g/wedding-2026"
      />,
    );

    fireEvent.click(screen.getByTestId("preview-share-button"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/copy failed/i);
  });
});
