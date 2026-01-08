# Gallery Service MCP Server

## Overview

The Gallery Service MCP (Model Context Protocol) server exposes gallery operations as standardized tools that AI agents can call. This enables AI systems to manage galleries, assets, Magic Links, and proofing operations through a secure, authenticated interface.

## Architecture

```
┌─────────────────┐
│   AI Agents     │
│  (External)     │
└────────┬────────┘
         │ MCP Protocol
         │
    ┌────▼────────────────────┐
    │   Gallery MCP Server    │
    │  (FastMCP Framework)    │
    ├─────────────────────────┤
    │   Authentication        │
    │   Workspace Isolation   │
    │   Permission Checks     │
    └────────┬────────────────┘
             │
    ┌────────▼────────────────┐
    │  Gallery Service Logic  │
    │  (Existing Services)    │
    └─────────────────────────┘
```

## MCP Tools

### Gallery CRUD (5 tools)

#### 1. `get_gallery`
Get complete gallery details with assets and metadata.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "title": "Wedding Photos",
  "description": "...",
  "client_name": "John & Jane",
  "status": "published",
  "asset_count": 150,
  "assets": [
    {
      "asset_id": "uuid",
      "filename": "photo.jpg",
      "sort_order": 1,
      "is_favorited": false,
      "is_selected": true
    }
  ],
  "created_at": "2026-01-08T..."
}
```

**Required Permission:** `galleries:read`

#### 2. `list_galleries`
List galleries with pagination and filtering.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `filters` (dict, optional): Filters (status, client_name)
- `limit` (int): Max results (default: 50)
- `offset` (int): Pagination offset (default: 0)
- `context` (dict): Authentication context

**Returns:**
```json
{
  "galleries": [...],
  "total": 123,
  "limit": 50,
  "offset": 0
}
```

**Required Permission:** `galleries:read`

#### 3. `create_gallery`
Create a new gallery.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_data` (dict): Gallery creation data
  - `title` (str): Gallery title
  - `description` (str, optional): Description
  - `client_id` (str, optional): Client UUID
  - `client_name` (str, optional): Client name
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "title": "New Gallery",
  "status": "draft",
  "created_at": "2026-01-08T..."
}
```

**Required Permission:** `galleries:write`

#### 4. `update_gallery`
Update gallery metadata.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `updates` (dict): Fields to update
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "title": "Updated Title",
  "status": "published",
  "updated_at": "2026-01-08T..."
}
```

**Required Permission:** `galleries:write`

#### 5. `delete_gallery`
Soft delete a gallery.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "deleted": true,
  "message": "Gallery soft deleted successfully"
}
```

**Required Permission:** `galleries:delete`

---

### Asset Operations (3 tools)

#### 6. `list_gallery_assets`
List all assets in a gallery with signed URLs.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "asset_count": 150,
  "assets": [
    {
      "asset_id": "uuid",
      "filename": "photo.jpg",
      "file_size": 5242880,
      "content_type": "image/jpeg",
      "signed_url": "https://...",
      "thumbnail_url": "https://..."
    }
  ]
}
```

**Required Permission:** `galleries:read`

#### 7. `add_assets_to_gallery`
Add assets to a gallery.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `asset_ids` (list[str]): Asset UUIDs to add
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "assets_added": 10,
  "total_asset_ids": 10
}
```

**Required Permission:** `galleries:write`

#### 8. `remove_assets_from_gallery`
Remove assets from a gallery.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `asset_ids` (list[str]): Asset UUIDs to remove
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "assets_removed": 5,
  "total_asset_ids": 5
}
```

**Required Permission:** `galleries:write`

---

### Magic Link Operations (2 tools)

#### 9. `create_magic_link`
Create a shareable Magic Link for a gallery.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `settings` (dict, optional): Magic Link settings
  - `expires_at` (str, optional): Expiration datetime (ISO 8601)
  - `view_limit` (int, optional): Maximum views
  - `password` (str, optional): Password protection
  - `require_email` (bool, optional): Require email registration
- `context` (dict): Authentication context

**Returns:**
```json
{
  "magic_link_id": "uuid",
  "gallery_id": "uuid",
  "token": "abc123def456",
  "url": "/galleries/public/abc123def456",
  "expires_at": "2026-02-08T...",
  "view_limit": 100,
  "created_at": "2026-01-08T..."
}
```

**Required Permission:** `galleries:share`

#### 10. `validate_magic_link`
Validate a Magic Link token.

**Parameters:**
- `token` (str): Magic Link token
- `context` (dict): Authentication context

**Returns:**
```json
{
  "valid": true,
  "gallery_id": "uuid",
  "workspace_id": "uuid",
  "requires_password": true,
  "requires_email": false,
  "view_count": 42,
  "view_limit": 100
}
```

**No Permission Required** (public validation)

---

### Proofing (1 tool)

#### 11. `get_proofing_selections`
Get client selections and favorites from proofing.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "selections": {
    "count": 25,
    "asset_ids": ["uuid1", "uuid2", ...]
  },
  "favorites": {
    "count": 10,
    "asset_ids": ["uuid3", "uuid4", ...]
  },
  "total_proofing_actions": 35
}
```

**Required Permission:** `galleries:read`

---

### Batch Operations (1 tool)

#### 12. `batch_gallery_operations`
Execute multiple gallery operations in a single transaction.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `operations` (list[dict]): List of operations
  - Each operation: `{"type": "create|update|delete", "params": {...}}`
- `context` (dict): Authentication context

**Example Operations:**
```json
[
  {
    "type": "create",
    "params": {
      "title": "Gallery 1",
      "client_name": "Client A"
    }
  },
  {
    "type": "update",
    "params": {
      "gallery_id": "uuid",
      "updates": {"status": "published"}
    }
  }
]
```

**Returns:**
```json
{
  "total_operations": 2,
  "successful": 2,
  "failed": 0,
  "results": [
    {"index": 0, "type": "create", "success": true, "gallery_id": "uuid"},
    {"index": 1, "type": "update", "success": true, "gallery_id": "uuid"}
  ],
  "errors": []
}
```

**Required Permission:** `galleries:write`

---

### AI Integration (1 tool)

#### 13. `get_gallery_ai_insights`
Get AI insights from ai-service for a gallery.

**Parameters:**
- `workspace_id` (str): Workspace UUID
- `gallery_id` (str): Gallery UUID
- `context` (dict): Authentication context

**Returns:**
```json
{
  "gallery_id": "uuid",
  "ai_insights": {
    "recommendations": [...],
    "quality_analysis": {...},
    "semantic_tags": [...]
  }
}
```

**Required Permission:** `galleries:ai:read`

**Note:** This tool delegates to the existing ai-service. Implementation in Phase 4.

---

## Authentication

All MCP tools require authentication context in the `context` parameter:

```python
context = {
    "auth": {
        "user_id": "uuid",
        "workspace_id": "uuid",
        "permissions": ["galleries:read", "galleries:write", ...],
        "email": "user@example.com"
    }
}
```

### Permission Levels

- `galleries:read` - Read gallery and asset data
- `galleries:write` - Create and update galleries
- `galleries:delete` - Delete galleries
- `galleries:share` - Create Magic Links
- `galleries:ai:read` - Access AI insights
- `*` - Wildcard (all permissions)

### Workspace Isolation

All operations enforce workspace isolation:
1. Extract `workspace_id` from authentication context
2. Verify it matches the requested `workspace_id`
3. All database queries filter by `workspace_id`

### Error Handling

**MCPAuthError:**
- Missing or invalid authentication context
- Returns 401 Unauthorized

**MCPPermissionError:**
- Insufficient permissions
- Workspace ID mismatch
- Returns 403 Forbidden

## Usage Examples

### Python Example

```python
from fastmcp import MCPClient

# Initialize client
client = MCPClient("http://gallery-service:8004/mcp")

# Authenticate
context = {
    "auth": {
        "user_id": "user-uuid",
        "workspace_id": "workspace-uuid",
        "permissions": ["galleries:read", "galleries:write"]
    }
}

# Get gallery
result = await client.call_tool(
    "get_gallery",
    workspace_id="workspace-uuid",
    gallery_id="gallery-uuid",
    context=context
)

# Create gallery
result = await client.call_tool(
    "create_gallery",
    workspace_id="workspace-uuid",
    gallery_data={
        "title": "New Wedding Gallery",
        "client_name": "John & Jane"
    },
    context=context
)

# Batch operations
result = await client.call_tool(
    "batch_gallery_operations",
    workspace_id="workspace-uuid",
    operations=[
        {"type": "create", "params": {"title": "Gallery 1"}},
        {"type": "create", "params": {"title": "Gallery 2"}}
    ],
    context=context
)
```

### JavaScript Example (via HTTP)

```javascript
const response = await fetch('http://gallery-service:8004/mcp/tools/get_gallery', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspace_id: 'workspace-uuid',
    gallery_id: 'gallery-uuid',
    context: {
      auth: {
        user_id: 'user-uuid',
        workspace_id: 'workspace-uuid',
        permissions: ['galleries:read']
      }
    }
  })
});

const gallery = await response.json();
```

## Health Checks

### Health Endpoint
```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "gallery-mcp"
}
```

### Readiness Endpoint
```bash
GET /health/ready
```

**Response:**
```json
{
  "status": "ready",
  "service": "gallery-mcp"
}
```

## Metrics

The MCP server exposes Prometheus metrics on `/metrics`:

- `gallery_mcp_tool_calls_total{tool_name, status}` - Total tool calls
- `gallery_mcp_tool_duration_seconds{tool_name}` - Tool execution duration
- `gallery_mcp_auth_failures_total{reason}` - Authentication failures
- `gallery_mcp_permission_denials_total{permission}` - Permission denials

## Development

### Running Locally

```bash
# Install dependencies
pip install fastmcp

# Run MCP server
cd services/gallery-service
python -m uvicorn src.services.mcp.mcp_server:app --port 8005 --reload
```

### Testing

```bash
# Run MCP tool tests
pytest tests/unit/test_mcp_tools.py -v

# Test with authentication
pytest tests/integration/test_mcp_auth.py -v
```

## Deployment

### Docker

```yaml
# docker-compose.yml
services:
  gallery-mcp:
    build:
      context: ./services/gallery-service
      dockerfile: Dockerfile.mcp
    ports:
      - "8005:8005"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gallery-mcp
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: gallery-mcp
        image: gallery-service:latest
        command: ["uvicorn", "src.services.mcp.mcp_server:app", "--port", "8005"]
        ports:
        - containerPort: 8005
```

## Security Considerations

1. **Authentication Required:** All tools require valid authentication context
2. **Workspace Isolation:** All operations scoped to authenticated workspace
3. **Permission Checks:** Fine-grained permission model
4. **Rate Limiting:** Traefik applies rate limits (100 req/min)
5. **Audit Logging:** All operations logged with user_id and workspace_id
6. **No PII in Logs:** Sensitive data filtered from structured logs

## Troubleshooting

### Common Issues

**MCPAuthError: Missing user_id**
- Ensure `context.auth.user_id` is provided
- Check JWT token is valid

**MCPPermissionError: Workspace ID mismatch**
- Verify `workspace_id` parameter matches `context.auth.workspace_id`
- User may lack access to requested workspace

**Tool not found**
- Check tool name spelling
- Verify MCP server version supports the tool

### Debug Mode

Enable debug logging:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Roadmap

- [x] Phase 1: 12 core MCP tools
- [ ] Phase 2: Google A2A agent endpoints
- [ ] Phase 3: WebSocket notifications
- [ ] Phase 4: AI service integration
- [ ] Phase 5: Advanced batch operations
- [ ] Phase 6: Production deployment

## Support

For issues or questions:
- GitHub Issues: [RawDrive Issues](https://github.com/rawdrive/issues)
- Documentation: `docs/MCP_INTEGRATION.md`
- Runbook: `docs/runbooks/gallery-mcp.md`
