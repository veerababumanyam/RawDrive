# MCP (Model Context Protocol) Integration

RawDrive implements the Model Context Protocol (MCP) for AI agent integration across multiple services.

## MCP Servers

| Service | Endpoint | Tools | Purpose |
|---------|----------|-------|---------|
| **AI Service** | `:8013/mcp` | 16+ | Workspace ops, AI analysis, search |
| **Gallery Service** | `:8004/mcp` | 13 | Gallery CRUD, assets, sharing |

## Configuration

### Environment Variables

```bash
# AI Service MCP
PORT_AI_SERVICE=8013
DATABASE_URL=postgresql://user:pass@localhost:5432/rawdrive
MILVUS_HOST=localhost
MILVUS_PORT=19530
MILVUS_ENABLED=true
CDN_BASE_URL=https://cdn.rawdrive.ai
GALLERY_SHARE_BASE_URL=https://gallery.rawdrive.ai
AI_PROCESSING_URL=http://ai-processing-service:8012
BACKEND_URL=http://backend:8000

# Gallery Service MCP
PORT_GALLERY_SERVICE=8004
```

## Authentication

All MCP tools require authentication context:

```python
context = {
    "auth": {
        "user_id": "uuid",
        "workspace_id": "uuid",
        "permissions": ["galleries:read", "galleries:write", ...]
    }
}
```

### Permissions

| Permission | Description |
|------------|-------------|
| `galleries:read` | Read gallery and asset data |
| `galleries:write` | Create/update galleries |
| `galleries:delete` | Delete galleries |
| `galleries:share` | Create Magic Links |
| `galleries:ai:read` | Access AI insights |
| `photos:read` | Read photo data |
| `ai:analyze` | Run AI analysis |
| `ai:duplicate` | Detect duplicates |
| `workspace:read` | Read workspace stats |
| `uploads:read` | Read upload status |
| `assets:read` | Read asset AI processing |

## AI Service Tools

### Workspace Operations
- `list_galleries` - List all galleries
- `get_gallery` - Get gallery details
- `list_photos` - List photos in gallery
- `get_workspace_stats` - Workspace statistics

### Search
- `search_photos` - Semantic search via Milvus vectors

### AI Analysis
- `analyze_photo_emotions` - Detect emotions in photos
- `search_photos_by_emotion` - Find photos by emotion

### Duplicate Detection
- `find_duplicate_photos` - Visual duplicate detection
- `find_duplicate_clients` - Client record deduplication

### Upload Monitoring
- `get_upload_status` - Upload session status
- `list_recent_uploads` - Recent uploads list
- `get_upload_metrics` - Upload analytics
- `get_ai_processing_status` - AI processing status

### Resources
- `workspace://{workspace_id}/info` - Workspace info
- `workspace://{workspace_id}/galleries` - Galleries list

## Gallery Service Tools

### Gallery CRUD
- `get_gallery` - Get gallery with assets
- `list_galleries` - Paginated gallery list
- `create_gallery` - Create new gallery
- `update_gallery` - Update gallery metadata
- `delete_gallery` - Soft delete gallery

### Asset Operations
- `list_gallery_assets` - List gallery assets
- `add_assets_to_gallery` - Add assets
- `remove_assets_from_gallery` - Remove assets

### Magic Links
- `create_magic_link` - Create shareable link
- `validate_magic_link` - Validate link token

### Proofing
- `get_proofing_selections` - Get client selections

### Batch Operations
- `batch_gallery_operations` - Multiple ops in one call

## Usage Example

```python
from fastmcp import MCPClient

client = MCPClient("http://ai-service:8013/mcp")

# Search photos semantically
result = await client.call_tool(
    "search_photos",
    workspace_id="workspace-uuid",
    query="sunset at the beach",
    limit=20,
    context={
        "auth": {
            "user_id": "user-uuid",
            "workspace_id": "workspace-uuid",
            "permissions": ["photos:read"]
        }
    }
)
```

## Health Checks

```bash
# AI Service
curl http://localhost:8013/health

# Gallery Service MCP
curl http://localhost:8004/health
```

## Testing

```bash
# AI Service MCP tests
cd services/ai-service
pytest tests/integration/test_mcp_duplicate_tools.py -v

# Gallery Service MCP tests
cd services/gallery-service
pytest tests/unit/test_mcp_tools.py -v
pytest tests/unit/test_mcp_auth.py -v
```

## See Also

- [Gallery MCP README](../services/gallery-service/src/services/mcp/README.md)
- [Developer Tools & Protocols](Features/DEVELOPER_TOOLS_AND_PROTOCOLS.md)
