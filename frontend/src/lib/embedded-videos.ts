// Shared types + URL parser + API helpers for the per-gallery embedded
// video feature (YouTube / Vimeo / Instagram links rendered inside the
// gallery, visible to both the photographer in the dashboard and to
// guests on the public share link).
//
// Storage shape (under gallery.settings.embedded_videos[]):
//   {
//     id: string         // client-generated uuid; primary key for delete
//     provider: "youtube" | "vimeo" | "instagram"
//     video_id: string   // YouTube 11-char ID, Vimeo numeric ID, or Instagram shortcode
//     instagram_kind?: "p" | "reel" | "tv"
//     instagram_display_mode?: "compact" | "full"
//     title?: string     // optional user-supplied title (oEmbed lookup is future work)
//     added_at: string   // ISO timestamp
//   }
//
// Persistence: PUT /api/v1/galleries/{id}/embedded-videos with
// { videos: EmbeddedVideo[] }. Reads come from the generic
// gallery.settings field (no GET endpoint needed — gallery already
// returns it).

import { authFetch } from "@/lib/api/authFetch";

export type EmbeddedVideoProvider = "youtube" | "vimeo" | "instagram";
export type InstagramEmbedKind = "p" | "reel" | "tv";
export type InstagramEmbedDisplayMode = "compact" | "full";

export interface EmbeddedVideo {
  id: string;
  provider: EmbeddedVideoProvider;
  video_id: string;
  instagram_kind?: InstagramEmbedKind;
  instagram_display_mode?: InstagramEmbedDisplayMode;
  title?: string;
  added_at: string;
}

// ── URL parsing ─────────────────────────────────────────────────────
//
// Supported input shapes:
//   YouTube long:   https://www.youtube.com/watch?v=dQw4w9WgXcQ
//   YouTube short:  https://youtu.be/dQw4w9WgXcQ
//   YouTube embed:  https://www.youtube.com/embed/dQw4w9WgXcQ
//   YouTube shorts: https://www.youtube.com/shorts/dQw4w9WgXcQ
//   Vimeo:          https://vimeo.com/123456789
//   Vimeo with hash: https://vimeo.com/123456789/abcdef (private link hash discarded;
//                    embed authorization is server-controlled by the Vimeo owner)
//   Instagram post: https://www.instagram.com/p/Cabc123xyz_/
//   Instagram Reel: https://www.instagram.com/reel/Cabc123xyz_/?igsh=...
//   Instagram TV:   https://www.instagram.com/tv/Cabc123xyz_/
//
// Returns null when the URL is unrecognized — callers surface that
// as a "Please paste a YouTube, Vimeo, or Instagram link" hint.

// YouTube IDs are an opaque 11-char base64url-ish string; Vimeo IDs
// are 1-12 digits (real ones are 8-10 today, but the regex bounds at
// 12 to reject obviously-bad input like a 30-digit junk string). Both
// bounds are inlined into the regexes below rather than named constants
// so the regex is self-documenting at the match site.

export interface ParsedVideoUrl {
  provider: EmbeddedVideoProvider;
  videoId: string;
  instagramKind?: InstagramEmbedKind;
}

export function parseVideoUrl(input: string): ParsedVideoUrl | null {
  const url = input.trim();
  if (!url) return null;

  // Plain 11-char YouTube ID (no scheme) — common when someone copies
  // just the ID out of a chat message. Cheap to accept.
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) {
    return { provider: "youtube", videoId: url };
  }

  // Try parsing as a URL. The native URL constructor handles scheme +
  // host extraction cleanly; falling back to regex would re-implement
  // the same parsing badly. If the input has no scheme but looks like
  // a URL, prepend https:// so URL() doesn't throw.
  let parsed: URL;
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.replace(/^\/+/, "");

  // YouTube cases
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    // /watch?v=ID
    const v = parsed.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
      return { provider: "youtube", videoId: v };
    }
    // /embed/ID or /shorts/ID or /v/ID
    const m = path.match(/^(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return { provider: "youtube", videoId: m[1] };
  }
  if (host === "youtu.be") {
    const m = path.match(/^([A-Za-z0-9_-]{11})/);
    if (m) return { provider: "youtube", videoId: m[1] };
  }

  // Vimeo cases — /VIDEO_ID or /VIDEO_ID/HASH (we discard hash; the
  // Vimeo iframe accepts the base ID and Vimeo's own auth checks the
  // referer/embed allowlist).
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = path.match(/^(?:video\/)?(\d{1,12})/);
    if (m) return { provider: "vimeo", videoId: m[1] };
  }

  // Instagram cases — only public post/Reel/TV permalinks are embeddable.
  // Profiles, Stories, Explore pages, direct/media IDs, and feeds are not.
  if (host === "instagram.com" || host === "m.instagram.com") {
    const m = path.match(/^(p|reel|tv)\/([A-Za-z0-9_-]{5,64})(?:\/|$)/);
    if (m) {
      return {
        provider: "instagram",
        videoId: m[2],
        instagramKind: m[1] as InstagramEmbedKind,
      };
    }
  }

  return null;
}

// Provider-specific embed URL — what we set as iframe src.
//
// 2026-05-18 follow-up: switched YouTube embed host from
// youtube-nocookie.com to www.youtube.com. The nocookie host is
// stricter about which videos allow embedding — several real-world
// videos that play fine via youtube.com/embed render an empty
// iframe (zero-byte body) on the nocookie host. www.youtube.com is
// the official embed surface and is what YouTube's own "Share →
// Embed" dialog ships. The privacy trade-off is YouTube can set a
// few first-party cookies for the player; for a photographer's
// curated gallery this is the expected behavior.
export function embedUrlFor(video: Pick<EmbeddedVideo, "provider" | "video_id">): string {
  if (video.provider === "youtube") {
    return `https://www.youtube.com/embed/${encodeURIComponent(video.video_id)}?rel=0`;
  }
  if (video.provider === "instagram") {
    return `${watchUrlFor(video)}embed/`;
  }
  // Vimeo — title/byline/portrait hidden to keep the embed
  // visually clean inside the gallery grid; the user can click
  // through to vimeo.com for the full chrome if they want it.
  return `https://player.vimeo.com/video/${encodeURIComponent(video.video_id)}?title=0&byline=0&portrait=0`;
}

// Public watch URL — the page the video lives on at its host. Used
// for the "Open on YouTube" / "Open on Vimeo" fallback link beside
// every embed tile. Cross-origin iframe failure (uploader disabled
// embedding, region restriction, third-party cookie block, browser
// extension interference) is hard to detect programmatically, so the
// pragmatic UX is to ALWAYS surface a click-through so the user can
// reach the video regardless of whether the embed actually played.
export function watchUrlFor(
  video: Pick<EmbeddedVideo, "provider" | "video_id" | "instagram_kind">,
): string {
  if (video.provider === "youtube") {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(video.video_id)}`;
  }
  if (video.provider === "instagram") {
    const kind = video.instagram_kind ?? "p";
    return `https://www.instagram.com/${kind}/${encodeURIComponent(video.video_id)}/`;
  }
  return `https://vimeo.com/${encodeURIComponent(video.video_id)}`;
}

// Thumbnail URL — used as the "video card preview" before the iframe
// fully loads. YouTube exposes deterministic thumbnail URLs;  Vimeo
// requires an oEmbed call which we skip for v1 (the iframe loads its
// own poster frame fast enough). Returns null when no static URL is
// available so the caller can render a neutral placeholder.
export function thumbnailUrlFor(video: Pick<EmbeddedVideo, "provider" | "video_id">): string | null {
  if (video.provider === "youtube") {
    return `https://i.ytimg.com/vi/${encodeURIComponent(video.video_id)}/hqdefault.jpg`;
  }
  return null;
}

// Stable id generator — clients need a primary key for the delete
// path. crypto.randomUUID is available in all modern browsers and
// Node 19+; fall back to a timestamp+random string for older runtimes
// (mostly relevant in SSR which isn't used by this feature).
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `vid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Factory used by the dashboard "Add Video" flow — keeps the schema
// in one place so the panel doesn't reinvent the field names.
export function buildEmbeddedVideo(parsed: ParsedVideoUrl, opts?: { title?: string }): EmbeddedVideo {
  return {
    id: newId(),
    provider: parsed.provider,
    video_id: parsed.videoId,
    instagram_kind: parsed.provider === "instagram" ? parsed.instagramKind : undefined,
    instagram_display_mode: parsed.provider === "instagram" ? "compact" : undefined,
    title: opts?.title?.trim() || undefined,
    added_at: new Date().toISOString(),
  };
}

// ── API client ──────────────────────────────────────────────────────

// Reads from the generic gallery.settings field that's already on the
// gallery payload. Defensive against missing/null/wrong-shape settings.
export function readEmbeddedVideos(
  settings: Record<string, unknown> | null | undefined,
): EmbeddedVideo[] {
  if (!settings) return [];
  const raw = settings["embedded_videos"];
  if (!Array.isArray(raw)) return [];
  const out: EmbeddedVideo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const provider = obj.provider;
    const videoId = obj.video_id;
    const id = obj.id;
    const instagramKind = obj.instagram_kind;
    const instagramDisplayMode = obj.instagram_display_mode;
    if (
      (provider === "youtube" ||
        provider === "vimeo" ||
        (provider === "instagram" &&
          (instagramKind === "p" || instagramKind === "reel" || instagramKind === "tv"))) &&
      typeof videoId === "string" &&
      typeof id === "string"
    ) {
      out.push({
        id,
        provider,
        video_id: videoId,
        instagram_kind:
          provider === "instagram" ? (instagramKind as InstagramEmbedKind) : undefined,
        instagram_display_mode:
          provider === "instagram" && instagramDisplayMode === "full"
            ? "full"
            : provider === "instagram"
              ? "compact"
              : undefined,
        title: typeof obj.title === "string" ? obj.title : undefined,
        added_at: typeof obj.added_at === "string" ? obj.added_at : new Date().toISOString(),
      });
    }
  }
  return out;
}

// Persist the full videos array. Server replaces the field wholesale,
// so the caller must send the complete list (not a delta).
export async function updateEmbeddedVideos(
  galleryId: string,
  videos: EmbeddedVideo[],
): Promise<void> {
  const res = await authFetch(`/api/v1/galleries/${galleryId}/embedded-videos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videos }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save videos: ${res.status}`);
  }
}
