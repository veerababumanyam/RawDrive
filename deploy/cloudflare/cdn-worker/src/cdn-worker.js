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
import { AwsClient } from "aws4fetch";

const enc = new TextEncoder();
const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const eq = (a, b) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

export default {
  async fetch(req, env, ctx) {
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("method not allowed", { status: 405 });

    const url = new URL(req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    if (!key || !exp || !sig) return new Response("forbidden", { status: 403 });
    if (!/^\d+$/.test(exp) || Math.floor(Date.now() / 1000) > Number(exp))
      return new Response("expired", { status: 403 });

    const mac = await crypto.subtle.importKey(
      "raw", enc.encode(env.CDN_HMAC_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const want = toHex(await crypto.subtle.sign("HMAC", mac, enc.encode(`${key}\n${exp}`)));
    if (!eq(want, sig.toLowerCase())) return new Response("bad signature", { status: 403 });

    const cache = caches.default;
    const cacheKey = new Request("https://cdn.rawdrive.in/" + encodeURI(key), { method: "GET" });
    let res = await cache.match(cacheKey);
    if (!res) {
      const aws = new AwsClient({
        accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APP_KEY,
        service: "s3", region: env.B2_REGION,
      });
      const origin =
        `${env.B2_ENDPOINT}/${env.B2_BUCKET}/` + key.split("/").map(encodeURIComponent).join("/");
      const b2 = await aws.fetch(origin, {
        method: "GET",
        headers: {
          "x-amz-server-side-encryption-customer-algorithm": "AES256",
          "x-amz-server-side-encryption-customer-key": env.SSE_C_KEY_B64,
          "x-amz-server-side-encryption-customer-key-MD5": env.SSE_C_KEY_MD5_B64,
        },
      });
      if (!b2.ok) return new Response("not found", { status: b2.status === 404 ? 404 : 502 });
      res = new Response(b2.body, b2);
      res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      [
        "x-amz-server-side-encryption-customer-algorithm",
        "x-amz-server-side-encryption-customer-key-MD5",
        "x-amz-id-2", "x-amz-request-id", "x-amz-version-id",
      ].forEach((h) => res.headers.delete(h));
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return req.method === "HEAD" ? new Response(null, res) : res;
  },
};
