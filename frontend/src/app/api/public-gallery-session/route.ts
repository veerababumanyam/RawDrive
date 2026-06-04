/**
 * POST /api/public-gallery-session — same-origin gallery-session cookie setter
 * (issue #156).
 *
 * PublicGallerySessionBridge calls this best-effort after writing an immediate
 * client-readable `gallery_session` cookie, to UPGRADE that cookie to an
 * HttpOnly one (so the durable share session is no longer readable by JS).
 *
 * This route intentionally does NOT validate gallery authorization: the token
 * is a backend-minted, gallery-scoped session, and the Go backend validates it
 * on every protected public API call (gateGalleryAccess). A forged/junk token
 * therefore grants nothing — it simply fails downstream. The cookie is HttpOnly
 * + SameSite=Strict (+ Secure on HTTPS) and the response is never cached.
 *
 * This route never places the durable session token in a URL; it travels only
 * in the request body here and in the Set-Cookie header it returns.
 */

export const dynamic = "force-dynamic";

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid JSON body");
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const slug = record.slug;
  const token = record.token;

  if (typeof slug !== "string" || slug.trim() === "") {
    return badRequest("slug is required");
  }
  if (typeof token !== "string" || token.trim() === "") {
    return badRequest("token is required");
  }

  // Secure only when the request reached us over HTTPS — direct TLS or via a
  // proxy that sets x-forwarded-proto. On plain-HTTP localhost the flag is
  // omitted so the cookie still sticks during dev / UAT.
  const isHttps =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  const secure = isHttps ? "; Secure" : "";

  const cookie = `gallery_session=${encodeURIComponent(
    token,
  )}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict${secure}`;

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}
