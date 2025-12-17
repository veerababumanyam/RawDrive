# Developer Tools and Protocols

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (canonical terms for Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive provides comprehensive developer tools and protocols including Model Context Protocol (MCP), Application-to-Application (A2A) communication, Software Development Kits (SDKs), and Application Development Kits (ADKs). These tools enable developers to build integrations, extend functionality, and create custom applications.

## Purpose

Developer tools serve to:
- **Enable Integration**: Connect with external systems
- **Extend Functionality**: Build custom features
- **Automate Workflows**: Create automated processes
- **Build Applications**: Develop custom apps
- **Provide Context**: Share data and context between systems
- **Standardize Communication**: Use common protocols
- **Accelerate Development**: Provide pre-built components

---

## Model Context Protocol (MCP)

### MCP Overview

Model Context Protocol enables AI models and applications to access RawDrive data and functionality through a standardized interface.

**MCP Purpose:**
- Provide context to AI models
- Enable AI-powered features
- Share data with external systems
- Standardize data access
- Enable tool discovery

### MCP Server Implementation

Implement MCP server for RawDrive.

#### Reference implementation: FastAPI + FastMCP (Python)

RawDrive’s **recommended** MCP server reference architecture is:

- **FastAPI** as the HTTP runtime (routing, auth middleware, rate limits)
- **FastMCP** as the MCP protocol layer (tools/resources/prompts + transport adapters)

This is intentionally documented as a *separate service* so the core REST API can remain Node/TypeScript (or any stack) while MCP is added as an integration surface.

**Recommended production transport**
- **SSE over HTTP** for hosted MCP (remote clients connect over the network)

**Recommended local/dev transport**
- **stdio** for local tooling (e.g., “run locally and talk to it from a dev agent”)

**Suggested endpoint shape (hosted SSE):**
- `GET /v1/workspaces/{workspace_id}/mcp` (SSE)

Notes:
- MCP must be **workspace-scoped**: every request binds to exactly one `workspace_id`.
- MCP must be **scope-gated**: tools/resources are exposed only if the caller’s credential scopes allow it.
- MCP must be **deny-by-default**: a workspace admin explicitly enables tools/resources (or tool bundles).

**MCP Server Configuration:**
```typescript
interface MCPServerConfig {
  // Server
  name: 'rawdrive-mcp',
  version: '1.0.0',
  
  // Protocol
  protocol: 'stdio' | 'sse' | 'websocket',
  
  // Resources
  resources: {
    uri: string,
    name: string,
    description: string,
    mimeType: string,
  }[],
  
  // Tools
  tools: {
    name: string,
    description: string,
    inputSchema: JSONSchema,
  }[],
  
  // Prompts
  prompts: {
    name: string,
    description: string,
    arguments: {
      name: string,
      description: string,
      required: boolean,
    }[],
  }[],
}
```

### MCP Resources

Expose RawDrive data as MCP resources.

**Available Resources:**
```typescript
interface MCPResources {
  // Galleries
  'gallery://[id]': {
    name: 'Gallery',
    description: 'Photo gallery',
    mimeType: 'application/json',
  },
  
  // Photos
  'photo://[id]': {
    name: 'Photo',
    description: 'Individual photo',
    mimeType: 'application/json',
  },
  
  // Albums
  'album://[id]': {
    name: 'Album',
    description: 'Print album',
    mimeType: 'application/json',
  },
  
  // Clients
  'client://[id]': {
    name: 'Client',
    description: 'Client information',
    mimeType: 'application/json',
  },
  
  // Bookings
  'booking://[id]': {
    name: 'Booking',
    description: 'Booking information',
    mimeType: 'application/json',
  },
}
```

### MCP Tools

Expose RawDrive functionality as MCP tools.

**Available Tools:**
```typescript
interface MCPTools {
  // Gallery operations
  'list_galleries': {
    description: 'List all galleries',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  },
  
  'get_gallery': {
    description: 'Get gallery details',
    inputSchema: {
      type: 'object',
      properties: {
        galleryId: { type: 'string' },
      },
      required: ['galleryId'],
    },
  },
  
  // Photo operations
  'analyze_photo': {
    description: 'Analyze photo with AI',
    inputSchema: {
      type: 'object',
      properties: {
        photoId: { type: 'string' },
        analysisType: { type: 'string', enum: ['full', 'quick'] },
      },
      required: ['photoId'],
    },
  },
  
  'detect_faces': {
    description: 'Detect faces in photo',
    inputSchema: {
      type: 'object',
      properties: {
        photoId: { type: 'string' },
      },
      required: ['photoId'],
    },
  },
  
  // Booking operations
  'create_booking': {
    description: 'Create booking request',
    inputSchema: {
      type: 'object',
      properties: {
        clientName: { type: 'string' },
        clientEmail: { type: 'string' },
        serviceType: { type: 'string' },
        requestedDate: { type: 'string' },
        requestedTime: { type: 'string' },
      },
      required: ['clientName', 'clientEmail', 'serviceType', 'requestedDate'],
    },
  },
}
```

### MCP Prompts

Provide AI prompts for common tasks.

**Available Prompts:**
```typescript
interface MCPPrompts {
  'generate_gallery_description': {
    description: 'Generate description for gallery',
    arguments: [
      {
        name: 'galleryId',
        description: 'Gallery ID',
        required: true,
      },
    ],
  },
  
  'suggest_best_photos': {
    description: 'Suggest best photos from gallery',
    arguments: [
      {
        name: 'galleryId',
        description: 'Gallery ID',
        required: true,
      },
      {
        name: 'count',
        description: 'Number of photos to suggest',
        required: false,
      },
    ],
  },
  
  'generate_client_email': {
    description: 'Generate email to client',
    arguments: [
      {
        name: 'clientName',
        description: 'Client name',
        required: true,
      },
      {
        name: 'purpose',
        description: 'Email purpose',
        required: true,
      },
    ],
  },
}
```

### MCP Authentication

Authenticate MCP requests.

**Authentication Methods:**
```typescript
interface MCPAuthentication {
  /**
   * Workspace-scoped API Key (recommended for third-party MCP clients).
   *
   * The API key is created by a workspace admin and is scoped to:
   * - a workspace_id
   * - a scope set (e.g., galleries:read)
   */
  apiKey: {
    type: 'Bearer',
    header: 'Authorization: Bearer YOUR_API_KEY',
  },

  /**
   * OAuth 2.0 (recommended for enterprise integrations).
   * Use client credentials for machine-to-machine.
   */
  oauth: {
    type: 'OAuth 2.0',
    grantType: 'client_credentials',
  },

  /**
   * First-party user session (optional): user JWT/cookie session.
   *
   * Use only when MCP is consumed by RawDrive-owned clients
   * (e.g., internal Studio UI or Admin UI).
   */
  userSession: {
    type: 'User Session',
    header: 'Authorization: Bearer USER_JWT',
  },
}
```

---

## Application-to-Application (A2A) Communication

### A2A Overview

Enable secure communication between applications.

**A2A Purpose:**
- Service-to-service communication
- Microservice architecture
- Event-driven workflows
- Real-time synchronization
- Secure data exchange

### A2A Protocols

Supported communication protocols.

**Protocol Options:**
```typescript
interface A2AProtocols {
  // REST
  rest: {
    protocol: 'HTTP/HTTPS',
    format: 'JSON',
    authentication: 'API Key, OAuth',
  },
  
  // gRPC
  grpc: {
    protocol: 'HTTP/2',
    format: 'Protocol Buffers',
    authentication: 'mTLS, OAuth',
  },
  
  // Message Queue
  messageQueue: {
    protocol: 'AMQP, MQTT',
    format: 'JSON, Binary',
    authentication: 'Credentials, Certificates',
  },
  
  // WebSocket
  websocket: {
    protocol: 'WebSocket',
    format: 'JSON',
    authentication: 'Token',
  },
}
```

### A2A Service Registry

Register services for discovery.

**Service Registration:**
```typescript
interface A2AService {
  id: string,
  name: string,
  description: string,
  
  // Endpoints
  endpoints: {
    protocol: string,
    host: string,
    port: number,
    path: string,
  }[],
  
  // Authentication
  authentication: {
    type: string,
    credentials: Record<string, string>,
  },
  
  // Health
  healthCheck: {
    enabled: boolean,
    interval: number, // Seconds
    timeout: number, // Seconds
  },
  
  // Metadata
  version: string,
  tags: string[],
  registeredAt: Date,
}
```

### A2A Event Bus

Publish and subscribe to events.

**Event Bus Configuration:**
```typescript
interface A2AEventBus {
  // Events
  events: {
    name: string,
    description: string,
    schema: JSONSchema,
  }[],
  
  // Subscriptions
  subscriptions: {
    eventName: string,
    subscriberService: string,
    endpoint: string,
    retryPolicy: {
      maxRetries: number,
      backoffMultiplier: number,
    },
  }[],
  
  // Delivery
  deliveryGuarantee: 'at-most-once' | 'at-least-once' | 'exactly-once',
}
```

**Event Types:**
```typescript
interface A2AEvents {
  'gallery.created': {
    galleryId: string,
    name: string,
    createdBy: string,
    createdAt: Date,
  },
  
  'photo.uploaded': {
    photoId: string,
    galleryId: string,
    uploadedBy: string,
    uploadedAt: Date,
  },
  
  'booking.confirmed': {
    bookingId: string,
    clientId: string,
    serviceType: string,
    confirmedAt: Date,
  },
  
  'payment.received': {
    paymentId: string,
    bookingId: string,
    amount: number,
    receivedAt: Date,
  },
}
```

### A2A Rate Limiting

Control A2A request rates.

**Rate Limiting Configuration:**
```typescript
interface A2ARateLimiting {
  // Per service
  perService: {
    requestsPerMinute: number,
    requestsPerHour: number,
    burstLimit: number,
  },
  
  // Per endpoint
  perEndpoint: {
    requestsPerMinute: number,
    requestsPerHour: number,
  },
  
  // Throttling
  throttling: {
    enabled: boolean,
    strategy: 'token-bucket' | 'sliding-window',
  },
}
```

---

## Software Development Kit (SDK)

### SDK Overview

Official SDKs for popular programming languages.

**Supported Languages:**
- JavaScript/TypeScript
- Python
- Ruby
- PHP
- Go
- Java
- C#/.NET
- Swift (iOS)
- Kotlin (Android)

### SDK Installation

Install SDK via package manager.

**Installation Methods:**
```bash
# JavaScript/TypeScript
npm install @rawdrive/sdk
yarn add @rawdrive/sdk
pnpm add @rawdrive/sdk

# Python
pip install rawdrive-sdk

# Ruby
gem install rawdrive

# PHP
composer require rawdrive/sdk

# Go
go get github.com/rawdrive/sdk-go

# Java
# Add to pom.xml or build.gradle

# C#/.NET
dotnet add package RawDrive.SDK

# Swift
# Add to Package.swift

# Kotlin
# Add to build.gradle
```

### SDK Features

Core SDK features.

**SDK Capabilities:**
```typescript
interface SDKFeatures {
  // Authentication
  authentication: {
    apiKey: true,
    oauth: true,
    sessionToken: true,
  },
  
  // Resource Management
  resources: {
    galleries: true,
    photos: true,
    albums: true,
    clients: true,
    bookings: true,
  },
  
  // Operations
  operations: {
    crud: true,
    batch: true,
    search: true,
    filter: true,
    sort: true,
  },
  
  // Advanced
  advanced: {
    streaming: true,
    pagination: true,
    caching: true,
    retryLogic: true,
    errorHandling: true,
  },
}
```

### SDK Usage Examples

Common SDK usage patterns.

**JavaScript/TypeScript Example:**
```typescript
import { RawDrive } from '@rawdrive/sdk';

// Initialize
const client = new RawDrive({
  apiKey: 'sk_live_...',
});

// List galleries
const galleries = await client.galleries.list({
  page: 1,
  limit: 10,
});

// Get gallery
const gallery = await client.galleries.get('gal_123456');

// Create gallery
const newGallery = await client.galleries.create({
  name: 'Wedding Photos',
  description: 'John & Jane Wedding',
});

// Upload photo
const photo = await client.photos.upload('gal_123456', {
  file: fileBuffer,
  title: 'First Dance',
});

// Analyze photo
const analysis = await client.photos.analyze('photo_123456', {
  analysisType: 'full',
});

// Create booking
const booking = await client.bookings.create({
  clientName: 'John Doe',
  clientEmail: 'john@example.com',
  serviceType: 'wedding',
  requestedDate: '2025-06-15',
});
```

**Python Example:**
```python
from rawdrive import RawDrive

# Initialize
client = RawDrive(api_key='sk_live_...')

# List galleries
galleries = client.galleries.list(page=1, limit=10)

# Get gallery
gallery = client.galleries.get('gal_123456')

# Create gallery
new_gallery = client.galleries.create(
    name='Wedding Photos',
    description='John & Jane Wedding'
)

# Upload photo
photo = client.photos.upload(
    'gal_123456',
    file=open('photo.jpg', 'rb'),
    title='First Dance'
)

# Analyze photo
analysis = client.photos.analyze(
    'photo_123456',
    analysis_type='full'
)

# Create booking
booking = client.bookings.create(
    client_name='John Doe',
    client_email='john@example.com',
    service_type='wedding',
    requested_date='2025-06-15'
)
```

### SDK Error Handling

Handle errors gracefully.

**Error Types:**
```typescript
interface SDKErrors {
  // Authentication
  AuthenticationError: {
    message: string,
    code: 'INVALID_API_KEY' | 'EXPIRED_TOKEN' | 'UNAUTHORIZED',
  },
  
  // Validation
  ValidationError: {
    message: string,
    code: 'INVALID_REQUEST',
    details: Record<string, string>,
  },
  
  // Not Found
  NotFoundError: {
    message: string,
    code: 'NOT_FOUND',
    resourceId: string,
  },
  
  // Rate Limit
  RateLimitError: {
    message: string,
    code: 'RATE_LIMITED',
    retryAfter: number,
  },
  
  // Server
  ServerError: {
    message: string,
    code: 'INTERNAL_SERVER_ERROR',
    requestId: string,
  },
}
```

**Error Handling Example:**
```typescript
try {
  const gallery = await client.galleries.get('gal_123456');
} catch (error) {
  if (error instanceof RawDrive.NotFoundError) {
    console.error('Gallery not found');
  } else if (error instanceof RawDrive.AuthenticationError) {
    console.error('Authentication failed');
  } else if (error instanceof RawDrive.RateLimitError) {
    console.error(`Rate limited, retry after ${error.retryAfter}s`);
  } else {
    console.error('Unknown error:', error);
  }
}
```

### SDK Pagination

Handle paginated results.

**Pagination Example:**
```typescript
// Manual pagination
let page = 1;
let hasMore = true;

while (hasMore) {
  const result = await client.galleries.list({
    page: page,
    limit: 50,
  });
  
  // Process results
  result.galleries.forEach(gallery => {
    console.log(gallery.name);
  });
  
  hasMore = result.page < result.totalPages;
  page++;
}

// Iterator pattern
for await (const gallery of client.galleries.iterate()) {
  console.log(gallery.name);
}
```

### SDK Caching

Cache responses for performance.

**Caching Configuration:**
```typescript
const client = new RawDrive({
  apiKey: 'sk_live_...',
  cache: {
    enabled: true,
    ttl: 300, // 5 minutes
    maxSize: 100, // Max cached items
  },
});
```

---

## Application Development Kit (ADK)

### ADK Overview

Complete toolkit for building RawDrive applications.

**ADK Components:**
- UI components library
- State management
- API client
- Authentication helpers
- Styling system
- Testing utilities
- Documentation

### ADK Installation

Install ADK for your framework.

**Framework Support:**
```bash
# React
npm install @rawdrive/adk-react

# Vue
npm install @rawdrive/adk-vue

# Angular
npm install @rawdrive/adk-angular

# Svelte
npm install @rawdrive/adk-svelte

# Next.js
npm install @rawdrive/adk-next

# Nuxt
npm install @rawdrive/adk-nuxt
```

### ADK Components

Pre-built UI components.

**Available Components:**
```typescript
interface ADKComponents {
  // Gallery
  GalleryGrid: React.FC<GalleryGridProps>,
  GalleryCarousel: React.FC<GalleryCarouselProps>,
  PhotoViewer: React.FC<PhotoViewerProps>,
  
  // Booking
  BookingWidget: React.FC<BookingWidgetProps>,
  BookingCalendar: React.FC<BookingCalendarProps>,
  BookingForm: React.FC<BookingFormProps>,
  
  // Client
  ClientPortal: React.FC<ClientPortalProps>,
  ClientGalleryView: React.FC<ClientGalleryViewProps>,
  
  // Album
  AlbumDesigner: React.FC<AlbumDesignerProps>,
  AlbumPreview: React.FC<AlbumPreviewProps>,
  
  // Profile
  PhotographerProfile: React.FC<PhotographerProfileProps>,
  PublicProfile: React.FC<PublicProfileProps>,
  
  // Forms
  LoginForm: React.FC<LoginFormProps>,
  RegistrationForm: React.FC<RegistrationFormProps>,
  GalleryForm: React.FC<GalleryFormProps>,
}
```

### ADK Hooks

React hooks for common operations.

**Available Hooks:**
```typescript
interface ADKHooks {
  // Authentication
  useAuth: () => AuthContext,
  useLogin: () => LoginHook,
  useLogout: () => LogoutHook,
  
  // Galleries
  useGalleries: (options?: GalleryOptions) => GalleriesHook,
  useGallery: (id: string) => GalleryHook,
  useCreateGallery: () => CreateGalleryHook,
  
  // Photos
  usePhotos: (galleryId: string) => PhotosHook,
  usePhoto: (id: string) => PhotoHook,
  useUploadPhoto: () => UploadPhotoHook,
  
  // Bookings
  useBookings: () => BookingsHook,
  useCreateBooking: () => CreateBookingHook,
  
  // User
  useUser: () => UserHook,
  useProfile: () => ProfileHook,
}
```

**Hook Usage Example:**
```typescript
import { useGalleries, useCreateGallery } from '@rawdrive/adk-react';

function MyComponent() {
  const { galleries, loading, error } = useGalleries();
  const { createGallery, creating } = useCreateGallery();
  
  const handleCreate = async () => {
    await createGallery({
      name: 'New Gallery',
      description: 'My new gallery',
    });
  };
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      {galleries.map(gallery => (
        <div key={gallery.id}>{gallery.name}</div>
      ))}
      <button onClick={handleCreate} disabled={creating}>
        Create Gallery
      </button>
    </div>
  );
}
```

### ADK State Management

Built-in state management.

**State Management Options:**
```typescript
interface ADKStateManagement {
  // Redux
  redux: {
    store: Store,
    reducers: Record<string, Reducer>,
    actions: Record<string, ActionCreator>,
  },
  
  // Zustand
  zustand: {
    store: Store,
    hooks: Record<string, Hook>,
  },
  
  // Context API
  contextAPI: {
    providers: Record<string, Provider>,
    hooks: Record<string, Hook>,
  },
}
```

### ADK Styling

Styling system and theming.

**Styling Options:**
```typescript
interface ADKStyling {
  // CSS Modules
  cssModules: true,
  
  // Tailwind CSS
  tailwind: true,
  
  // Styled Components
  styledComponents: true,
  
  // CSS-in-JS
  cssInJS: true,
  
  // Theming
  theming: {
    light: Theme,
    dark: Theme,
    custom: Theme,
  },
}
```

### ADK Testing

Testing utilities and helpers.

**Testing Features:**
```typescript
interface ADKTesting {
  // Mocking
  mockClient: () => MockClient,
  mockGalleries: () => Gallery[],
  mockPhotos: () => Photo[],
  
  // Rendering
  renderWithProviders: (component: React.ReactNode) => RenderResult,
  
  // Assertions
  expectGalleryToBeVisible: (gallery: Gallery) => void,
  expectPhotoToBeLoaded: (photo: Photo) => void,
  
  // Utilities
  waitForLoadingToFinish: () => Promise<void>,
  fillGalleryForm: (data: GalleryData) => void,
}
```

### ADK Documentation

Comprehensive documentation.

**Documentation Includes:**
- Getting started guide
- Component API reference
- Hook reference
- Examples and tutorials
- Best practices
- Troubleshooting
- FAQ

---

## Integration Patterns

### MCP + SDK Integration

Combine MCP and SDK for powerful integrations.

**Pattern Example:**
```typescript
// Use MCP to get context
const mcpContext = await mcpClient.getResource('gallery://gal_123456');

// Use SDK to perform operations
const sdk = new RawDrive({ apiKey: 'sk_live_...' });
const gallery = await sdk.galleries.get(mcpContext.id);

// Process with AI
const analysis = await aiModel.analyze(gallery, mcpContext);
```

### A2A + SDK Integration

Use A2A for service communication with SDK.

**Pattern Example:**
```typescript
// Service A publishes event
await eventBus.publish('gallery.created', {
  galleryId: 'gal_123456',
  name: 'New Gallery',
});

// Service B subscribes and uses SDK
eventBus.subscribe('gallery.created', async (event) => {
  const sdk = new RawDrive({ apiKey: 'sk_live_...' });
  const gallery = await sdk.galleries.get(event.galleryId);
  // Process gallery
});
```

### ADK + API Integration

Build applications with ADK and API.

**Pattern Example:**
```typescript
// Use ADK components
<GalleryGrid galleries={galleries} />

// Use ADK hooks
const { galleries } = useGalleries();

// Use API directly for custom operations
const response = await fetch('/api/galleries', {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

---

## Best Practices

### SDK Best Practices

**Do's:**
- ✅ Use type-safe SDK methods
- ✅ Handle errors gracefully
- ✅ Implement retry logic
- ✅ Cache responses appropriately
- ✅ Use pagination for large datasets
- ✅ Monitor API usage
- ✅ Keep SDK updated

**Don'ts:**
- ❌ Don't hardcode API keys
- ❌ Don't ignore rate limits
- ❌ Don't make unnecessary requests
- ❌ Don't store sensitive data in logs
- ❌ Don't use deprecated methods
- ❌ Don't ignore error responses

### ADK Best Practices

**Do's:**
- ✅ Use pre-built components
- ✅ Leverage hooks for state
- ✅ Follow component composition patterns
- ✅ Use theming system
- ✅ Implement error boundaries
- ✅ Test components thoroughly
- ✅ Follow accessibility guidelines

**Don'ts:**
- ❌ Don't bypass component APIs
- ❌ Don't create duplicate components
- ❌ Don't hardcode styles
- ❌ Don't ignore accessibility
- ❌ Don't skip error handling
- ❌ Don't use deprecated components

### MCP Best Practices

**Do's:**
- ✅ Verify webhook signatures
- ✅ Implement proper error handling
- ✅ Use appropriate resource types
- ✅ Document custom tools
- ✅ Test with real data
- ✅ Monitor tool usage

**Don'ts:**
- ❌ Don't expose sensitive data
- ❌ Don't ignore authentication
- ❌ Don't create overly complex tools
- ❌ Don't skip validation
- ❌ Don't ignore rate limits

---

## Support and Resources

### Documentation

- SDK Documentation: https://docs.rawdrive.com/sdk
- ADK Documentation: https://docs.rawdrive.com/adk
- MCP Documentation: https://docs.rawdrive.com/mcp
- API Reference: https://api.rawdrive.com/docs

### Community

- GitHub: https://github.com/rawdrive
- Discord: https://discord.gg/rawdrive
- Forum: https://forum.rawdrive.com
- Stack Overflow: Tag `rawdrive`

### Support

- Email: support@rawdrive.com
- Chat: https://support.rawdrive.com
- Status: https://status.rawdrive.com

---

## Related Files

- `docs/Features/API_AND_INTEGRATIONS.md` - REST API documentation
- `docs/Features/AUTHENTICATION_AND_SECURITY.md` - Security guidelines
- `docs/TechnicalSpecs/developer_platform.json` - Developer platform technical spec (incl. MCP guidance)
- `services/mcp/` - MCP service (planned reference: FastAPI + FastMCP)
- `services/a2a/` - A2A implementation (planned)
- `sdk/` - SDK source code
- `adk/` - ADK source code

## Last Updated

2025-12-17
