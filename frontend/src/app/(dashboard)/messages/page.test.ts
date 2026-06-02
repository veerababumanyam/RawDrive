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
    const url =
      "https://f000.backblazeb2.com/file/rawdrive/attachments/abc.pdf";
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

// Regression guard: bearer access tokens must never be interpolated into the
// SSE EventSource URL. Browser auth for this dashboard stream rides on the
// HttpOnly access-token cookie; buildEventStreamUrl should only select the
// channel.

describe("buildEventStreamUrl — no bearer token in query string", () => {
  const apiBase = "http://localhost:8080";

  it("builds a token-free chat stream URL", () => {
    const url = buildEventStreamUrl(apiBase);

    expect(url).toBe(`${apiBase}/api/v1/events/stream?channels=chat`);
    expect(url).not.toContain("token=");
  });
});
