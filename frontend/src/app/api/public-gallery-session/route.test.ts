import { describe, expect, it } from "vitest";

import { POST } from "./route";

// POST /api/public-gallery-session is a thin, same-origin cookie-setter. It
// upgrades the client-written gallery_session cookie to an HttpOnly one. It does
// NOT validate gallery authorization — the Go backend validates the token on
// every protected public API call. See issue #156.

function postJson(body: unknown, init?: { proto?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.proto) headers["x-forwarded-proto"] = init.proto;
  return new Request("http://localhost/api/public-gallery-session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/public-gallery-session", () => {
  it("sets an HttpOnly gallery_session cookie and returns 204 + no-store on a valid body", async () => {
    const res = await POST(
      postJson({ slug: "ravi-and-priya", token: "minted-session-token-abc" }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("gallery_session=minted-session-token-abc");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=86400");
  });

  it("marks the cookie Secure when the request arrived over HTTPS", async () => {
    const res = await POST(
      postJson(
        { slug: "ravi-and-priya", token: "minted-session-token-abc" },
        { proto: "https" },
      ),
    );
    expect(res.headers.get("set-cookie") ?? "").toContain("Secure");
  });

  it("does not mark the cookie Secure on plain HTTP (dev / localhost)", async () => {
    const res = await POST(
      postJson({ slug: "ravi-and-priya", token: "minted-session-token-abc" }),
    );
    expect(res.headers.get("set-cookie") ?? "").not.toContain("Secure");
  });

  it("returns 400 when the token is missing", async () => {
    const res = await POST(postJson({ slug: "ravi-and-priya" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 when the slug is missing or blank", async () => {
    const res = await POST(postJson({ slug: "  ", token: "abc" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 when the token is not a string", async () => {
    const res = await POST(postJson({ slug: "ravi-and-priya", token: 12345 }));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 400 on a non-JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/public-gallery-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
