import { describe, expect, it } from "vitest";
import {
  buildEmbeddedVideo,
  embedUrlFor,
  parseVideoUrl,
  readEmbeddedVideos,
  thumbnailUrlFor,
  watchUrlFor,
} from "../embedded-videos";

describe("parseVideoUrl", () => {
  it("extracts the id from a youtube.com/watch?v=… URL", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("extracts the id from a youtu.be short link", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("handles youtube /embed/ID and /shorts/ID paths", () => {
    expect(parseVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("ignores extra youtube query params when v= is present", () => {
    // Real-world youtube URLs often carry &t=…, &list=…, &si=… — those
    // must not break the parse.
    expect(
      parseVideoUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc&feature=share",
      ),
    ).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
  });

  it("accepts a bare 11-char id without scheme", () => {
    expect(parseVideoUrl("dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("extracts the numeric id from a vimeo.com URL", () => {
    expect(parseVideoUrl("https://vimeo.com/123456789")).toEqual({
      provider: "vimeo",
      videoId: "123456789",
    });
  });

  it("extracts Instagram post, Reel, and TV shortcodes", () => {
    expect(parseVideoUrl("https://www.instagram.com/p/Cabc123xyz_/")).toEqual({
      provider: "instagram",
      videoId: "Cabc123xyz_",
      instagramKind: "p",
    });
    expect(parseVideoUrl("https://instagram.com/reel/DLHx_WNoXoY/?igsh=abc123")).toEqual({
      provider: "instagram",
      videoId: "DLHx_WNoXoY",
      instagramKind: "reel",
    });
    expect(parseVideoUrl("https://m.instagram.com/tv/CTVabc_1234/")).toEqual({
      provider: "instagram",
      videoId: "CTVabc_1234",
      instagramKind: "tv",
    });
  });

  it("handles vimeo URLs with a private-link hash by discarding it", () => {
    // Vimeo's "Only people with the private link" URLs include a
    // /hash/ suffix. The iframe doesn't need the hash; Vimeo enforces
    // embed permission via referer/allowlist on its end.
    expect(parseVideoUrl("https://vimeo.com/123456789/abc123def")).toEqual({
      provider: "vimeo",
      videoId: "123456789",
    });
  });

  it("returns null on a non-video URL", () => {
    expect(parseVideoUrl("https://example.com/something")).toBeNull();
  });

  it("returns null on garbage input", () => {
    expect(parseVideoUrl("")).toBeNull();
    expect(parseVideoUrl("not a url")).toBeNull();
    expect(parseVideoUrl("https://youtube.com/watch?v=tooshortID")).toBeNull();
  });

  it("rejects Instagram profiles, stories, and malformed post paths", () => {
    expect(parseVideoUrl("https://www.instagram.com/rawdrive/")).toBeNull();
    expect(parseVideoUrl("https://www.instagram.com/stories/rawdrive/123456789/")).toBeNull();
    expect(parseVideoUrl("https://www.instagram.com/explore/tags/wedding/")).toBeNull();
    expect(parseVideoUrl("https://www.instagram.com/reel/bad!/")).toBeNull();
    expect(parseVideoUrl("https://www.instagram.com/reel/abc/")).toBeNull();
  });
});

describe("embedUrlFor", () => {
  it("returns the youtube.com embed URL for youtube", () => {
    // 2026-05-18: switched from youtube-nocookie.com → www.youtube.com.
    // nocookie host returns zero-byte response for some real videos that
    // play fine via the official embed surface — see commit notes.
    expect(embedUrlFor({ provider: "youtube", video_id: "dQw4w9WgXcQ" })).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0",
    );
  });

  it("returns a chrome-stripped player URL for vimeo", () => {
    expect(embedUrlFor({ provider: "vimeo", video_id: "123456789" })).toBe(
      "https://player.vimeo.com/video/123456789?title=0&byline=0&portrait=0",
    );
  });
});

describe("watchUrlFor", () => {
  it("returns the youtube.com/watch URL for youtube", () => {
    expect(watchUrlFor({ provider: "youtube", video_id: "dQw4w9WgXcQ" })).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("returns the vimeo.com URL for vimeo", () => {
    expect(watchUrlFor({ provider: "vimeo", video_id: "123456789" })).toBe(
      "https://vimeo.com/123456789",
    );
  });

  it("returns the normalized Instagram permalink", () => {
    expect(
      watchUrlFor({
        provider: "instagram",
        video_id: "DLHx_WNoXoY",
        instagram_kind: "reel",
      }),
    ).toBe("https://www.instagram.com/reel/DLHx_WNoXoY/");
  });
});

describe("thumbnailUrlFor", () => {
  it("returns the static youtube thumbnail URL", () => {
    expect(thumbnailUrlFor({ provider: "youtube", video_id: "dQw4w9WgXcQ" })).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("returns null for vimeo (no deterministic thumbnail URL)", () => {
    expect(thumbnailUrlFor({ provider: "vimeo", video_id: "123456789" })).toBeNull();
  });

  it("returns null for instagram (no deterministic thumbnail URL)", () => {
    expect(thumbnailUrlFor({ provider: "instagram", video_id: "DLHx_WNoXoY" })).toBeNull();
  });
});

describe("buildEmbeddedVideo", () => {
  it("persists instagram_kind for Instagram links", () => {
    const built = buildEmbeddedVideo({
      provider: "instagram",
      videoId: "DLHx_WNoXoY",
      instagramKind: "reel",
    });

    expect(built.provider).toBe("instagram");
    expect(built.video_id).toBe("DLHx_WNoXoY");
    expect(built.instagram_kind).toBe("reel");
    expect(built.instagram_display_mode).toBe("compact");
  });

  it("does not add instagram_kind to YouTube or Vimeo links", () => {
    const built = buildEmbeddedVideo({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });

    expect(built.instagram_kind).toBeUndefined();
  });
});

describe("readEmbeddedVideos", () => {
  it("returns an empty array when settings is missing/empty/wrong shape", () => {
    expect(readEmbeddedVideos(null)).toEqual([]);
    expect(readEmbeddedVideos(undefined)).toEqual([]);
    expect(readEmbeddedVideos({})).toEqual([]);
    expect(readEmbeddedVideos({ embedded_videos: "not an array" })).toEqual([]);
  });

  it("filters out items missing required fields", () => {
    // Defensive: malformed legacy entries shouldn't crash the page.
    const result = readEmbeddedVideos({
      embedded_videos: [
        { id: "a", provider: "youtube", video_id: "dQw4w9WgXcQ", added_at: "2026-01-01" },
        { id: "b", provider: "unknown", video_id: "bad" }, // bad provider
        { provider: "youtube", video_id: "missing-id" }, // missing id
        { id: "c", provider: "instagram", video_id: "DLHx_WNoXoY" }, // missing kind
        { id: "d", provider: "instagram", video_id: "DLHx_WNoXoY", instagram_kind: "story" },
        null,
        "not an object",
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
  });

  it("passes through optional title field when present", () => {
    const result = readEmbeddedVideos({
      embedded_videos: [
        {
          id: "a",
          provider: "vimeo",
          video_id: "123",
          title: "Highlights reel",
          added_at: "2026-01-01",
        },
      ],
    });
    expect(result[0]?.title).toBe("Highlights reel");
  });

  it("passes through valid Instagram entries", () => {
    const result = readEmbeddedVideos({
      embedded_videos: [
        {
          id: "ig",
          provider: "instagram",
          video_id: "DLHx_WNoXoY",
          instagram_kind: "reel",
          instagram_display_mode: "full",
          title: "Instagram reel",
          added_at: "2026-01-01",
        },
      ],
    });

    expect(result).toEqual([
      {
        id: "ig",
        provider: "instagram",
        video_id: "DLHx_WNoXoY",
        instagram_kind: "reel",
        instagram_display_mode: "full",
        title: "Instagram reel",
        added_at: "2026-01-01",
      },
    ]);
  });

  it("defaults legacy Instagram entries to compact display mode", () => {
    const result = readEmbeddedVideos({
      embedded_videos: [
        {
          id: "ig",
          provider: "instagram",
          video_id: "DLHx_WNoXoY",
          instagram_kind: "reel",
          added_at: "2026-01-01",
        },
      ],
    });

    expect(result[0]?.instagram_display_mode).toBe("compact");
  });
});
