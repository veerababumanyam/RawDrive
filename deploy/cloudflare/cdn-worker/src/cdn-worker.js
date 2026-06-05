// rawdrive-cdn-worker — signed-URL-validated, SSE-C-injecting CDN edge for B2.
//
// Contract (must match the backend SignedCDNURL minter byte-for-byte):
//   URL    : https://cdn.rawdrive.in/<percent-encoded-key>?exp=<unix>&sig=<hex>
//   canon  : <raw-key> + "\n" + <exp>            (raw-key = decoded; exp = decimal unix seconds)
//   sig    : lowercase hex of HMAC-SHA256(canon, CDN_HMAC_SECRET)  (secret as UTF-8 string bytes)
//   verify : exp all-digits -> now <= exp -> constant-time sig match -> else 403
//
// On a valid signature the worker fetches the object from B2 with SSE-C headers
// (so B2 decrypts server-side), returns the bytes with an immutable cache header,
// and caches by object key (signature excluded) so the edge cache is shared across
// authorized requests. Doc: docs/runbooks/cdn-b2-signed-urls.md
//
// CORS: RawDrive galleries are client-E2EE, so the browser fetches these
// (encrypted) derivative bytes cross-origin (rawdrive.in / *.rawdrive.in ->
// cdn.rawdrive.in) and decrypts them client-side. A cross-origin fetch() can only
// READ the body when the response carries Access-Control-Allow-Origin, and the
// frontend fetches with credentials:"include" (so ACAO must be the exact origin,
// not "*", plus Access-Control-Allow-Credentials:true). We answer the OPTIONS
// preflight and decorate every response with per-request CORS headers — and we do
// it AFTER the edge cache, never baking an origin-specific ACAO into the cached
// object (which is shared across origins).
import { AwsClient } from "aws4fetch";

const enc = new TextEncoder();
const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const eq = (a, b) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

// corsHeaders returns the per-request CORS headers when the Origin is a RawDrive
// property (rawdrive.in or any *.rawdrive.in studio subdomain), else {} (no CORS
// — same-origin / curl / disallowed origins are unaffected). Echoes the exact
// origin because credentialed CORS forbids "*".
const corsHeaders = (origin) => {
  if (!origin) return {};
  let host;
  try { host = new URL(origin).hostname; } catch { return {}; }
  if (host === "rawdrive.in" || host.endsWith(".rawdrive.in")) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    };
  }
  return {};
};

// withCORS clones a response and layers the per-request CORS headers + Vary:Origin
// on top, without mutating (or caching) origin-specific headers.
const withCORS = (res, cors, body) => {
  const out = new Response(body === undefined ? res.body : body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  out.headers.append("Vary", "Origin");
  return out;
};

const forbid = (cors, status = 403, msg = "forbidden") =>
  new Response(msg, { status, headers: { ...cors, "Vary": "Origin" } });

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin");
    const cors = corsHeaders(origin);

    // CORS preflight — the browser sends OPTIONS before a credentialed/Authorization
    // fetch. Answer 204 with the allow-list headers (previously 405, which failed
    // the preflight and blocked the real request).
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers":
            req.headers.get("Access-Control-Request-Headers") || "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin, Access-Control-Request-Headers",
        },
      });
    }

    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("method not allowed", { status: 405, headers: { ...cors, "Vary": "Origin" } });

    const url = new URL(req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    if (!key || !exp || !sig) return forbid(cors);
    if (!/^\d+$/.test(exp) || Math.floor(Date.now() / 1000) > Number(exp))
      return forbid(cors, 403, "expired");

    const mac = await crypto.subtle.importKey(
      "raw", enc.encode(env.CDN_HMAC_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const want = toHex(await crypto.subtle.sign("HMAC", mac, enc.encode(`${key}\n${exp}`)));
    if (!eq(want, sig.toLowerCase())) return forbid(cors, 403, "bad signature");

    const cache = caches.default;
    // Cache key excludes the signature AND the Origin — the cached object is the
    // bare bytes; CORS is layered per-request below so one origin's ACAO is never
    // served to another.
    const cacheKey = new Request("https://cdn.rawdrive.in/" + encodeURI(key), { method: "GET" });
    let res = await cache.match(cacheKey);
    if (!res) {
      const aws = new AwsClient({
        accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APP_KEY,
        service: "s3", region: env.B2_REGION,
      });
      const origin_url =
        `${env.B2_ENDPOINT}/${env.B2_BUCKET}/` + key.split("/").map(encodeURIComponent).join("/");
      const b2 = await aws.fetch(origin_url, {
        method: "GET",
        headers: {
          "x-amz-server-side-encryption-customer-algorithm": "AES256",
          "x-amz-server-side-encryption-customer-key": env.SSE_C_KEY_B64,
          "x-amz-server-side-encryption-customer-key-MD5": env.SSE_C_KEY_MD5_B64,
        },
      });
      if (!b2.ok) return forbid(cors, b2.status === 404 ? 404 : 502, "not found");
      res = new Response(b2.body, b2);
      res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      [
        "x-amz-server-side-encryption-customer-algorithm",
        "x-amz-server-side-encryption-customer-key-MD5",
        "x-amz-id-2", "x-amz-request-id", "x-amz-version-id",
      ].forEach((h) => res.headers.delete(h));
      // Cache the bare (CORS-free) object so the edge cache is origin-agnostic.
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    // Layer per-request CORS on the way out (HEAD → no body).
    return withCORS(res, cors, req.method === "HEAD" ? null : res.body);
  },
};
