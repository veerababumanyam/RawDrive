# API and Integrations

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive provides a comprehensive REST API and integration capabilities for developers to build custom applications, automate workflows, and connect with third-party services. The API is available to Business and Enterprise tier customers.

## Purpose

API and integration features serve to:
- **Enable Automation**: Automate workflows and processes
- **Build Integrations**: Connect with third-party services
- **Extend Functionality**: Build custom applications
- **Enable Workflows**: Automate business processes
- **Support Webhooks**: React to events in real-time
- **Provide Data Access**: Programmatic access to data

## API Overview

### REST API vs MCP

RawDrive supports two complementary integration surfaces:

- **REST API**: traditional CRUD + workflow endpoints for systems integration.
- **MCP (Model Context Protocol)**: a tool/resource discovery + invocation interface designed for AI clients/agents.

Both surfaces must follow the same core rules:
- **Workspace scoping**: every request is bound to exactly one `workspace_id`.
- **Least privilege**: access is granted by explicit scopes/permissions.
- **Auditability**: integration calls must be logged and attributable to a credential.

For MCP details (tools/resources/prompts, transports, and FastMCP + FastAPI reference), see:
- `docs/Features/DEVELOPER_TOOLS_AND_PROTOCOLS.md`

### API Availability

API access by subscription tier.

**Tier Access:**
```typescript
const API_ACCESS = {
  starter: false,
  professional: false,
  business: true,
  enterprise: true,
  // Trial is an account state. During the 30-day trial, treat the workspace as Business-tier.
  trial: true,
};
```

### API Authentication

Authenticate API requests.

**Authentication Methods:**
```typescript
interface APIAuthentication {
  // API Key
  apiKey: {
    type: 'Bearer',
    header: 'Authorization: Bearer YOUR_API_KEY',
    format: 'sk_live_[random]',
  },
  
  // OAuth 2.0
  oauth: {
    type: 'OAuth 2.0',
    grantType: 'authorization_code',
    scope: ['galleries:read', 'galleries:write', 'clients:read'],
  },
}

**MCP Authentication (hosted):**
- Use the same **workspace-scoped API keys** and **OAuth clients** as the REST API.
- MCP should not introduce a separate credential system; it should reuse developer platform credentials and scopes.
```

**API Key Management:**
- Generate API keys in settings
- Rotate keys regularly
- Revoke unused keys
- Set expiration dates
- Restrict by IP address
- Restrict by permissions

### API Rate Limiting

Limit API request rates.

**Rate Limits:**
```typescript
interface RateLimits {
  // By tier
  business: {
    requestsPerMinute: 100,
    requestsPerHour: 5000,
    requestsPerDay: 100000,
  },
  enterprise: {
    requestsPerMinute: 1000,
    requestsPerHour: 50000,
    requestsPerDay: 1000000,
  },
  
  // Rate limit headers
  headers: {
    'X-RateLimit-Limit': 100,
    'X-RateLimit-Remaining': 99,
    'X-RateLimit-Reset': 1640000000,
  },
}
```

## API Endpoints

### Gallery Endpoints

Manage galleries via API.

**Gallery Operations:**
```typescript
// List galleries
GET /api/v1/galleries
Query: { page, limit, sort, filter }
Response: { galleries: Gallery[], total, page, limit }

// Get gallery
GET /api/v1/galleries/:id
Response: Gallery

// Create gallery
POST /api/v1/galleries
Body: { name, description, settings }
Response: Gallery

// Update gallery
PATCH /api/v1/galleries/:id
Body: { name, description, settings }
Response: Gallery

// Delete gallery
DELETE /api/v1/galleries/:id
Response: { success: true }

// List photos in gallery
GET /api/v1/galleries/:id/photos
Query: { page, limit, sort, filter }
Response: { photos: Photo[], total, page, limit }

// Upload photo
POST /api/v1/galleries/:id/photos
Body: FormData with file
Response: Photo

// Delete photo
DELETE /api/v1/galleries/:id/photos/:photoId
Response: { success: true }
```

### Client Endpoints

Manage clients via API.

**Client Operations:**
```typescript
// List clients
GET /api/v1/clients
Query: { page, limit, sort, filter }
Response: { clients: Client[], total, page, limit }

// Get client
GET /api/v1/clients/:id
Response: Client

// Create client
POST /api/v1/clients
Body: { email, name, phone, address }
Response: Client

// Update client
PATCH /api/v1/clients/:id
Body: { email, name, phone, address }
Response: Client

// Delete client
DELETE /api/v1/clients/:id
Response: { success: true }

// Invite client to gallery
POST /api/v1/clients/:id/invitations
Body: { galleryId, accessLevel, expiresAt }
Response: Invitation

// Get client activity
GET /api/v1/clients/:id/activity
Query: { page, limit, dateRange }
Response: { activities: Activity[], total }
```

### Photo Endpoints

Manage photos via API.

**Photo Operations:**
```typescript
// Get photo
GET /api/v1/photos/:id
Response: Photo

// Update photo
PATCH /api/v1/photos/:id
Body: { title, description, tags }
Response: Photo

// Delete photo
DELETE /api/v1/photos/:id
Response: { success: true }

// Analyze photo
POST /api/v1/photos/:id/analyze
Body: { analysisType: 'full' | 'quick' }
Response: PhotoAnalysis

// Get photo analysis
GET /api/v1/photos/:id/analysis
Response: PhotoAnalysis

// Tag people in photo
POST /api/v1/photos/:id/tags
Body: { personId, boundingBox }
Response: PhotoTag

// Get photo tags
GET /api/v1/photos/:id/tags
Response: { tags: PhotoTag[] }
```

### Album Endpoints

Manage albums via API.

**Album Operations:**
```typescript
// List albums
GET /api/v1/albums
Query: { page, limit, sort, filter }
Response: { albums: Album[], total, page, limit }

// Get album
GET /api/v1/albums/:id
Response: Album

// Create album
POST /api/v1/albums
Body: { name, description, photos }
Response: Album

// Update album
PATCH /api/v1/albums/:id
Body: { name, description, design }
Response: Album

// Delete album
DELETE /api/v1/albums/:id
Response: { success: true }

// Export album
POST /api/v1/albums/:id/export
Body: { format: 'pdf' | 'jpeg' | 'png' }
Response: { downloadUrl, expiresAt }

// Submit for print
POST /api/v1/albums/:id/print
Body: { provider, quantity, specifications }
Response: PrintOrder
```

### Account Endpoints

Manage account via API.

**Account Operations:**
```typescript
// Get account info
GET /api/v1/account
Response: Account

// Update account
PATCH /api/v1/account
Body: { email, name, businessName }
Response: Account

// Get subscription
GET /api/v1/account/subscription
Response: Subscription

// Get usage
GET /api/v1/account/usage
Response: { storage, galleries, clients, aiCredits }

// Get API keys
GET /api/v1/account/api-keys
Response: { apiKeys: APIKey[] }

// Create API key
POST /api/v1/account/api-keys
Body: { name, permissions, expiresAt }
Response: APIKey

// Revoke API key
DELETE /api/v1/account/api-keys/:keyId
Response: { success: true }
```

## Webhooks

### Webhook Events

Subscribe to events via webhooks.

**Webhook Event Types:**
```typescript
type WebhookEvent = 
  | 'gallery.created'
  | 'gallery.updated'
  | 'gallery.deleted'
  | 'photo.uploaded'
  | 'photo.analyzed'
  | 'photo.deleted'
  | 'client.invited'
  | 'client.viewed'
  | 'client.selected'
  | 'album.created'
  | 'album.updated'
  | 'album.approved'
  | 'print.ordered'
  | 'print.shipped'
  | 'subscription.changed'
  | 'payment.succeeded'
  | 'payment.failed';

interface WebhookEvent {
  id: string,
  type: WebhookEvent,
  timestamp: Date,
  data: Record<string, any>,
  signature: string, // HMAC-SHA256
}
```

### Webhook Subscription

Subscribe to webhook events.

**Webhook Configuration:**
```typescript
interface WebhookSubscription {
  id: string,
  url: string,
  events: WebhookEvent[],
  active: boolean,
  
  // Delivery
  retryPolicy: 'exponential' | 'linear',
  maxRetries: 5,
  
  // Security
  secret: string,
  
  // Metadata
  createdAt: Date,
  lastDeliveryAt?: Date,
  failureCount: number,
}
```

**Webhook Management:**
```typescript
// Create webhook
POST /api/v1/webhooks
Body: { url, events, active }
Response: WebhookSubscription

// List webhooks
GET /api/v1/webhooks
Response: { webhooks: WebhookSubscription[] }

// Update webhook
PATCH /api/v1/webhooks/:id
Body: { url, events, active }
Response: WebhookSubscription

// Delete webhook
DELETE /api/v1/webhooks/:id
Response: { success: true }

// Get webhook deliveries
GET /api/v1/webhooks/:id/deliveries
Query: { page, limit, status }
Response: { deliveries: WebhookDelivery[] }

// Retry webhook delivery
POST /api/v1/webhooks/:id/deliveries/:deliveryId/retry
Response: { success: true }
```

### Webhook Delivery

Deliver webhooks to endpoints.

**Webhook Payload:**
```typescript
interface WebhookPayload {
  id: string,
  type: string,
  timestamp: Date,
  data: Record<string, any>,
  signature: string, // HMAC-SHA256
}

// Example: gallery.created
{
  "id": "evt_123456",
  "type": "gallery.created",
  "timestamp": "2025-12-17T10:30:00Z",
  "data": {
    "gallery": {
      "id": "gal_123456",
      "name": "Wedding Photos",
      "description": "John & Jane's Wedding",
      "createdAt": "2025-12-17T10:30:00Z"
    }
  },
  "signature": "sha256=abcdef123456..."
}
```

**Webhook Verification:**
```typescript
// Verify webhook signature
const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return hash === signature;
};

// In webhook handler
app.post('/webhooks/rawdrive', (req, res) => {
  const signature = req.headers['x-rawdrive-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook
  handleWebhook(req.body);
  res.json({ success: true });
});
```

## Third-Party Integrations

### Supported Integrations

Connect with popular services.

**Integration Categories:**

**Cloud Storage:**
- Google Drive
- Dropbox
- OneDrive
- AWS S3

**Print Services:**
- Shutterfly
- Mpix
- Artifact Uprising
- Custom print providers

**Payment Processors:**
- Stripe
- Razorpay
- PayPal

**Email Services:**
- SendGrid
- Mailgun
- AWS SES

**Analytics:**
- Google Analytics
- Mixpanel
- Segment

**CRM:**
- Salesforce
- HubSpot
- Pipedrive

### Integration Setup

Set up third-party integrations.

**Integration Configuration:**
```typescript
interface Integration {
  id: string,
  type: string,
  name: string,
  status: 'connected' | 'disconnected' | 'error',
  
  // Credentials
  credentials: {
    apiKey?: string,
    apiSecret?: string,
    accessToken?: string,
    refreshToken?: string,
  },
  
  // Settings
  settings: Record<string, any>,
  
  // Metadata
  connectedAt: Date,
  lastSyncAt?: Date,
  errorMessage?: string,
}
```

**Integration Endpoints:**
```typescript
// List integrations
GET /api/v1/integrations
Response: { integrations: Integration[] }

// Get integration
GET /api/v1/integrations/:type
Response: Integration

// Connect integration
POST /api/v1/integrations/:type/connect
Body: { credentials, settings }
Response: Integration

// Disconnect integration
DELETE /api/v1/integrations/:type
Response: { success: true }

// Sync integration
POST /api/v1/integrations/:type/sync
Response: { success: true, syncedAt: Date }
```

## API Documentation

### OpenAPI/Swagger

API documentation in OpenAPI format.

**Documentation URL:**
- https://api.rawdrive.com/docs
- https://api.rawdrive.com/swagger.json

**Documentation Features:**
- Interactive API explorer
- Request/response examples
- Authentication details
- Rate limit information
- Error codes and messages

### SDK Support

Official SDKs for popular languages.

**Supported Languages:**
- JavaScript/TypeScript
- Python
- Ruby
- PHP
- Go
- Java

**SDK Features:**
- Type-safe API calls
- Automatic retry logic
- Rate limit handling
- Webhook verification
- Error handling

## Error Handling

### Error Responses

Standardized error responses.

**Error Format:**
```typescript
interface ErrorResponse {
  error: {
    code: string,
    message: string,
    details?: Record<string, any>,
  },
  requestId: string,
  timestamp: Date,
}

// Example
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Gallery not found",
    "details": {
      "galleryId": "gal_123456"
    }
  },
  "requestId": "req_abcdef123456",
  "timestamp": "2025-12-17T10:30:00Z"
}
```

**HTTP Status Codes:**
- 200: Success
- 201: Created
- 204: No Content
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 409: Conflict
- 429: Too Many Requests
- 500: Internal Server Error
- 503: Service Unavailable

## API Best Practices

### Do's
- ✅ Use HTTPS for all requests
- ✅ Include API key in Authorization header
- ✅ Handle rate limiting gracefully
- ✅ Implement exponential backoff for retries
- ✅ Verify webhook signatures
- ✅ Cache responses when appropriate
- ✅ Use pagination for large datasets
- ✅ Monitor API usage

### Don'ts
- ❌ Don't hardcode API keys
- ❌ Don't ignore rate limits
- ❌ Don't make unnecessary requests
- ❌ Don't trust webhook data without verification
- ❌ Don't store sensitive data in logs
- ❌ Don't use deprecated endpoints
- ❌ Don't ignore error responses
- ❌ Don't make synchronous requests in UI

## Related Files

- `backend/src/api/routes/galleries.ts` - Gallery endpoints
- `backend/src/api/routes/clients.ts` - Client endpoints
- `backend/src/api/routes/photos.ts` - Photo endpoints
- `backend/src/api/routes/albums.ts` - Album endpoints
- `backend/src/webhooks/webhookHandler.ts` - Webhook handling
- `backend/src/integrations/` - Integration implementations

## Last Updated

2025-12-17
