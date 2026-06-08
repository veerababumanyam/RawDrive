import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedVideosPanel } from "../embedded-videos-panel";
import type { EmbeddedVideo } from "@/lib/embedded-videos";

const mockAuthFetch = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true }) as Response),
);

vi.mock("@/lib/api/authFetch", () => ({
  authFetch: mockAuthFetch,
}));

function latestAuthFetchBody() {
  const calls = mockAuthFetch.mock.calls as unknown as Array<
    [string, RequestInit]
  >;
  const body = calls.at(-1)?.[1]?.body;
  expect(typeof body).toBe("string");
  return body as string;
}

const instagramVideos: EmbeddedVideo[] = [
  {
    id: "ig-1",
    provider: "instagram",
    video_id: "DLHx_WNoXoY",
    instagram_kind: "reel",
    instagram_display_mode: "compact",
    title: "Reel",
    added_at: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "ig-2",
    provider: "instagram",
    video_id: "Cabc123xyz_",
    instagram_kind: "p",
    instagram_display_mode: "full",
    title: "Post",
    added_at: "2026-06-06T00:00:00.000Z",
  },
];

const dashboardVideos: EmbeddedVideo[] = [
  {
    id: "yt-1",
    provider: "youtube",
    video_id: "dQw4w9WgXcQ",
    title: "YouTube clip",
    added_at: "2026-06-06T00:00:00.000Z",
  },
  {
    id: "ig-1",
    provider: "instagram",
    video_id: "DLHx_WNoXoY",
    instagram_kind: "reel",
    instagram_display_mode: "compact",
    title: "Instagram reel",
    added_at: "2026-06-06T00:00:00.000Z",
  },
];

describe("EmbeddedVideosPanel Instagram embeds", () => {
  beforeEach(() => {
    mockAuthFetch.mockClear();
    mockAuthFetch.mockResolvedValue({ ok: true } as Response);
    document.getElementById("rawdrive-instagram-embed-script")?.remove();
    delete window.instgrm;
  });

  it("renders official Instagram blockquotes and processes them with one script", async () => {
    const process = vi.fn();
    const { container } = render(
      <EmbeddedVideosPanel
        galleryId="gallery-1"
        initialVideos={instagramVideos}
        readOnly
      />,
    );

    const blocks = container.querySelectorAll("blockquote.instagram-media");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveAttribute(
      "data-instgrm-permalink",
      "https://www.instagram.com/reel/DLHx_WNoXoY/",
    );
    expect(blocks[1]).toHaveAttribute(
      "data-instgrm-permalink",
      "https://www.instagram.com/p/Cabc123xyz_/",
    );
    expect(blocks[0]).not.toHaveAttribute("data-instgrm-captioned");
    expect(blocks[1]).toHaveAttribute("data-instgrm-captioned", "");

    const script = await waitFor(() => {
      const node = document.getElementById("rawdrive-instagram-embed-script");
      expect(node).toBeInstanceOf(HTMLScriptElement);
      return node as HTMLScriptElement;
    });

    expect(script.src).toBe("https://www.instagram.com/embed.js");
    expect(document.querySelectorAll('script[src="https://www.instagram.com/embed.js"]')).toHaveLength(1);

    window.instgrm = { Embeds: { process } };
    script.dispatchEvent(new Event("load"));

    await waitFor(() => expect(process).toHaveBeenCalledTimes(1));
  });

  it("shows dashboard provider guidance, preview, mode, and reorder controls", async () => {
    const onChange = vi.fn();
    render(
      <EmbeddedVideosPanel
        galleryId="gallery-1"
        initialVideos={dashboardVideos}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Videos & Reels" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Instagram Reels")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Preview as client" }),
    ).toHaveAttribute("href", "/galleries/gallery-1/preview");
    expect(
      screen.getByText("Private or restricted Instagram posts may only open on Instagram."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Full post" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const modePayload = JSON.parse(latestAuthFetchBody());
    expect(
      modePayload.videos.find((video: EmbeddedVideo) => video.id === "ig-1")
        .instagram_display_mode,
    ).toBe("full");

    mockAuthFetch.mockClear();
    onChange.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Move YouTube clip down" }),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const reorderPayload = JSON.parse(latestAuthFetchBody());
    expect(reorderPayload.videos.map((video: EmbeddedVideo) => video.id)).toEqual([
      "ig-1",
      "yt-1",
    ]);
  });

  it("replaces a failed provider iframe with retry and open-link actions", () => {
    const { container } = render(
      <EmbeddedVideosPanel
        galleryId="gallery-1"
        initialVideos={[dashboardVideos[0]]}
        readOnly
      />,
    );

    const iframe = container.querySelector("iframe");
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    fireEvent.error(iframe as HTMLIFrameElement);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Video player unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Retry player" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Open on YouTube/ }).at(0),
    ).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry player" }));

    expect(container.querySelector("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0",
    );
  });
});
