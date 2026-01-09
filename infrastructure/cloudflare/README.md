# RawDrive Cloudflare CDN Setup

This directory contains Cloudflare Workers configuration for edge decryption of encrypted media assets.

## Architecture

```
Client Request
    ↓
Cloudflare CDN (check edge cache)
    ↓ (cache miss)
Cloudflare Worker (media-edge-decrypt)
    ├─ Validate signed token (HMAC)
    ├─ Fetch encrypted asset from R2
    ├─ Get workspace key from Workers KV
    ├─ Decrypt with AES-256-GCM
    └─ Return decrypted + cache at edge
```

## Security

- **Full encryption maintained**: All assets remain AES-256-GCM encrypted in R2
- **Edge decryption**: Keys stored in Workers KV (encrypted with KV_ENCRYPTION_KEY)
- **Signed URLs**: Required for all access, validated at edge before decryption
- **Workspace isolation**: Separate derived keys per workspace

## Prerequisites

1. **Cloudflare Account** with Workers and R2 enabled
2. **Wrangler CLI** installed: `npm install -g wrangler`
3. **Domain** configured in Cloudflare (for custom routes)

## Setup

### 1. Authenticate with Cloudflare

```bash
wrangler login
```

### 2. Create KV Namespace

```bash
# Production
wrangler kv:namespace create "RAWDRIVE_KEYS"

# Development (preview)
wrangler kv:namespace create "RAWDRIVE_KEYS" --preview
```

Copy the namespace IDs to `wrangler.toml`.

### 3. Configure R2 Bucket

Ensure your R2 bucket is created and accessible:

```bash
wrangler r2 bucket list
```

If not exists:
```bash
wrangler r2 bucket create rawdrive-assets
```

### 4. Set Secrets

```bash
# HMAC signing secret (same as backend JWT_SECRET)
wrangler secret put SIGNING_SECRET

# KV encryption key (32+ hex characters)
wrangler secret put KV_ENCRYPTION_KEY
```

### 5. Update wrangler.toml

Replace placeholder values:
- `YOUR_KV_NAMESPACE_ID` → Production KV namespace ID
- `YOUR_PREVIEW_KV_NAMESPACE_ID` → Preview KV namespace ID

### 6. Deploy

```bash
# Development
wrangler dev

# Staging
wrangler deploy --env staging

# Production
wrangler deploy --env production
```

## Environment Variables (Backend)

Add these to your backend environment:

```bash
# Cloudflare configuration
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
CLOUDFLARE_API_TOKEN=<api-token-with-workers-kv-permissions>
CLOUDFLARE_KV_NAMESPACE_ID=<kv-namespace-id>
KV_ENCRYPTION_KEY=<32-byte-hex-key>

# CDN URL (for frontend)
CDN_BASE_URL=https://cdn.rawdrive.com
```

## Syncing Workspace Keys

After deploying the worker, sync workspace keys to Workers KV:

### Via Admin API

```bash
# Sync single workspace
curl -X POST https://api.rawdrive.com/api/v1/admin/cdn-keys/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "uuid-here"}'

# Sync multiple workspaces
curl -X POST https://api.rawdrive.com/api/v1/admin/cdn-keys/sync/bulk \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspace_ids": ["uuid1", "uuid2", "uuid3"]}'

# Check CDN status
curl https://api.rawdrive.com/api/v1/admin/cdn-keys/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Via Script (all workspaces)

```bash
# List all active workspace IDs
psql $DATABASE_URL -t -c "SELECT workspace_id FROM workspaces WHERE is_active = true" | \
  tr -d ' ' | \
  jq -R -s -c 'split("\n") | map(select(. != ""))' | \
  curl -X POST https://api.rawdrive.com/api/v1/admin/cdn-keys/sync/bulk \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d @-
```

## Monitoring

### Worker Logs

```bash
wrangler tail
```

### Metrics (Grafana)

Add the following Prometheus metrics (from Cloudflare Analytics API or Worker):

- `cdn_requests_total{status, variant}` - Total requests by status and variant
- `cdn_cache_hits_total` - Cache hit count
- `cdn_decryption_duration_seconds` - Decryption latency

### Alerts

Set up alerts for:
- Worker error rate > 1%
- Decryption failures
- KV key misses (missing workspace keys)

## Troubleshooting

### "Workspace key not found"

Workspace key hasn't been synced to Workers KV. Run:
```bash
curl -X POST https://api.rawdrive.com/api/v1/admin/cdn-keys/sync \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"workspace_id": "the-workspace-id"}'
```

### "Decryption failed"

Key mismatch or corrupted data. Check:
1. Workspace key in KV matches the one used to encrypt assets
2. Asset data in R2 is not corrupted
3. KV_ENCRYPTION_KEY is consistent between backend and worker

### "Token expired"

CDN signed tokens have expired. Frontend should refresh tokens:
```typescript
const url = await cdnService.getSignedCdnUrl(assetId, variant);
```

### High latency

1. Check R2 bucket location (should be close to edge)
2. Review cache hit ratio (should be > 80%)
3. Consider increasing CACHE_TTL values

## Key Rotation

To rotate workspace keys:

1. Re-encrypt all assets with new key (background job)
2. Sync new key to Workers KV:
   ```bash
   curl -X POST https://api.rawdrive.com/api/v1/admin/cdn-keys/rotate/{workspace_id} \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```
3. Old cached decrypted assets will expire based on CACHE_TTL

## Cost Estimates

| Component | Pricing |
|-----------|---------|
| Workers | $0.50/million requests |
| Workers KV | $0.50/million reads, $5/million writes |
| R2 | $0.015/GB stored, free egress |
| Cache | Free (included with Workers) |

Estimated monthly cost for 10M requests: ~$5-10
