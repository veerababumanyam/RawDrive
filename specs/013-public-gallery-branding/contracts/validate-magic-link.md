# API Contract: Validate Magic Link

**Endpoint**: `GET /api/v1/public/magic-links/{token}`

This is a **public endpoint** - no authentication required.

## Request

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | The magic link access token (32-64 characters) |

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `User-Agent` | Recommended | Client browser/app identifier |

## Response

### Success Response (200 OK)
```json
{
  "link_id": "123e4567-e89b-12d3-a456-426614174000",
  "gallery_id": "987fcdeb-51a2-43e8-b789-123456789abc",
  "target_type": "gallery",
  "target_id": null,
  "album_title": "Sarah & John's Wedding - June 2025",
  "gallery": {
    "gallery_id": "987fcdeb-51a2-43e8-b789-123456789abc",
    "title": "johnson_wedding_june",
    "description": "Beautiful wedding at the botanical gardens",
    "status": "published",
    "cover_asset_id": "456def78-90ab-cdef-1234-567890abcdef",
    "layout_style": "continuous",
    "theme": "light",
    "download_policy": "web_only",
    "exif_visible": true,
    "password_protected": false,
    "pin_protected": true,
    "email_registration_required": true,
    "expires_at": null,
    "primary_color": "#6366f1",
    "gradient_config": null,
    "font_family": "Inter",
    "custom_links": [],
    "sub_galleries": [],
    "stats": {
      "total_items": 150,
      "total_photos": 150,
      "total_videos": 0,
      "favorites_count": 0,
      "selections_count": 0
    },
    "created_at": "2025-06-15T10:00:00Z"
  },
  "company_profile": {
    "name": "Elegant Moments Photography",
    "logo_url": "https://cdn.rawdrive.ai/logos/elegant-moments.png",
    "brand_color": "#2563eb",
    "website": "https://elegantmoments.com",
    "tagline": "Capturing your precious moments"
  }
}
```

### Response Schema
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `link_id` | UUID | No | Magic link identifier |
| `gallery_id` | UUID | No | Gallery identifier |
| `target_type` | enum | No | Scope of the link |
| `target_id` | UUID | Yes | Target sub-gallery or photo (null for gallery) |
| `album_title` | string | Yes | Client-facing album title (null for old links) |
| `gallery` | object | No | Gallery details including title (fallback) |
| `company_profile` | object | Yes | Workspace company profile for branding |

### Error Responses

#### 404 Not Found - Invalid Token
```json
{
  "error": "LINK_INVALID",
  "message": "This link is not valid"
}
```

#### 410 Gone - Link Expired
```json
{
  "error": "LINK_EXPIRED",
  "message": "This link has expired"
}
```

#### 410 Gone - Link Revoked
```json
{
  "error": "LINK_REVOKED",
  "message": "This link is no longer valid"
}
```

#### 410 Gone - Access Limit Reached
```json
{
  "error": "LINK_ACCESS_LIMIT",
  "message": "This link has reached its access limit"
}
```

#### 403 Forbidden - Sharing Disabled
```json
{
  "error": "SHARING_DISABLED",
  "message": "This gallery is not available for sharing"
}
```

#### 429 Too Many Requests
```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Please try again later."
}
```
Response includes `Retry-After` header.

## Frontend Display Logic

### Album Title Priority
```typescript
// Display logic for album title in hero section
const displayTitle = useMemo(() => {
  // Priority 1: Album title from magic link (new links)
  if (response.album_title) {
    return response.album_title;
  }
  // Priority 2: Gallery title (backward compatibility for old links)
  return response.gallery.title;
}, [response]);
```

### Company Name Display
```typescript
// Display logic for header
const companyName = response.company_profile?.name;
const logoUrl = response.company_profile?.logo_url;

// Show company name next to logo in header
// If no company profile configured, show nothing (not placeholder)
```

## Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Per IP | 60 requests | 1 minute |
| Per Token | 30 requests | 1 minute |

## Security Notes

1. **Token Validation**: Token is hashed with SHA-256 before database lookup
2. **Access Logging**: Each validation logs IP, user agent, and referer
3. **No PII Exposure**: Error messages do not reveal whether token exists
4. **Rate Limiting**: Prevents brute force token guessing
