import { describe, expect, it } from "vitest";
import {
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
});
