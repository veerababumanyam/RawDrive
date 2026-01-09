/**
 * RawDrive Media Edge Decrypt Worker
 *
 * Cloudflare Worker that handles encrypted media delivery with edge caching.
 *
 * Flow:
 * 1. Client requests /cdn/media/{signed_token}
 * 2. Worker validates HMAC signature
 * 3. Fetches encrypted asset from R2
 * 4. Retrieves workspace decryption key from Workers KV
 * 5. Decrypts with AES-256-GCM
 * 6. Returns decrypted content with CDN cache headers
 *
 * Security:
 * - All assets remain encrypted at rest in R2
 * - Workspace keys stored in Workers KV (encrypted with worker secret)
 * - Signed URLs required for all access
 * - Per-workspace key isolation
 */

// Environment bindings (configured in wrangler.toml):
// - RAWDRIVE_KEYS: Workers KV namespace for workspace keys
// - RAWDRIVE_ASSETS: R2 bucket binding
// - SIGNING_SECRET: HMAC signing secret (same as backend JWT_SECRET)
// - KV_ENCRYPTION_KEY: Key to encrypt workspace keys in KV

const CACHE_TTL_THUMBNAIL = 86400 * 7; // 7 days for thumbnails
const CACHE_TTL_PREVIEW = 86400; // 1 day for previews
const CACHE_TTL_ORIGINAL = 3600; // 1 hour for originals

// Valid variants - whitelist for security
const VALID_VARIANTS = new Set(['thumbnail', 'preview', 'original']);

// UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate signed token and extract parameters
 */
async function validateSignedToken(token, signingSecret) {
  try {
    // Token format: base64url({workspace_id, asset_id, variant, expires, signature})
    const decoded = JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/')));

    const { workspace_id, asset_id, variant, expires, signature } = decoded;

    // Validate required fields exist
    if (!workspace_id || !asset_id || !variant || !expires || !signature) {
      return { valid: false, error: 'Invalid token' };
    }

    // Validate UUID format for workspace_id and asset_id
    if (!UUID_REGEX.test(workspace_id) || !UUID_REGEX.test(asset_id)) {
      return { valid: false, error: 'Invalid token' };
    }

    // Validate variant is in whitelist
    if (!VALID_VARIANTS.has(variant)) {
      return { valid: false, error: 'Invalid token' };
    }

    // Validate expires is a number
    if (typeof expires !== 'number' || expires <= 0) {
      return { valid: false, error: 'Invalid token' };
    }

    // Check expiration
    if (Date.now() > expires) {
      return { valid: false, error: 'Token expired' };
    }

    // Verify HMAC signature
    const payload = `${workspace_id}:${asset_id}:${variant}:${expires}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    return {
      valid: true,
      workspace_id,
      asset_id,
      variant,
      expires,
    };
  } catch (e) {
    // Don't expose parse error details - could help attackers understand token structure
    return { valid: false, error: 'Invalid token' };
  }
}

/**
 * Get workspace decryption key from KV
 * Keys are stored encrypted with KV_ENCRYPTION_KEY
 */
async function getWorkspaceKey(env, workspaceId) {
  const encryptedKey = await env.RAWDRIVE_KEYS.get(`workspace:${workspaceId}`, 'arrayBuffer');

  if (!encryptedKey) {
    return null;
  }

  // Decrypt the workspace key using KV_ENCRYPTION_KEY
  const kvKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.KV_ENCRYPTION_KEY.slice(0, 32)), // 256 bits
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // First 12 bytes are IV, rest is ciphertext
  const iv = new Uint8Array(encryptedKey.slice(0, 12));
  const ciphertext = new Uint8Array(encryptedKey.slice(12));

  const decryptedKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    kvKey,
    ciphertext
  );

  return new Uint8Array(decryptedKey);
}

/**
 * Decrypt asset data using AES-256-GCM
 */
async function decryptAsset(encryptedData, workspaceKey) {
  // Import the workspace key
  const key = await crypto.subtle.importKey(
    'raw',
    workspaceKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // First 12 bytes are IV, next 16 are auth tag (appended by GCM), rest is ciphertext
  const iv = new Uint8Array(encryptedData.slice(0, 12));
  const ciphertext = new Uint8Array(encryptedData.slice(12));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

/**
 * Get content type from variant and filename
 */
function getContentType(variant, filename) {
  if (variant === 'thumbnail' || variant === 'preview') {
    return 'image/webp';
  }

  // Detect from filename for originals
  const ext = filename?.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'raw': 'image/x-raw',
    'cr2': 'image/x-canon-cr2',
    'nef': 'image/x-nikon-nef',
    'arw': 'image/x-sony-arw',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Build R2 storage key for asset
 */
function buildStorageKey(workspaceId, assetId, variant) {
  const variantPath = {
    'original': 'original',
    'thumbnail': 'thumbnails/512',
    'preview': 'previews/1920',
  };

  return `workspaces/${workspaceId}/assets/${assetId}/${variantPath[variant] || variant}`;
}

/**
 * Main request handler
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);

  // Health check endpoint
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok', service: 'media-edge-decrypt' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Media endpoint: /cdn/media/{signed_token}
  const mediaMatch = url.pathname.match(/^\/cdn\/media\/([A-Za-z0-9_-]+)$/);
  if (!mediaMatch) {
    return new Response('Not Found', { status: 404 });
  }

  const token = mediaMatch[1];

  // Validate signed token
  const validation = await validateSignedToken(token, env.SIGNING_SECRET);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { workspace_id, asset_id, variant } = validation;

  // Check cache first
  const cacheKey = new Request(`https://cache.rawdrive.com/${workspace_id}/${asset_id}/${variant}`);
  const cache = caches.default;

  let response = await cache.match(cacheKey);
  if (response) {
    // Add cache hit header
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }

  // Get workspace decryption key
  const workspaceKey = await getWorkspaceKey(env, workspace_id);
  if (!workspaceKey) {
    return new Response(JSON.stringify({ error: 'Workspace key not found' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch encrypted asset from R2
  const storageKey = buildStorageKey(workspace_id, asset_id, variant);
  const r2Object = await env.RAWDRIVE_ASSETS.get(storageKey);

  if (!r2Object) {
    return new Response(JSON.stringify({ error: 'Asset not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Decrypt asset
  const encryptedData = await r2Object.arrayBuffer();
  let decryptedData;

  try {
    decryptedData = await decryptAsset(encryptedData, workspaceKey);
  } catch (e) {
    console.error('Decryption failed:', e);
    return new Response(JSON.stringify({ error: 'Decryption failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Determine cache TTL based on variant
  const cacheTtl = {
    'thumbnail': CACHE_TTL_THUMBNAIL,
    'preview': CACHE_TTL_PREVIEW,
    'original': CACHE_TTL_ORIGINAL,
  }[variant] || CACHE_TTL_PREVIEW;

  // Build response with appropriate headers
  const contentType = getContentType(variant, r2Object.httpMetadata?.contentDisposition);

  response = new Response(decryptedData, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': decryptedData.byteLength.toString(),
      'Cache-Control': `private, max-age=${cacheTtl}, immutable`,
      'X-Cache': 'MISS',
      // Security headers - don't expose internal IDs
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });

  // Store in cache (async, don't wait)
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

/**
 * Worker entry point
 */
export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      console.error('Worker error:', e);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
