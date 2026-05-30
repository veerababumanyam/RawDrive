import { describe, expect, it } from "vitest";
import { buildEventStreamUrl, safeAttachmentUrl } from "./page";

// Regression guard for F-051: message attachment_url was rendered directly as
// an <a href> with no scheme check. attachment_url is decoded verbatim from the
// request body by messaging_handler.go, so any workspace member can send a
// `javascript:` / `data:` URL that executes in the recipient's dashboard origin
// (stored XSS). safeAttachmentUrl is the positive allowlist the render path uses
// — only https: links survive; everything else collapses to null so no <a> is
// emitted.

describe("safeAttachmentUrl — XSS scheme allowlist (F-051)", () => {
  it("passes through a normal https backend storage URL", () => {
    const url = "https://f000.backblazeb2.com/file/rawdrive/attachments/abc.pdf";
    expect(safeAttachmentUrl(url)).toBe(url);
  });

  it("blocks a javascript: URL (the reported stored-XSS vector)", () => {
    expect(safeAttachmentUrl("javascript:alert(document.cookie)")).toBeNull();
  });

  it("blocks uppercase / mixed-case javascript: schemes", () => {
    expect(safeAttachmentUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeAttachmentUrl("JAVASCRIPT:alert(1)")).toBeNull();
  });

  it("blocks data: URLs (inline script / html payloads)", () => {
    expect(
      safeAttachmentUrl("data:text/html,<script>alert(1)</script>"),
    ).toBeNull();
  });

  it("blocks plain http: (downgrade) — only https links are allowed", () => {
    expect(safeAttachmentUrl("http://example.com/file.pdf")).toBeNull();
  });

  it("blocks leading-whitespace bypass attempts", () => {
    // A guard that trimmed or used .includes('https:') could be fooled; the
    // startsWith allowlist must reject a leading space before the scheme.
    expect(safeAttachmentUrl(" javascript:alert(1)")).toBeNull();
    expect(safeAttachmentUrl("\thttps://example.com/x")).toBeNull();
  });

  it("returns null for absent / empty / non-string values", () => {
    expect(safeAttachmentUrl(undefined)).toBeNull();
    expect(safeAttachmentUrl(null)).toBeNull();
    expect(safeAttachmentUrl("")).toBeNull();
    // @ts-expect-error — defensive: API could hand back a non-string
    expect(safeAttachmentUrl(123)).toBeNull();
  });
});

// Regression guard for F-097: the JWT access token was interpolated raw into
// the SSE EventSource URL (`?token=${token}`), unlike use-asset-ready-
// subscription.ts which already wraps the token in encodeURIComponent. An
// un-encoded token can corrupt the query string if the token format ever gains
// reserved characters, and leaks the raw token verbatim into proxy/access logs.
// buildEventStreamUrl is the single URL builder the channels SSE effect uses —
// it must URL-encode the token.

describe("buildEventStreamUrl — JWT query-param encoding (F-097)", () => {
  const apiBase = "http://localhost:8080";

  it("URL-encodes a token containing reserved characters", () => {
    // Tokens are normally base64url (no reserved chars), but the encoding must
    // hold if the format ever changes — this is the exact case raw
    // interpolation would mangle.
    const token = "a.b+c/d= e&f";
    const url = buildEventStreamUrl(apiBase, token);

    expect(url).toContain(`token=${encodeURIComponent(token)}`);
    // The raw token must NOT appear unescaped in the query string.
    expect(url).not.toContain(`token=${token}`);
    // The static channel literal is unaffected and still present.
    expect(url).toContain("&channels=chat");
  });

  it("leaves a normal base64url JWT round-trip intact", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig-_value";
    const url = buildEventStreamUrl(apiBase, token);

    expect(url).toBe(
      `${apiBase}/api/v1/events/stream?token=${encodeURIComponent(token)}&channels=chat`,
    );
    // A decoded query param must reproduce the original token exactly.
    const decoded = decodeURIComponent(
      new URL(url).searchParams.get("token") ?? "",
    );
    expect(decoded).toBe(token);
  });
});
