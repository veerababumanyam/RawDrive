# CDN for B2 media — C1 (Worker decrypt) + signed URLs — LOCKED CONTRACT

**Status:** contract locked, code final. Deploy needs Cloudflare access + the prod SSE-C key.
**Goal:** `cdn.rawdrive.in` edge-serves + caches gallery derivatives, while preserving PIN/password
gallery gating via short-lived HMAC-signed URLs minted by the backend. Origin = `rawdriveclientfiles`
(`rawfolder` deleted 2026-06-05).

---

## 1. Signed-URL contract (BOTH sides MUST match exactly)

- **URL:** `https://cdn.rawdrive.in/<key>?exp=<unix>&sig=<hex>`
- **`<key>`** = the B2 object key, each path segment percent-encoded, `/` preserved
  (e.g. `thumbnails/<uuid>/thumb_md_webp.webp`).
- **Canonical string to sign** = `<raw-key> + "\n" + <exp>`
  - `<raw-key>` = the **decoded** object key (NOT percent-encoded).
  - `"\n"` = a single 0x0A byte.
  - `<exp>` = expiry as decimal **unix seconds** (integer, as ASCII).
- **Algorithm:** `HMAC-SHA256`, HMAC key = the **UTF-8 bytes of the `CDN_HMAC_SECRET` string**
  (treat the secret as an opaque string on both sides; do NOT hex-decode it).
- **`sig`** = lowercase hex of the HMAC.
- **Worker validation (in order):** `exp` is all-digits → `now <= exp` → constant-time `sig` match.
  Any failure → `403`. Missing param → `403`.
- **TTL:** backend mints with ~1h expiry. The signature authorizes that one object until `exp`.

`CDN_HMAC_SECRET` (set identically on Worker + backend; gitignored on the backend):
```
9ec34bb2d8c97ea06be91a6d2b8954aa3e432912ace00cd5198556d2198251af
```

## 2. Worker env (Cloudflare → Worker → Settings → Variables)

| Name | Type | Value / how to get it |
|---|---|---|
| `B2_BUCKET` | var | `rawdriveclientfiles` |
| `B2_ENDPOINT` | var | `https://s3.us-east-005.backblazeb2.com` |
| `B2_REGION` | var | `us-east-005` |
| `B2_KEY_ID` | secret | the new **cdn-ro** key id (`005…`) — Step 4 |
| `B2_APP_KEY` | secret | the new cdn-ro app key (`K005…`) — Step 4 |
| `CDN_HMAC_SECRET` | secret | the hex above |
| `SSE_C_KEY_B64` | secret | base64(raw SSE-C key) — Step 3 |
| `SSE_C_KEY_MD5_B64` | secret | base64(md5(raw SSE-C key)) — Step 3 |

## 3. Derive the SSE-C values (run on a prod app node, e.g. `.42`)

```bash
HEX=$(grep '^STORAGE_SSE_C_KEY=' /opt/rawdrive/app/.env | cut -d= -f2)
python3 - "$HEX" <<'PY'
import base64,hashlib,sys
raw=bytes.fromhex(sys.argv[1].strip())
print("SSE_C_KEY_B64    =", base64.b64encode(raw).decode())
print("SSE_C_KEY_MD5_B64=", base64.b64encode(hashlib.md5(raw).digest()).decode())
PY
```
Put those two values into the Worker secrets above. (Don't paste them into shared logs.)

## 4. Mint the read-only CDN key (native API — console can't scope per bucket)

```bash
AUTH=$(curl -s -u "654b7a5d0e13:<MASTER_APP_KEY>" https://api.backblazeb2.com/b2api/v3/b2_authorize_account)
APIURL=$(echo "$AUTH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["apiInfo"]["storageApi"]["apiUrl"])')
TOKEN=$(echo "$AUTH"  | python3 -c 'import sys,json;print(json.load(sys.stdin)["authorizationToken"])')
curl -s -H "Authorization: $TOKEN" -X POST "$APIURL/b2api/v3/b2_create_key" \
  -d '{"accountId":"654b7a5d0e13","keyName":"rawdrive-cdn-ro",
       "capabilities":["listFiles","readFiles"],
       "bucketId":"3615b4ab878a958d90ee0113"}'   # rawdriveclientfiles
```
→ `applicationKeyId` → `B2_KEY_ID`, `applicationKey` → `B2_APP_KEY`.

## 5. Worker code (`wrangler deploy`; dep: `npm i aws4fetch`)

```js
import { AwsClient } from "aws4fetch";
const enc = new TextEncoder();
const toHex = (b) => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
const eq = (a,b)=>{ if(a.length!==b.length) return false; let r=0;
  for(let i=0;i<a.length;i++) r|=a.charCodeAt(i)^b.charCodeAt(i); return r===0; };

export default {
  async fetch(req, env, ctx) {
    if (req.method!=="GET" && req.method!=="HEAD")
      return new Response("method not allowed",{status:405});
    const url = new URL(req.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/,""));
    const exp = url.searchParams.get("exp"), sig = url.searchParams.get("sig");
    if (!key || !exp || !sig) return new Response("forbidden",{status:403});
    if (!/^\d+$/.test(exp) || Math.floor(Date.now()/1000) > Number(exp))
      return new Response("expired",{status:403});
    const mac = await crypto.subtle.importKey("raw", enc.encode(env.CDN_HMAC_SECRET),
      {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
    const want = toHex(await crypto.subtle.sign("HMAC", mac, enc.encode(`${key}\n${exp}`)));
    if (!eq(want, sig.toLowerCase())) return new Response("bad signature",{status:403});

    const cache = caches.default;
    const cacheKey = new Request("https://cdn.rawdrive.in/"+encodeURI(key), {method:"GET"});
    let res = await cache.match(cacheKey);
    if (!res) {
      const aws = new AwsClient({ accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APP_KEY,
        service:"s3", region: env.B2_REGION });
      const origin = `${env.B2_ENDPOINT}/${env.B2_BUCKET}/`
        + key.split("/").map(encodeURIComponent).join("/");
      const b2 = await aws.fetch(origin, { method:"GET", headers:{
        "x-amz-server-side-encryption-customer-algorithm":"AES256",
        "x-amz-server-side-encryption-customer-key": env.SSE_C_KEY_B64,
        "x-amz-server-side-encryption-customer-key-MD5": env.SSE_C_KEY_MD5_B64,
      }});
      if (!b2.ok) return new Response("not found",{status: b2.status===404?404:502});
      res = new Response(b2.body, b2);
      res.headers.set("Cache-Control","public, max-age=31536000, immutable");
      ["x-amz-server-side-encryption-customer-algorithm",
       "x-amz-server-side-encryption-customer-key-MD5",
       "x-amz-id-2","x-amz-request-id","x-amz-version-id"].forEach(h=>res.headers.delete(h));
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return req.method==="HEAD" ? new Response(null,res) : res;
  }
};
```
Route: `cdn.rawdrive.in/*` → this Worker. Cache: Worker sets immutable Cache-Control; CF caches by
the object cacheKey (signature excluded) so it's shared across authorized users.

## 6. Backend minter contract (Go — must match §1 byte-for-byte)

```go
// CDN_HMAC_SECRET (env, gitignored) == the Worker's CDN_HMAC_SECRET
func SignedCDNURL(key string, ttl time.Duration) string {
    exp := time.Now().Add(ttl).Unix()
    m := hmac.New(sha256.New, []byte(os.Getenv("CDN_HMAC_SECRET"))) // secret as STRING bytes
    fmt.Fprintf(m, "%s\n%d", key, exp)                              // raw key + "\n" + exp
    sig := hex.EncodeToString(m.Sum(nil))
    var p strings.Builder
    for i, seg := range strings.Split(key, "/") {
        if i > 0 { p.WriteByte('/') }
        p.WriteString(url.PathEscape(seg))
    }
    return fmt.Sprintf("https://cdn.rawdrive.in/%s?exp=%d&sig=%s", p.String(), exp, sig)
}
```
Emit CDN URLs only **after** the gallery-session/PIN check, behind flag `CDN_SIGNED_URLS` (default
off). Frontend uses whatever URL the API returns — no client change.

## 7. Test matrix
```bash
# mint a signed URL from the app (authorized session), then:
curl -sI "https://cdn.rawdrive.in/<enc-key>?exp=<exp>&sig=<sig>"   # 200 + Cache-Control immutable
curl -sI "https://cdn.rawdrive.in/<enc-key>?exp=<exp>&sig=<sig>"   # CF-Cache-Status: HIT
curl -sI "https://cdn.rawdrive.in/<enc-key>?exp=<exp>&sig=00"      # 403 bad signature
curl -sI "https://cdn.rawdrive.in/<enc-key>?exp=1&sig=<sig>"       # 403 expired
curl -sI "https://cdn.rawdrive.in/<enc-key>"                       # 403 unsigned
```
First success also proves SSE-C decrypt at the edge (valid image bytes, not `400 InvalidArgument`).

## 8. Phase 2 (later) — drop the key out of Cloudflare
Re-encrypt derivatives SSE-C → **SSE-B2** (same migration pattern we used for the bucket move). Then
the Worker drops `SSE_C_KEY_*` and just validates the signature + proxies with the cdn-ro key; B2
decrypts transparently. Masters/originals stay SSE-C, served via the app `/storage` path.

## Rollback
`CDN_SIGNED_URLS=false` (backend reverts to `/storage` URLs) and/or unbind the Worker route.
`api.rawdrive.in/storage` keeps serving everything as today.
