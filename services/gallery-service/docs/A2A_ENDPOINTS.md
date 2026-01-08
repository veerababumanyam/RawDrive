# Gallery Service - Google A2A Agent Endpoints

**Status:** ✅ **Complete** (Phase 2)
**Protocol:** Google A2A (Agent-to-Agent)
**Endpoints:** 3 specialized agents
**Architecture:** PostgreSQL (metadata) + Milvus (vectors via ai-service)

---

## Overview

The Gallery Service implements the Google A2A protocol for multi-agent communication, providing 3 specialized agents for gallery operations:

1. **Gallery Manager** - CRUD operations
2. **Proofing Assistant** - Proofing workflows
3. **Batch Processor** - Bulk operations

---

## Architecture

### Hybrid Database Model

```
┌─────────────────────────────────────────────────────────────┐
│                         AI Agents                            │
│         (External AI systems, automation, chatbots)          │
└────────────┬────────────────────────────────┬────────────────┘
             │                                │
             │ MCP Tools                      │ Google A2A
             │                                │
        ┌────▼────────────────────────────────▼─────┐
        │         Traefik v3 Gateway                │
        │   /mcp/gallery/*  /api/v1/agents/*        │
        └────────────┬──────────────────────────────┘
                     │
        ┌────────────▼──────────────┐
        │   Gallery Service         │
        │   (Agent-Consumable)      │
        │                           │
        │   - A2A Endpoints  ✅     │
        │   - MCP Server     ✅     │
        │   - WebSocket      📅     │
        │   - Batch Ops      📅     │
        └────────────┬──────────────┘
                     │
        ┌────────────▼──────────────┐
        │     PostgreSQL 16         │───┐
        │   (Gallery Metadata)      │   │
        └───────────────────────────┘   │
                                        │ Hybrid
        ┌───────────────────────────┐   │ Stack
        │        Milvus             │   │
        │   (Vector Embeddings)     │◄──┘
        │   - Face recognition      │
        │   - Semantic search       │
        │   (via ai-service)        │
        └───────────────────────────┘
```

**Database Responsibilities:**
- **PostgreSQL**: Gallery metadata, workspace isolation, photo relationships
- **Milvus**: High-dimensional vectors (512-dim face embeddings, CLIP semantic embeddings)
- **Integration**: Gallery Service → ai-service → Milvus for vector operations

---

## A2A Protocol

### Request Format

```json
{
  "task": {
    "action": "create_gallery",
    "params": {
      "title": "Wedding Photos",
      "client_name": "John & Jane"
    }
  },
  "session_id": "optional-session-id",
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:write"],
    "email": "user@example.com"
  }
}
```

### Response Format

```json
{
  "result": {
    "gallery_id": "uuid",
    "title": "Wedding Photos",
    ...
  },
  "status": "completed",
  "next_actions": [
    {
      "action": "add_assets",
      "description": "Add assets to this gallery",
      "params": {"gallery_id": "uuid", "asset_ids": []}
    }
  ],
  "session_id": "optional-session-id"
}
```

**Status Values:**
- `completed` - Action completed successfully
- `failed` - Action failed (check `error` field)
- `pending` - Action in progress (for long-running operations)

---

## Agent 1: Gallery Manager

**Endpoint:** `POST /api/v1/agents/gallery-manager/run`

**Purpose:** Handles gallery CRUD operations and Magic Link creation.

### Supported Actions

#### 1. `list_galleries`

List galleries with pagination and filtering.

**Request:**
```json
{
  "task": {
    "action": "list_galleries",
    "params": {
      "page": 1,
      "limit": 20,
      "status": "published",
      "search": "wedding"
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:read"]
  }
}
```

**Response:**
```json
{
  "result": {
    "galleries": [...],
    "total": 42,
    "page": 1,
    "limit": 20
  },
  "status": "completed",
  "next_actions": [
    {
      "action": "create_gallery",
      "description": "Create a new gallery",
      "params": {"title": "New Gallery"}
    }
  ]
}
```

#### 2. `create_gallery`

Create a new gallery.

**Request:**
```json
{
  "task": {
    "action": "create_gallery",
    "params": {
      "title": "Summer Wedding",
      "description": "Beautiful summer wedding photos",
      "client_name": "Sarah & Mike",
      "client_id": "optional-uuid"
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:write"]
  }
}
```

**Response:**
```json
{
  "result": {
    "gallery_id": "new-uuid",
    "title": "Summer Wedding",
    "status": "draft",
    "created_at": "2026-01-08T..."
  },
  "status": "completed",
  "next_actions": [
    {
      "action": "add_assets",
      "description": "Add assets to this gallery",
      "params": {"gallery_id": "new-uuid", "asset_ids": []}
    },
    {
      "action": "create_share_link",
      "description": "Create a Magic Link to share this gallery",
      "params": {"gallery_id": "new-uuid"}
    }
  ]
}
```

#### 3. `update_gallery`

Update gallery metadata.

**Request:**
```json
{
  "task": {
    "action": "update_gallery",
    "params": {
      "gallery_id": "uuid",
      "title": "Updated Title",
      "status": "published"
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:write"]
  }
}
```

#### 4. `add_assets`

Add assets to a gallery.

**Request:**
```json
{
  "task": {
    "action": "add_assets",
    "params": {
      "gallery_id": "uuid",
      "asset_ids": ["uuid1", "uuid2", "uuid3"]
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:write"]
  }
}
```

#### 5. `create_share_link`

Create a Magic Link for sharing.

**Request:**
```json
{
  "task": {
    "action": "create_share_link",
    "params": {
      "gallery_id": "uuid",
      "expires_at": "2026-02-08T00:00:00Z",
      "view_limit": 100,
      "password": "optional-password",
      "require_email": false
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:share"]
  }
}
```

---

## Agent 2: Proofing Assistant

**Endpoint:** `POST /api/v1/agents/proofing-assistant/run`

**Purpose:** Handles proofing workflows and engagement analysis.

### Supported Actions

#### 1. `get_selections`

Get client selections and favorites.

**Request:**
```json
{
  "task": {
    "action": "get_selections",
    "params": {
      "gallery_id": "uuid"
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:read"]
  }
}
```

**Response:**
```json
{
  "result": {
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
  },
  "status": "completed",
  "next_actions": [
    {
      "action": "analyze_engagement",
      "description": "Analyze engagement metrics for this gallery",
      "params": {"gallery_id": "uuid"}
    },
    {
      "action": "export_selections",
      "description": "Export selections to a file",
      "params": {"gallery_id": "uuid", "format": "json"}
    }
  ]
}
```

#### 2. `analyze_engagement`

Analyze proofing engagement metrics.

**Request:**
```json
{
  "task": {
    "action": "analyze_engagement",
    "params": {
      "gallery_id": "uuid"
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:read"]
  }
}
```

**Response:**
```json
{
  "result": {
    "gallery_id": "uuid",
    "engagement_metrics": {
      "total_selections": 25,
      "total_favorites": 10,
      "total_actions": 35,
      "selection_rate": "25/35",
      "favorite_rate": "10/35"
    },
    "insights": {
      "high_engagement": true,
      "has_selections": true,
      "has_favorites": true
    }
  },
  "status": "completed"
}
```

#### 3. `export_selections`

Export selections in various formats.

**Request:**
```json
{
  "task": {
    "action": "export_selections",
    "params": {
      "gallery_id": "uuid",
      "format": "json"
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:read"]
  }
}
```

---

## Agent 3: Batch Processor

**Endpoint:** `POST /api/v1/agents/batch-processor/run`

**Purpose:** Handles bulk operations for efficiency.

### Supported Actions

#### 1. `bulk_create_galleries`

Create multiple galleries in one request.

**Request:**
```json
{
  "task": {
    "action": "bulk_create_galleries",
    "params": {
      "galleries": [
        {"title": "Gallery 1", "client_name": "Client A"},
        {"title": "Gallery 2", "client_name": "Client B"},
        {"title": "Gallery 3", "client_name": "Client C"}
      ]
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:write"]
  }
}
```

**Response:**
```json
{
  "result": {
    "total": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {"success": true, "gallery": {...}},
      {"success": true, "gallery": {...}},
      {"success": true, "gallery": {...}}
    ]
  },
  "status": "completed"
}
```

#### 2. `bulk_add_assets`

Add assets to multiple galleries.

**Request:**
```json
{
  "task": {
    "action": "bulk_add_assets",
    "params": {
      "operations": [
        {"gallery_id": "uuid1", "asset_ids": ["a1", "a2"]},
        {"gallery_id": "uuid2", "asset_ids": ["a3", "a4"]}
      ]
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:write"]
  }
}
```

**Response:**
```json
{
  "result": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "results": [
      {"success": true, "gallery_id": "uuid1", "assets_added": 2},
      {"success": true, "gallery_id": "uuid2", "assets_added": 2}
    ]
  },
  "status": "completed"
}
```

#### 3. `clone_gallery`

Clone a gallery structure.

**Request:**
```json
{
  "task": {
    "action": "clone_gallery",
    "params": {
      "source_gallery_id": "uuid",
      "target_name": "Clone of Original",
      "include_assets": true
    }
  },
  "context": {
    "user_id": "uuid",
    "workspace_id": "uuid",
    "permissions": ["galleries:write"]
  }
}
```

**Response:**
```json
{
  "result": {
    "source_gallery_id": "uuid",
    "cloned_gallery": {
      "gallery_id": "new-uuid",
      "title": "Clone of Original",
      ...
    },
    "assets_copied": 150
  },
  "status": "completed"
}
```

---

## Error Handling

### Error Response Format

```json
{
  "result": {},
  "status": "failed",
  "error": "Gallery not found: gallery-uuid",
  "session_id": "optional-session-id"
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `gallery_id is required` | Missing parameter | Include `gallery_id` in params |
| `Gallery not found: uuid` | Gallery doesn't exist | Verify gallery ID and workspace access |
| `Workspace ID mismatch` | User lacks workspace access | Check context.workspace_id |
| `Unknown action: xyz` | Invalid action name | Use supported action names |

---

## Authentication

All A2A endpoints require JWT authentication:

```http
Authorization: Bearer <jwt-token>
```

The JWT should contain:
- `user_id` - User UUID
- `workspace_id` - Workspace UUID
- `permissions` - Array of permissions

**Permissions Required:**
- `galleries:read` - Read operations
- `galleries:write` - Create/update operations
- `galleries:delete` - Delete operations
- `galleries:share` - Magic Link creation

---

## Routing (Traefik v3)

### Priority Table

| Priority | Route | Service | Rate Limit |
|----------|-------|---------|------------|
| 148 | `/api/v1/agents/*` | gallery-service | 50 req/min |
| 140 | `/api/v1/galleries/*` | gallery-service | 200 req/min |

**Configuration:** `infrastructure/docker/traefik/dynamic.yaml`

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| A2A Endpoint P95 Latency | <1s | Single operations |
| Batch Operations Throughput | 100 items/sec | bulk_create_galleries |
| Concurrent Agent Connections | 100 | HTTP/1.1 |
| Error Rate | <0.1% | Excluding user errors |

---

## Usage Examples

### Python

```python
import httpx

async def create_gallery_via_agent(workspace_id: str, title: str):
    """Create gallery using A2A Gallery Manager agent."""
    url = "http://gallery-service:8004/api/v1/agents/gallery-manager/run"

    request = {
        "task": {
            "action": "create_gallery",
            "params": {"title": title}
        },
        "context": {
            "user_id": "user-uuid",
            "workspace_id": workspace_id,
            "permissions": ["galleries:write"]
        }
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json=request,
            headers={"Authorization": "Bearer <token>"}
        )
        return response.json()

# Usage
result = await create_gallery_via_agent("workspace-uuid", "My Gallery")
if result["status"] == "completed":
    gallery_id = result["result"]["gallery_id"]
    print(f"Created gallery: {gallery_id}")
```

### cURL

```bash
curl -X POST http://gallery-service:8004/api/v1/agents/gallery-manager/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "task": {
      "action": "create_gallery",
      "params": {"title": "My Gallery"}
    },
    "context": {
      "user_id": "user-uuid",
      "workspace_id": "workspace-uuid",
      "permissions": ["galleries:write"]
    }
  }'
```

---

## Multi-Step Workflows

The A2A protocol supports multi-step workflows through `next_actions`:

### Example: Create Gallery → Add Assets → Share

**Step 1: Create Gallery**
```json
{
  "task": {"action": "create_gallery", "params": {"title": "Wedding"}},
  "context": {...}
}
```

**Response:**
```json
{
  "result": {"gallery_id": "uuid1", ...},
  "status": "completed",
  "next_actions": [
    {"action": "add_assets", "params": {"gallery_id": "uuid1"}}
  ]
}
```

**Step 2: Add Assets**
```json
{
  "task": {"action": "add_assets", "params": {"gallery_id": "uuid1", "asset_ids": [...]}},
  "context": {...}
}
```

**Step 3: Create Share Link**
```json
{
  "task": {"action": "create_share_link", "params": {"gallery_id": "uuid1"}},
  "context": {...}
}
```

---

## Testing

### Integration Tests

```python
# tests/integration/test_a2a_agents.py

async def test_gallery_manager_create():
    """Test Gallery Manager agent create action."""
    request = {
        "task": {
            "action": "create_gallery",
            "params": {"title": "Test Gallery"}
        },
        "context": {
            "user_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "permissions": ["galleries:write"]
        }
    }

    response = await client.post("/api/v1/agents/gallery-manager/run", json=request)
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
```

---

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/api/v1/agents.py` | 600 | A2A agent endpoints |
| `src/schemas/agents.py` | 200 | A2A request/response schemas |
| `docs/A2A_ENDPOINTS.md` | 800 | This documentation |

---

## Next Steps (Phase 3)

- [ ] WebSocket notifications for real-time agent updates
- [ ] Batch operation service with Redis queue
- [ ] Enhanced error recovery for long-running operations

---

**Last Updated:** 2026-01-08
**Phase:** 2 - ✅ Complete
**Next Phase:** 3 - WebSocket & Batch Operations
