# API & Integrations

> **Reference Documentation**:
> - `docs/Features/API_AND_INTEGRATIONS.md` - Detailed feature specifications
> - `docs/TechnicalSpecs/developer_platform.json` - Developer platform specs
> - `docs/Features/DEVELOPER_TOOLS_AND_PROTOCOLS.md` - MCP and developer tools

## Business Value Proposition

The API & Integrations module opens RawDrive to the wider ecosystem of photography and business tools. By providing a robust, secure, and documented API, RawDrive transitions from a standalone tool to a platform that can serve as the central hub for a photography business, integrating with editing software, CRMs, and custom workflows.

### Key Business Benefits
- **Ecosystem Lock-in**: Deep integrations make it harder for customers to switch platforms.
- **Enterprise Appeal**: Large studios require API access for custom automation and reporting.
- **Partner Network**: Enables third-party developers to build plugins and extensions.
- **Workflow Automation**: Saves photographers time by connecting disparate tools (e.g., Lightroom -> RawDrive).
- **AI Readiness**: Native support for MCP (Model Context Protocol) makes the platform AI-agent friendly.

---

## User Personas

### Primary Users
1. **Developer / Integrator**
   - Builds custom connections between RawDrive and other systems.
   - Uses the API for bulk operations or data migration.

2. **Enterprise Studio IT**
   - Manages internal tools and reporting dashboards.
   - Automates user provisioning and access control.

3. **AI Agent**
   - Interacts with the platform via MCP to perform tasks on behalf of the user (e.g., "Find all photos of the bride").

---

## Key Capabilities

### 1. REST API
- **Comprehensive Coverage**: Endpoints for Gallery Management, Client CRM, Orders, and Analytics.
- **Standard Standards**: Uses standard HTTP verbs, JSON payloads, and predictable response codes.
- **Versioning**: Stable API versioning to prevent breaking changes for integrations.

### 2. Model Context Protocol (MCP)
- **AI Native**: Exposes platform capabilities as "tools" and "resources" for AI models (like Claude or Copilot).
- **Context Awareness**: Allows AI agents to understand the structure of galleries and clients to provide intelligent assistance.
- **Secure Execution**: MCP actions run with the same permissions and audit trails as user actions.

### 3. Authentication & Security
- **API Keys**: Workspace-scoped keys for server-side integrations.
- **OAuth 2.0**: Standard flow for third-party applications to request user permission.
- **RBAC Enforcement**: API calls respect the same Role-Based Access Control as the web UI.
- **Rate Limiting**: Tiered limits to protect platform stability.

### 4. Rate Limits & Quotas

- **Per-Workspace Limits**: Default ceiling (e.g., 1,000 requests/minute) with higher tiers for Business/Enterprise.
- **Per-Key Limits**: Additional throttling per API key to contain rogue integrations.
- **Burst vs Sustained**: Short bursts allowed with stricter sustained windows (e.g., 60s, 15m windows).
- **Error Semantics**: `429 Too Many Requests` with `Retry-After` header and machine-readable error body.

### 5. Webhooks
- **Real-time Events**: Push notifications to external systems when events occur (e.g., `gallery.published`, `order.created`).
- **Reliability**: Retry logic for failed webhook deliveries.

**Representative Webhook Events**:

| Event Key | Description |
|-----------|-------------|
| `gallery.published` | A gallery is published or made publicly accessible. |
| `gallery.unpublished` | A gallery is taken offline. |
| `invitation.sent` | A digital invitation is sent to one or more guests. |
| `rsvp.received` | A guest submits or updates an RSVP. |
| `billing.payment_succeeded` | A payment is successfully captured. |
| `billing.payment_failed` | A payment fails after retries. |
| `album.approved` | A client approves an album design for print. |

Payloads always include `event`, `id`, `workspace_id`, `occurred_at`, and a `data` object specific to the resource.

### 6. Versioning & Deprecation

- **Prefix-Based Versions**: Public API is exposed as `/api/v1/**`, with future `/api/v2/**` as needed.
- **Deprecation Policy**: Older versions remain available for a minimum of 12 months after announcing deprecation.
- **Change Logs**: Breaking changes documented in `docs/Features/API_AND_INTEGRATIONS.md` and developer changelog.

---

## Integration Points

- **All Modules**: The API effectively exposes the functionality of all other business modules (Galleries, CRM, Billing, etc.).
- **Audit Logs**: All API actions are recorded in the audit log for security and compliance.

---

## Scalability Considerations

- **Throttling**: Per-workspace and per-IP rate limits to prevent abuse.
- **Pagination**: Efficient handling of large datasets (e.g., thousands of photos).
- **Async Processing**: Long-running tasks (like uploads or zipping) are handled asynchronously via job queues.
