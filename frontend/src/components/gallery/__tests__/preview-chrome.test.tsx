import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewChrome } from "../preview-chrome";
import type { Gallery } from "@/lib/api/galleries";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
    expect(screen.getByText("app.rawdrive.test/g/wedding-2026")).toBeInTheDocument();
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
      expect(writeText).toHaveBeenCalledWith("https://app.rawdrive.test/g/wedding-2026");
    });
    // Confirm the button flips to its Copied state — the sr-only
    // aria-live region announces the transition and is single-text-node
    // friendly for RTL's text matcher.
    await waitFor(() => {
      expect(screen.getByText("Share link copied to clipboard.")).toBeInTheDocument();
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

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/copy failed/i);
  });
});
