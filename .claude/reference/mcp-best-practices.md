# Model Context Protocol (MCP) Best Practices

A guide for implementing and standardizing MCP Servers in the RawDrive ecosystem.

---

## 1. Core Concepts

### What is MCP?
MCP (Model Context Protocol) is the standard for connecting AI models to our data and tools. It allows the "Gallery Agent" or external AI to interact with RawDrive safely.

### Architecture
*   **MCP Server:** A lightweight service (part of `ai-service` or standalone) that exposes *Resources*, *Prompts*, and *Tools*.
*   **Transport:** Server-Sent Events (SSE) for simple HTTP transport, or Stdio for local CLI. RawDrive uses **SSE** over HTTP.

---

## 2. Resource Design

Resources provide context (data) to the LLM.

### URI Scheme
Use a strict URI scheme to identify resources uniquely.
*   Format: `rawdrive://<workspace_id>/<resource_type>/<id>`
*   Example: `rawdrive://ws_123/gallery/gal_abc`, `rawdrive://ws_123/asset/img_xyz`
*   **MIME Types:** Always explicitly output MIME types (e.g., `application/json`, `image/jpeg`).

### Security
*   **Scope:** Resources MUST be scoped to the `workspace_id`.
*   **Validation:** Verify the requester has `READ` access to the underlying DB record before yielding the resource.

---

## 3. Tool Design

Tools allow the Agent to take action (mutations).

### Input Schema (JSON Schema)
Define inputs rigorously.
*   **Descriptions:** Critical for LLM reasoning. "Search for photos given a natural language query."
*   **Validation:** Use Pydantic to validate tool arguments inside the implementation.

```python
class SearchGalleryInput(BaseModel):
    query: str = Field(..., description="Natural language description of photo")
    limit: int = Field(5, le=20)
```

### Side Effects
*   **Idempotency:** Tools should be idempotent where possible.
*   **Confirmation:** Destructive actions (Delete Gallery) should require a "Human in the Loop" or distinct confirmation step if used by an autonomous agent.

---

## 4. Prompt Design

Prompts are reusable templates serving as entry points.

### Template Variables
*   Use standard mustache variables `{{ variable }}`.
*   Example: `rewrite-gallery-description` prompt might take `{{ current_description }}` and `{{ tone }}`.

### Versioning
*   Prompts evolve. Maintain backward compatibility or version names: `analyze-photo-v2`.

---

## 5. Development & Testing

### FastMCP
Use the `fastmcp` or `mcp` SDK helpers for rapid development.

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("RawDrive Gallery Service")

@mcp.tool()
def search_photos(query: str) -> str:
    """Semantically search photos."""
    ...
```

### Inspector
Always test using the `mcp-inspector` before deploying.
*   Verify Tool content is readable.
*   Verify URI matching logic works.

---

## 6. Integration

### Combining with FastAPI
Mount the MCP SSE endpoint within the existing `ai-service` FastAPI app.

```python
from mcp.server.sse import SseServerTransport

@app.get("/sse")
async def handle_sse(request: Request):
    async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
        await mcp_server.run(streams[0], streams[1], mcp_server.create_initialization_options())
```
