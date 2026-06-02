import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GalleryList } from "../client-linked-entities";
import type { ProfileGallery } from "@/lib/api/crm";

const galleries: ProfileGallery[] = [
  {
    id: "gallery-1",
    title: "Anika + Rohan",
    photo_count: 128,
    status: "published",
    cover_thumbnail_url: "/storage/thumbs/gallery-1.webp",
  },
];

describe("GalleryList", () => {
  it("renders linked galleries with navigation and counts", () => {
    render(<GalleryList galleries={galleries} token="jwt-token" />);

    expect(
      screen.getByRole("link", { name: /anika \+ rohan/i }),
    ).toHaveAttribute("href", "/galleries/gallery-1");
    expect(screen.getByText("128 photos")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /anika \+ rohan cover/i }),
    ).toHaveAttribute(
      "src",
      "http://localhost:8080/storage/thumbs/gallery-1.webp",
    );
  });

  it("renders an empty state when there are no linked galleries", () => {
    render(<GalleryList galleries={[]} token="jwt-token" />);

    expect(screen.getByText("No linked galleries yet.")).toBeInTheDocument();
  });
});
