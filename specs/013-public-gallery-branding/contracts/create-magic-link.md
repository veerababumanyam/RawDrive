# API Contract: Create Magic Link

**Endpoint**: `POST /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/magic-links`

## Request

### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspace_id` | UUID | Yes | Workspace identifier |
| `gallery_id` | UUID | Yes | Gallery identifier |

### Request Body
```json
{
  "album_title": "Sarah & John's Wedding - June 2025",
  "label": "Main share link",
  "target_type": "gallery",
  "target_id": null,
  "expires_at": "2025-12-31T23:59:59Z",
  "max_accesses": 100,
  "qr_config": {
    "size": 1024,
    "color": "#000000",
    "logo_enabled": true,
    "error_correction": "H"
  }
}
```

### Request Schema
| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `album_title` | string | **Yes** | 1-200 chars | Client-facing title for public gallery |
| `label` | string | No | Max 100 chars | Internal label for management |
| `target_type` | enum | No | `gallery`, `sub_gallery`, `photo` | Scope of the link (default: `gallery`) |
| `target_id` | UUID | Conditional | Required if `target_type` != `gallery` | Target sub-gallery or photo ID |
| `expires_at` | ISO8601 | No | Future date | When the link expires |
| `max_accesses` | integer | No | 1-100000 | Maximum number of accesses |
| `qr_config` | object | No | - | QR code generation settings |

## Response

### Success Response (201 Created)
```json
{
  "link_id": "123e4567-e89b-12d3-a456-426614174000",
  "gallery_id": "987fcdeb-51a2-43e8-b789-123456789abc",
  "album_title": "Sarah & John's Wedding - June 2025",
  "label": "Main share link",
  "target_type": "gallery",
  "target_id": null,
  "status": "active",
  "expires_at": "2025-12-31T23:59:59Z",
  "max_accesses": 100,
  "access_count": 0,
  "qr_config": {
    "size": 1024,
    "color": "#000000",
    "logo_enabled": true,
    "error_correction": "H"
  },
  "created_at": "2025-12-29T10:30:00Z",
  "updated_at": "2025-12-29T10:30:00Z",
  "token": "abc123...xyz789",
  "url": "https://rawdrive.ai/g/abc123...xyz789"
}
```

**Note**: The `token` and `url` fields are only returned on creation. They are not stored and cannot be retrieved later.

### Error Responses

#### 400 Bad Request - Validation Error
```json
{
  "error": "ValidationError",
  "message": "Validation failed",
  "details": [
    {
      "field": "album_title",
      "message": "Album title is required"
    }
  ]
}
```

#### 403 Forbidden - Sharing Disabled
```json
{
  "error": "SHARING_DISABLED",
  "message": "Sharing is not enabled for this gallery"
}
```

#### 404 Not Found - Gallery Not Found
```json
{
  "error": "NotFound",
  "message": "Gallery not found"
}
```

## Validation Rules

1. **album_title**
   - Required for all new magic link creations
   - Must be 1-200 characters after trimming whitespace
   - Allows special characters, emojis, and unicode

2. **expires_at**
   - Must be a future date if provided
   - Recommended: At least 1 hour in the future

3. **max_accesses**
   - If provided, must be a positive integer (1-100000)

## Example Usage

### cURL
```bash
curl -X POST \
  "https://api.rawdrive.ai/v1/workspaces/${WORKSPACE_ID}/galleries/${GALLERY_ID}/magic-links" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "album_title": "Beautiful Wedding Memories",
    "label": "Client delivery",
    "expires_at": "2025-02-28T23:59:59Z"
  }'
```

### TypeScript
```typescript
const response = await magicLinkService.createLink(
  workspaceId,
  galleryId,
  {
    album_title: 'Beautiful Wedding Memories',
    label: 'Client delivery',
    expires_at: '2025-02-28T23:59:59Z',
  }
);

console.log(response.url); // Only available at creation time!
```
