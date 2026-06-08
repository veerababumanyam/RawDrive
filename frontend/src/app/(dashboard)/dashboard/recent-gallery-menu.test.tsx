import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { RecentGalleryMenu } from "./recent-gallery-menu";
import type { Gallery } from "@/lib/api/galleries";

// Behavioral regression for dashboard BUG-2 (UAT 2026-06-04): the Recent
// Galleries card ⋮ used to be a dead glyph. This proves the real overflow menu
// — open, Copy link (published only), and Delete — actually works.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const deleteGallery = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/api/galleries", () => ({
  deleteGallery: (...args: unknown[]) => deleteGallery(...args),
  galleryPublicUrl: (g: { slug: string }) => `https://rawdrive.in/g/${g.slug}`,
}));

const writeText = vi.fn(async () => {});

function makeGallery(overrides: Partial<Gallery> = {}): Gallery {
  return {
    id: "g-1",
    title: "Smith Wedding",
    slug: "smith-wedding",
    is_published: true,
    ...overrides,
  } as unknown as Gallery;
}

beforeEach(() => {
  push.mockClear();
  deleteGallery.mockClear();
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("RecentGalleryMenu", () => {
  it("does not render the menu until the trigger is clicked", () => {
    render(
      <RecentGalleryMenu
        gallery={makeGallery()}
        token="t"
        onDeleted={vi.fn()}
      />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.getByRole("button", { name: /actions for smith wedding/i }),
    ).toBeTruthy();
  });

  it("opens a menu with Open, Copy link, and Delete for a published gallery", () => {
    render(
      <RecentGalleryMenu
        gallery={makeGallery()}
        token="t"
        onDeleted={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /actions for smith wedding/i }),
    );
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByText("Open gallery")).toBeTruthy();
    expect(screen.getByText("Copy link")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("copies the public link for a published gallery", async () => {
    render(
      <RecentGalleryMenu
        gallery={makeGallery()}
        token="t"
        onDeleted={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /actions for smith wedding/i }),
    );
    fireEvent.click(screen.getByText("Copy link"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://rawdrive.in/g/smith-wedding",
      ),
    );
    expect(screen.getByText("Link copied")).toBeTruthy();
  });

  it("disables sharing for an unpublished gallery", () => {
    render(
      <RecentGalleryMenu
        gallery={makeGallery({ is_published: false })}
        token="t"
        onDeleted={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /actions for smith wedding/i }),
    );
    expect(screen.queryByText("Copy link")).toBeNull();
    const publishItem = screen.getByText("Publish to share").closest("button");
    expect(publishItem?.hasAttribute("disabled")).toBe(true);
  });

  it("deletes via the API and notifies the parent after confirmation", async () => {
    const onDeleted = vi.fn();
    render(
      <RecentGalleryMenu
        gallery={makeGallery()}
        token="tok-123"
        onDeleted={onDeleted}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /actions for smith wedding/i }),
    );
    // Arm the inline confirm, then confirm.
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(deleteGallery).toHaveBeenCalledWith("tok-123", "g-1"),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("g-1"));
  });

  it("shows a delete status bar while the request is pending", async () => {
    deleteGallery.mockReturnValueOnce(new Promise(() => {}));
    render(
      <RecentGalleryMenu
        gallery={makeGallery()}
        token="tok-123"
        onDeleted={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /actions for smith wedding/i }),
    );
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/deleting gallery/i);
    expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled();
  });

  it("navigates to the gallery on Open", () => {
    render(
      <RecentGalleryMenu
        gallery={makeGallery()}
        token="t"
        onDeleted={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /actions for smith wedding/i }),
    );
    fireEvent.click(screen.getByText("Open gallery"));
    expect(push).toHaveBeenCalledWith("/galleries/g-1");
  });
});
