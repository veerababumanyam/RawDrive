# CLAUDE.md - RawDrive AI Context

This file provides Claude Code with essential context about the RawDrive codebase. RawDrive is an enterprise SaaS professional photography management platform.

## Quick Reference

### Common Commands

```bash
# Development
npm run dev                    # Start frontend dev server (localhost:3000)
npm run dev:all               # Start frontend + backend concurrently
npm run dev:backend           # Start backend dev server (localhost:3001)

# Build & Verify
npm run build                 # Build both frontend and backend
npm run build:prod            # Verify + build (production-ready)
npm run lint                  # Lint all workspaces
npm run verify                # Run production readiness checks

# Database
cd backend && npm run db:migrate     # Run database migrations
cd backend && npm run db:seed        # Seed development data
cd backend && npm run db:setup-all   # Complete test data setup

# Testing
cd frontend && npm test              # Frontend tests (Vitest)
cd backend && npm test               # Backend tests (Vitest)
cd ai-service && pytest              # AI service tests (pytest)

# Docker (PostgreSQL + pgvector, Redis)
npm run docker:dev:up         # Start dev containers (required for local dev)
npm run docker:dev:down       # Stop dev containers
npm run docker:dev:logs       # View container logs

# Workers
cd backend && npm run workers  # Start background job workers
```

### Project Structure

```
RawDrive/
├── frontend/          # React 19 + Vite + TypeScript + TailwindCSS
├── backend/           # Express 5 + TypeScript + PostgreSQL
├── ai-service/        # Python FastAPI + AI/LLM integration + MCP
├── infrastructure/    # Docker, nginx, monitoring configs
├── docs/              # Documentation (SCREAMING_SNAKE_CASE.md)
└── .claude/           # Claude Code skills and agents
```

### Infrastructure (Docker)

- **PostgreSQL 16** with pgvector extension (vector similarity search)
- **Redis 7** for caching, sessions, rate limiting, and BullMQ job queues

Run `npm run docker:dev:up` before starting development.

### Key Files

| Purpose | Location |
|---------|----------|
| Frontend types | `frontend/src/types/types.ts` |
| API client | `frontend/src/services/apiService.ts` |
| Backend entry | `backend/src/index.ts` |
| Database config | `backend/src/config/database.ts` |
| Redis config | `backend/src/config/redis.ts` |
| Storage config | `backend/src/config/storage.ts` |
| Environment vars | `.env` (single source of truth) |
| API routes | `backend/src/routes/v1/` |
| Services | `backend/src/services/` |
| Upload service | `backend/src/services/UploadService.ts` |
| Storage service | `backend/src/services/StorageService.ts` |
| Technical specs | `docs/TechnicalSpecs/` |
| **UI Components** | `frontend/src/components/ui/` |
| **Layout Components** | `frontend/src/components/layout/` |
| **Custom Hooks** | `frontend/src/hooks/` |

## Design System (Centralized)

**IMPORTANT**: All UI styling MUST use the centralized design system. Never hardcode colors, fonts, or styles.

### Core Files

| Purpose | Location |
|---------|----------|
| CSS Variables & Tokens | `frontend/src/index.css` |
| Tailwind Config | `frontend/tailwind.config.js` |
| Tailwind Tokens Plugin | `frontend/tailwind.tokens.plugin.cjs` |
| UI Components | `frontend/src/components/ui/` |

### Color Tokens (Use CSS Variables)

```css
/* Primary - Blue/Cyan brand colors */
--color-primary: #2563EB;        /* Primary buttons, links */
--color-primary-hover: #1D4ED8;  /* Hover states */
--color-accent: #06B6D4;         /* Secondary buttons, highlights */
--color-accent-hover: #0891B2;   /* Accent hover */

/* Gold Premium */
--color-gold: #D4AF37;           /* Premium badges, highlights */
--color-gold-light: #F4E4B0;     /* Gold backgrounds */

/* Backgrounds */
--color-background: #F8FAFC;     /* Main app background */
--color-surface: #FFFFFF;        /* Cards, modals */
--color-surface-hover: #F1F5F9;  /* Interactive surface hover */

/* Text */
--color-text-primary: #0F172A;   /* Headings */
--color-text-secondary: #475569; /* Body text */
--color-text-tertiary: #64748B;  /* Muted text, placeholders */

/* Borders */
--color-border: #E2E8F0;         /* Dividers, input borders */
--color-border-focus: #2563EB;   /* Focus rings */

/* Status */
--color-success: #059669;
--color-warning: #B45309;
--color-error: #B91C1C;
--color-info: #0369A1;
```

### Glass Morphism

```css
/* Standard glass effect */
.glass {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Dark glass effect */
.glass-dark {
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Premium hero glass */
.hero-glass-premium {
  background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
```

### UI Components (Always Use These)

| Component | File | Usage |
|-----------|------|-------|
| `AppButton` | `ui/AppButton.tsx` | All buttons (variants: primary, secondary, outline, ghost, destructive) |
| `AppInput` | `ui/AppInput.tsx` | All text inputs |
| `AppCard` | `ui/AppCard.tsx` | Card containers |
| `AppBadge` | `ui/AppBadge.tsx` | Status badges |
| `DataTable` | `ui/DataTable.tsx` | Data tables |
| `PhotoGrid` | `ui/PhotoGrid.tsx` | Photo grids |
| `Toast` | `ui/Toast.tsx` | Notifications (via `useToast` hook) |

### Typography

```css
/* Font families */
--font-sans: 'Inter', system-ui, sans-serif;
--font-serif: 'Playfair Display', Georgia, serif;
--font-mono: 'Roboto Mono', monospace;
```

| Class | Size | Use Case |
|-------|------|----------|
| `text-xs` | 12px | Labels, captions |
| `text-sm` | 14px | Secondary text |
| `text-base` | 16px | Body text |
| `text-lg` | 18px | Emphasized text |
| `text-xl` | 20px | Card titles |
| `text-2xl` | 24px | Section headings |
| `text-3xl` | 30px | Page titles |

### Button Styles

```typescript
// Use AppButton with variants - NEVER create custom buttons
<AppButton variant="primary">Save</AppButton>
<AppButton variant="outline">Cancel</AppButton>
<AppButton variant="ghost" size="icon"><X /></AppButton>
<AppButton variant="destructive">Delete</AppButton>

// Gold premium button (CSS class)
<button className="btn-gold">Upgrade to Pro</button>
```

### Card Patterns

```typescript
// Standard card
<AppCard hoverable onClick={handleClick}>
  <AppCard.Header>Title</AppCard.Header>
  <AppCard.Content>Content</AppCard.Content>
</AppCard>

// Pricing card (CSS class)
<div className="pricing-card">...</div>
<div className="pricing-card-recommended">...</div>

// Feature card (CSS class)
<div className="feature-card">...</div>
```

### Gradients

```css
/* Text gradient */
.text-gradient { background: linear-gradient(135deg, var(--color-accent), var(--color-primary)); }

/* Gold text gradient */
.text-gradient-gold { background: linear-gradient(135deg, var(--color-gold), var(--color-gold-light)); }

/* Button gradients */
.btn-primary { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover)); }
.bg-accent-gradient { background: linear-gradient(135deg, var(--color-accent), var(--color-primary)); }
```

### Animations

```css
/* Use these animation classes */
.animate-fade-in-up      /* Fade in from bottom */
.animate-fade-in-down    /* Fade in from top */
.animate-scale-in        /* Scale in */
.animate-slide-in-bottom /* Slide up from bottom */
.animate-pulse-glow      /* Glowing pulse */
.animate-shimmer         /* Loading shimmer */
.animate-float           /* Floating effect */

/* Animation delays */
.delay-100 through .delay-800
```

### Dark Theme

- Uses `[data-theme="dark"]` attribute on `<html>`
- All CSS variables automatically switch
- Toggle with `useTheme` hook: `const { theme, toggleTheme } = useTheme();`

### Design System Rules

1. **NEVER hardcode colors** - Use CSS variables or Tailwind semantic classes
2. **NEVER create custom buttons/inputs** - Use `AppButton`, `AppInput`
3. **ALWAYS use design tokens** - `bg-surface`, `text-text-primary`, `border-border`
4. **ALWAYS support dark mode** - Test in both themes
5. **Use consistent spacing** - 4px base (p-1=4px, p-2=8px, p-4=16px)
6. **Use consistent border radius** - `rounded-card` (1rem), `rounded-button` (0.5rem)

## Accessibility (WCAG 2.1 AA)

**IMPORTANT**: All features MUST meet WCAG 2.1 Level AA standards.

### Contrast Requirements

| Element | Min Ratio | Notes |
|---------|-----------|-------|
| Normal text | 4.5:1 | Body text, labels |
| Large text (18px+) | 3:1 | Headings, bold 14px+ |
| UI components | 3:1 | Buttons, inputs, focus rings |
| Focus indicators | 3:1 | Must be visible on ALL interactive elements |

### Keyboard Navigation

```typescript
// ALL interactive elements must be keyboard accessible
// Support these keyboard patterns:

// Buttons, links
<button onKeyDown={(e) => e.key === 'Enter' && handleClick()}>

// Modals - trap focus and support Escape
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handleEscape);
  return () => document.removeEventListener('keydown', handleEscape);
}, []);

// Tab order must follow logical reading order
// No keyboard traps - users can always navigate away
```

### Screen Reader Support

```typescript
// Use semantic HTML
<button>Click me</button>          // NOT <div onClick={}>
<nav aria-label="Main">            // Landmark regions
<main id="main-content">
<aside aria-label="Sidebar">

// Proper heading hierarchy (no skipping levels)
<h1>Page Title</h1>
  <h2>Section</h2>
    <h3>Subsection</h3>

// Form labels - ALWAYS associate
<label htmlFor="email">Email</label>
<input id="email" type="email" aria-describedby="email-error" />
<span id="email-error" role="alert">Invalid email</span>

// Icon-only buttons need aria-label
<button aria-label="Close dialog"><X /></button>

// Images
<img src="photo.jpg" alt="Wedding ceremony at sunset" />  // Meaningful
<img src="decoration.svg" alt="" aria-hidden="true" />    // Decorative
```

### ARIA Patterns

```typescript
// Modals
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>

// Loading states
<button aria-busy={isLoading} disabled={isLoading}>
  {isLoading ? <Spinner /> : 'Submit'}
</button>

// Expandable sections
<button aria-expanded={isOpen} aria-controls="panel-1">
  Toggle
</button>
<div id="panel-1" hidden={!isOpen}>Content</div>

// Live regions for dynamic content
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// Form validation
<input
  aria-invalid={hasError}
  aria-describedby={hasError ? 'error-msg' : undefined}
/>
```

### Touch Targets (Mobile)

- **Minimum size**: 44x44 pixels for ALL interactive elements
- **Spacing**: At least 8px between touch targets
- Use `touch-target` class: `min-h-[44px] min-w-[44px]`

### Focus Styles

```css
/* ALWAYS use focus-visible, not just focus */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* NEVER use outline-none without replacement */
/* BAD:  outline-none */
/* GOOD: focus-visible:ring-2 focus-visible:ring-accent */
```

### Accessibility Testing Checklist

- [ ] Keyboard-only navigation works
- [ ] Screen reader announces all content correctly
- [ ] Color contrast meets 4.5:1 / 3:1 ratios
- [ ] Works at 200% browser zoom
- [ ] Touch targets are 44x44px minimum
- [ ] No content flashes more than 3 times/second
- [ ] Run Lighthouse accessibility audit (score 90+)

## SOC 2 Compliance & Security

### Data Protection Principles

```typescript
// 1. NEVER log PII
logger.info('User action', { userId: user.id });           // CORRECT
logger.info('User action', { email: user.email });         // WRONG

// 2. NEVER expose internal errors to clients
catch (error) {
  logger.error('Database error', { error, userId });
  res.status(500).json({ error: 'Internal server error' }); // Generic message
}

// 3. ALWAYS sanitize user input
import { z } from 'zod';
const sanitized = schema.parse(req.body);

// 4. ALWAYS use parameterized queries
await pool.query('SELECT * FROM users WHERE id = $1', [id]);  // CORRECT
await pool.query(`SELECT * FROM users WHERE id = ${id}`);     // SQL INJECTION!

// 5. ALWAYS encrypt sensitive data at rest
import { encrypt, decrypt } from '@/utils/encryption';
const encryptedApiKey = encrypt(apiKey);
```

### Audit Logging

```typescript
// Log security-relevant actions
await auditLog({
  workspaceId: req.user.workspaceId,
  userId: req.user.id,
  action: 'asset.delete',
  resourceType: 'asset',
  resourceId: assetId,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

// Required audit events:
// - Authentication (login, logout, failed attempts)
// - Authorization (permission denied)
// - Data access (read sensitive data)
// - Data modification (create, update, delete)
// - Admin actions (user management, settings changes)
```

### Security Headers

```typescript
// Enforced via helmet middleware
Content-Security-Policy: default-src 'self'; ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

### Rate Limiting

```typescript
// Applied to all endpoints
// API: 100 requests/minute
// Auth: 5 attempts/15 minutes
// Uploads: 1000/hour per workspace
// AI operations: 30/minute per workspace
```

## Error Handling

### Error Boundary (React)

```typescript
// Wrap major sections with error boundaries
import { ErrorBoundary } from '@/components/ErrorBoundary';

<ErrorBoundary fallback={<ErrorFallback />}>
  <GalleryView />
</ErrorBoundary>

// ErrorBoundary component pattern
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to monitoring service
    logger.error('React error boundary', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

### User-Friendly Error Messages

```typescript
// Map technical errors to user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
  'NETWORK_ERROR': 'Unable to connect. Please check your internet connection.',
  'UNAUTHORIZED': 'Your session has expired. Please log in again.',
  'FORBIDDEN': 'You don\'t have permission to perform this action.',
  'NOT_FOUND': 'The requested item could not be found.',
  'VALIDATION_ERROR': 'Please check your input and try again.',
  'UPLOAD_FAILED': 'Upload failed. Please try again or use a smaller file.',
  'RATE_LIMITED': 'Too many requests. Please wait a moment and try again.',
  'SERVER_ERROR': 'Something went wrong. Our team has been notified.',
};

// Show user-friendly message, log technical details
const handleError = (error: ApiError) => {
  const userMessage = ERROR_MESSAGES[error.code] || ERROR_MESSAGES.SERVER_ERROR;
  showToast(userMessage, 'error');
  logger.error('API error', { code: error.code, details: error.details });
};
```

### Form Validation Errors

```typescript
// Show inline errors with clear instructions
<AppInput
  label="Email"
  error={errors.email?.message}
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
/>
{errors.email && (
  <span id="email-error" role="alert" className="text-error text-sm">
    {errors.email.message}
  </span>
)}

// Error message guidelines:
// - Be specific: "Email must include @" not "Invalid email"
// - Be helpful: "Password must be 8+ characters with a number"
// - Be polite: No blame language ("you forgot" -> "please enter")
```

### API Error Response Format

```typescript
// Backend error response structure
interface ApiErrorResponse {
  error: string;           // Error type: 'ValidationError', 'NotFound', etc.
  message: string;         // User-friendly message
  details?: Array<{        // Field-specific errors (for validation)
    field: string;
    message: string;
  }>;
  requestId?: string;      // For support reference
}

// Example responses
res.status(400).json({
  error: 'ValidationError',
  message: 'Please correct the errors below',
  details: [
    { field: 'email', message: 'Invalid email format' },
    { field: 'password', message: 'Password too short' },
  ],
});

res.status(404).json({
  error: 'NotFound',
  message: 'Gallery not found or has been deleted',
});
```

### Loading & Empty States

```typescript
// Always show loading state
{isLoading && <Skeleton count={6} />}

// Always handle empty state
{!isLoading && items.length === 0 && (
  <EmptyState
    icon={<Camera />}
    title="No photos yet"
    description="Upload your first photo to get started"
    action={<AppButton onClick={onUpload}>Upload Photos</AppButton>}
  />
)}

// Always handle error state
{error && (
  <ErrorState
    title="Failed to load photos"
    description={error.message}
    action={<AppButton onClick={retry}>Try Again</AppButton>}
  />
)}
```

## UX Best Practices

### Hover States

```typescript
// All interactive elements need hover feedback
className="hover:bg-surface-hover transition-colors duration-150"

// Cards
className="hover:shadow-card-hover hover:border-accent transition-all"

// Buttons already have hover states via AppButton
// Links need underline or color change on hover
className="hover:text-accent hover:underline"
```

### Feedback & Confirmation

```typescript
// Confirm destructive actions
const handleDelete = async () => {
  const confirmed = await confirm({
    title: 'Delete Gallery?',
    message: 'This will permanently delete all photos. This cannot be undone.',
    confirmText: 'Delete',
    confirmVariant: 'destructive',
  });
  if (confirmed) await deleteGallery(id);
};

// Show success feedback
showToast('Gallery deleted successfully', 'success');

// Show progress for long operations
<ProgressBar value={uploadProgress} label={`Uploading ${current}/${total}`} />
```

### Disabled States

```typescript
// Always explain why something is disabled
<AppButton
  disabled={!canSubmit}
  title={!canSubmit ? 'Please fill all required fields' : undefined}
>
  Submit
</AppButton>

// Or use tooltip
<Tooltip content="Upgrade to Pro to access this feature">
  <AppButton disabled>Advanced Export</AppButton>
</Tooltip>
```

## Coding Principles

### SOLID Principles

1. **Single Responsibility**: One component/function = one job
2. **Open/Closed**: Extend via props/composition, don't modify
3. **Liskov Substitution**: Subtypes must be substitutable
4. **Interface Segregation**: Small, focused interfaces
5. **Dependency Inversion**: Depend on abstractions, not concretions

### DRY (Don't Repeat Yourself)

```typescript
// Extract repeated logic into hooks
const useGalleryActions = (galleryId: string) => {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const handleDelete = async () => { /* ... */ };
  const handleShare = async () => { /* ... */ };

  return { handleDelete, handleShare };
};

// Extract repeated UI into components
// If you copy-paste 3+ times, make a component
```

### KISS (Keep It Simple)

```typescript
// Prefer simple, readable code over clever code
// BAD: Clever but hard to read
const result = arr.reduce((a, c) => ({ ...a, [c.id]: c }), {});

// GOOD: Clear and maintainable
const result: Record<string, Item> = {};
for (const item of arr) {
  result[item.id] = item;
}
```

### Early Returns

```typescript
// Use early returns to reduce nesting
// BAD
const processUser = (user: User | null) => {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission) {
        return doSomething(user);
      }
    }
  }
  return null;
};

// GOOD
const processUser = (user: User | null) => {
  if (!user) return null;
  if (!user.isActive) return null;
  if (!user.hasPermission) return null;
  return doSomething(user);
};
```

## Code Style

### TypeScript/React

- Use `interface` for object shapes, `type` for unions/intersections
- Props interfaces: `ComponentNameProps`
- Services: Singleton pattern with `getInstance()`
- Imports: External -> Types -> Services -> Components
- Path alias: `@/*` maps to `./src/*`
- Max file length: 600 lines (components), 800 lines (services)

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `AlbumGrid.tsx` |
| TypeScript interfaces | PascalCase | `interface Album {}` |
| Services (TS) | PascalCase + Service | `AuthService.ts` |
| Services (Python) | snake_case | `face_recognition.py` |
| API routes | kebab-case | `/api/v1/photo-albums` |
| Database tables | snake_case | `user_roles` |
| Environment vars | SCREAMING_SNAKE_CASE | `JWT_SECRET` |

### Component Structure

```typescript
// 1. External imports
import React, { useState } from 'react';
import { Camera } from 'lucide-react';

// 2. Internal types
import type { Album } from '@/types/types';

// 3. Internal services/components
import { AppButton } from '@/components/ui/AppButton';

// 4. Props interface
interface AlbumGridProps {
  albums: Album[];
  onSelect: (album: Album) => void;
}

// 5. Component export
export const AlbumGrid: React.FC<AlbumGridProps> = ({ albums, onSelect }) => {
  // hooks -> handlers -> render
};
```

## Critical Architecture Rules

### Multi-Tenant Data Isolation (Workspace-Scoped)

**IMPORTANT**: Every database query MUST include `workspace_id` filtering. RawDrive uses workspace-based tenancy where all assets and data are partitioned by workspace.

```typescript
// CORRECT
const result = await pool.query(
  `SELECT * FROM assets WHERE workspace_id = $1 AND status != 'deleted'`,
  [req.user.workspaceId]
);

// WRONG - Never trust client-provided workspace_id
const result = await pool.query(
  `SELECT * FROM assets WHERE workspace_id = $1`,
  [req.body.workspaceId]  // SECURITY VULNERABILITY
);
```

### Object Storage Key Format

All storage objects MUST include workspace_id prefix:

```
workspaces/{workspace_id}/assets/{asset_id}/original/{filename}
workspaces/{workspace_id}/assets/{asset_id}/derived/{variant}/{filename}
```

### Authentication Flow

- Access tokens: 15min expiry (JWT)
- Refresh tokens: 7 day expiry (httpOnly cookie)
- 2FA: TOTP via speakeasy
- Password: bcrypt with 12 rounds

### Authorization (RBAC)

```typescript
// Use permission middleware
router.delete(
  '/galleries/:id',
  authenticate,
  requirePermission('gallery:delete'),
  galleryController.delete
);
```

### Input Validation

Always validate with Zod before processing:

```typescript
const schema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email(),
});
const result = schema.safeParse(req.body);
```

## Testing

### Test Commands

```bash
# Frontend (Vitest + React Testing Library)
cd frontend && npm test
cd frontend && npm run test:coverage

# Backend (Vitest + Supertest)
cd backend && npm test
cd backend && npm run test:integration

# AI Service (pytest)
cd ai-service && pytest
cd ai-service && pytest --cov=src
```

### Coverage Targets

| Area | Target |
|------|--------|
| Auth/Security | 95% |
| Payment/Billing | 95% |
| API Services | 85% |
| UI Components | 70% |

## Environment Variables

Required in `.env`:

```bash
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
JWT_SECRET=<64-byte-hex>
JWT_REFRESH_SECRET=<64-byte-hex>
ENCRYPTION_KEY=<32-byte-hex>

# Managed Storage (Cloudflare R2 - default)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=

# BYOS credentials stored encrypted in database
# Referenced via storage_profiles.credentials_ref
# Supports SSE-S3 and SSE-KMS encryption modes

# AI Service (configure provider via AI_PROVIDER env var)
AI_PROVIDER=                   # LLM provider (load from env, never hardcode)
AI_API_KEY=                    # API key (load from env, never hardcode)
AI_MODEL=                      # Model identifier (load from env, never hardcode)

# Optional: Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Common Patterns

### API Response Format

```typescript
// Success
res.json({ data: items, pagination: { total, page, limit } });

// Error
res.status(400).json({ error: 'Validation Error', details: [...] });
```

### Caching Pattern

```typescript
// Check cache first
const cached = await cacheGet<T>(`key:${id}`);
if (cached) return cached;

// Query and cache
const result = await pool.query(...);
await cacheSet(`key:${id}`, result.rows[0], 3600);
return result.rows[0];
```

### Background Jobs (BullMQ)

```typescript
// Add job
await assetQueue.add('process', { assetId, workspaceId }, { priority: 1 });

// Worker processes in backend/src/workers/

// Key job types:
// - asset.process: Generate thumbnails, extract EXIF, AI tagging
// - upload.verify_checksum: Verify SHA256 after upload commit
// - storage.lifecycle.transition: Move old assets to cheaper tier (daily)
```

### Domain Events

```typescript
// Events emitted by the system
// asset.created: { workspace_id, asset_id, library_id }
// asset.deleted: { workspace_id, asset_id }
// storage.byos_configured: { workspace_id, storage_profile_id }

// Listen for events to trigger downstream processing
eventBus.on('asset.created', async (event) => {
  await assetQueue.add('process', event);
});
```

## Face Detection Microservice

RawDrive uses a **dedicated face-worker microservice** for AI-powered face detection, separate from the main backend for scalability and resource isolation.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Production Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│  Backend (FastAPI)              Face Worker (Microservice)       │
│  ┌───────────────────┐         ┌───────────────────────┐        │
│  │ DISABLE_FACE_     │         │ Dockerfile.worker     │        │
│  │ WORKER=true       │         │ Port: 8001            │        │
│  │ Port: 8000        │         │ CPU: 1.0, Mem: 1G     │        │
│  └─────────┬─────────┘         └──────────┬────────────┘        │
│            │                              │                      │
│            └──────────┬───────────────────┘                      │
│                       ▼                                          │
│              ┌─────────────────┐                                 │
│              │  PostgreSQL     │ ← face_detection_jobs table     │
│              │  (Job Queue)    │   (polling-based queue)         │
│              └─────────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files

| Purpose | Location |
|---------|----------|
| Worker Entrypoint | `backend/src/app/face_worker_main.py` |
| Worker Dockerfile | `backend/Dockerfile.worker` |
| Face Detection Worker | `backend/src/app/services/face_detection_worker.py` |
| Cloud Vision Provider | `backend/src/app/services/ai_providers/cloud_vision_provider.py` |
| Gemini Provider (fallback) | `backend/src/app/services/ai_providers/gemini_provider.py` |
| Face Group API | `backend/src/app/api/v1/face_groups.py` |
| Face Repository | `backend/src/app/repositories/face_repository.py` |
| Face Group Repository | `backend/src/app/repositories/face_group_repository.py` |
| Technical Spec | `docs/TechnicalSpecs/face_detection_service.json` |

### Deployment Modes

| Mode | Backend Setting | Face Processing |
|------|-----------------|-----------------|
| **Production** | `DISABLE_FACE_WORKER=true` | Separate face-worker container |
| **Development** | `DISABLE_FACE_WORKER=false` | Embedded in backend process |

### AI Provider Failover

The service uses a multi-provider strategy with automatic failover:

```python
# Provider priority (circuit breaker pattern):
# 1. Cloud Vision (primary) - High accuracy, 99%+ confidence
# 2. Gemini (fallback) - Good accuracy, slightly lower
# 3. Local DeepFace (last resort) - CPU-based, slower

# Providers auto-recover after 60 seconds of failures
```

### Job Queue (PostgreSQL Polling)

```python
# Jobs stored in face_detection_jobs table
# Worker polls every 5 seconds, batch size 10
# States: pending → processing → completed/failed

# Trigger face detection for an asset:
await face_service.queue_detection(workspace_id, asset_id)
```

### Docker Configuration

```yaml
# infrastructure/docker/docker-compose.yml
face-worker:
  build:
    context: ../../backend
    dockerfile: Dockerfile.worker
  container_name: rawdrive-face-worker
  environment:
    DATABASE_URL: postgresql+asyncpg://rawdrive:rawdrive@postgres:5432/rawdrive
    REDIS_URL: redis://redis:6379/0
    DB_POOL_MIN_SIZE: 1
    DB_POOL_MAX_SIZE: 5
  expose:
    - "8001"  # Health endpoints
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 1G
```

### Health Endpoints

```bash
# Face worker health check
curl http://localhost:8001/health   # Basic health
curl http://localhost:8001/ready    # Ready status with stats
```

### Environment Variables

```bash
# In .env for production:
DISABLE_FACE_WORKER=true  # Backend won't start embedded worker

# Cloud Vision credentials
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# Or set via google.cloud.vision client configuration
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces/{id}/face-groups` | GET | List face groups |
| `/v1/workspaces/{id}/face-groups/{id}` | GET | Get face group details |
| `/v1/workspaces/{id}/face-groups/{id}` | PATCH | Update name/hidden status |
| `/v1/workspaces/{id}/face-groups/merge` | POST | Merge multiple groups |
| `/v1/workspaces/{id}/face-groups/{id}/split` | POST | Split faces from group |
| `/v1/galleries/{id}/face-groups/stats` | GET | Gallery face statistics |

### Face Clustering

```python
# Faces are clustered using 512-dim embeddings:
# - pgvector for vector similarity search
# - HDBSCAN algorithm for automatic clustering
# - Configurable similarity threshold (default: 0.6)
# - Manual merge/split operations supported
```

## Smart Tagging Layer

RawDrive includes a **Smart Tagging Layer** that caches AI-generated tags and provides instant search across galleries without repeated AI calls.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Smart Tagging Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│  Photo Upload → Content Detection Worker → AI Provider          │
│       ↓                    ↓                    ↓                │
│  gallery_assets      content_jobs         Cloud Vision/Gemini   │
│       ↓                    ↓                    ↓                │
│  Asset Analysis ←──── Tag Creation ←────── Labels/Objects       │
│       ↓                    ↓                                     │
│  asset_analysis       asset_tags (with source tracking)         │
│       ↓                    ↓                                     │
│  Health Dashboard     Instant Search                             │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Instant AI-Powered Search** - Search by AI-detected labels, objects, and scenes
2. **Face Naming & Person Search** - Name face groups and search by person
3. **Incremental Gallery Addition** - Auto-tag new photos, skip duplicates via SHA256
4. **Manual Tag Complement** - Add manual tags alongside AI tags
5. **Re-Analysis** - Clear AI tags and re-analyze with fresh AI calls
6. **Tagging Health Dashboard** - Monitor AI tagging completion across galleries

### Key Files

| Purpose | Location |
|---------|----------|
| Content Detection Service | `backend/src/app/services/content_detection_service.py` |
| Tagging Health Service | `backend/src/app/services/tagging_health_service.py` |
| Tag Service | `backend/src/app/services/tag_service.py` |
| Asset Analysis Repository | `backend/src/app/repositories/asset_analysis_repository.py` |
| Content Job Repository | `backend/src/app/repositories/content_job_repository.py` |
| Smart Tagging API | `backend/src/app/api/v1/smart_tagging.py` |
| Gallery Search Bar | `frontend/src/components/features/gallery/GallerySearchBar.tsx` |
| Asset Tag Panel | `frontend/src/components/features/gallery/AssetTagPanel.tsx` |
| Tagging Health Badge | `frontend/src/components/features/gallery/TaggingHealthBadge.tsx` |
| AI Settings Panel | `frontend/src/components/features/gallery/AISettings.tsx` |

### Database Tables

| Table | Purpose |
|-------|---------|
| `asset_analysis` | Tracks analysis status per asset (pending, processing, completed, failed) |
| `content_detection_jobs` | Job queue for content detection (PostgreSQL polling) |
| `asset_tags` | Junction table with `source` column (manual, ai_vision, ai_gemini, ai_local) |
| `tags` | Tag dictionary with workspace scope |
| `gallery_tagging_stats` | Materialized view for health dashboard (refreshed every 5 min) |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces/{id}/smart-tagging/queue` | POST | Queue assets for AI detection |
| `/v1/workspaces/{id}/smart-tagging/status/{asset_id}` | GET | Get analysis status |
| `/v1/workspaces/{id}/smart-tagging/assets/{id}/reanalyze` | POST | Clear tags and re-analyze |
| `/v1/workspaces/{id}/smart-tagging/assets/reanalyze/bulk` | POST | Bulk re-analyze |
| `/v1/workspaces/{id}/galleries/{id}/tagging-health` | GET | Gallery tagging health |
| `/v1/workspaces/{id}/tagging-health` | GET | Workspace-wide health |
| `/v1/workspaces/{id}/galleries/{id}/filter` | GET | Filter gallery assets by tags/people |
| `/v1/workspaces/{id}/assets/{id}/tags` | GET | Get asset tags |
| `/v1/workspaces/{id}/assets/{id}/tags` | POST | Add manual tag |
| `/v1/workspaces/{id}/assets/{id}/tags/{tag_id}` | DELETE | Remove tag |

### Gallery Assets Filtering

The gallery assets endpoint supports filtering by tags and people:

```typescript
// Filter by AI tags
GET /v1/workspaces/{id}/galleries/{id}/assets?tag_ids=uuid1,uuid2&tag_source=ai_vision

// Filter by people
GET /v1/workspaces/{id}/galleries/{id}/assets?face_group_ids=uuid1,uuid2

// Combined filters
GET /v1/workspaces/{id}/galleries/{id}/assets?tag_ids=uuid1&face_group_ids=uuid2&search_query=sunset
```

### Tag Sources

| Source | Description |
|--------|-------------|
| `manual` | User-added tags |
| `ai_vision` | Cloud Vision API labels |
| `ai_gemini` | Gemini model labels |
| `ai_local` | Local model (DeepFace) |

### Health Dashboard

The health dashboard uses a materialized view refreshed every 5 minutes:

```sql
-- gallery_tagging_stats materialized view
SELECT gallery_id, workspace_id,
       total_assets, tagged_assets, pending_assets,
       processing_assets, failed_assets, skipped_assets
FROM gallery_tagging_stats
WHERE workspace_id = $1;

-- Manual refresh
SELECT refresh_gallery_tagging_stats();
```

### Frontend Search Integration

The `GallerySearchBar` component provides unified search with tag and person autocomplete:

```typescript
// Use # prefix for tag search
#sunset     // Shows tag suggestions matching "sunset"

// Use @ prefix for person search
@john       // Shows people matching "john"

// Regular text searches filenames
beach       // Filters by filename containing "beach"
```

## Admin Microservice

RawDrive uses a **dedicated admin microservice** for platform administration functionality, separated from the main backend to provide better security isolation, independent scaling, and clear domain boundaries for admin operations.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Production Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│  Backend (FastAPI)              Admin Microservice (FastAPI)     │
│  ┌───────────────────┐         ┌───────────────────────┐        │
│  │ Port: 8000        │         │ Port: 8002            │        │
│  │ (Main API)        │         │ (Admin API)           │        │
│  └─────────┬─────────┘         └──────────┬────────────┘        │
│            │                              │                      │
│            └──────────┬───────────────────┘                      │
│                       ▼                                          │
│              ┌─────────────────┐                                 │
│              │  PostgreSQL     │ ← admin_* tables (shared)       │
│              │  + Redis        │   (separate schema isolation)   │
│              └─────────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Service Domains

The Admin Microservice owns these functional domains:

1. **Platform Admin Management** - Admin identity, roles, permissions, invites
2. **Support Access** - Time-boxed, audited workspace access for customer support
3. **Subscription & Billing** - Admin view and modifications (MRR, refunds, credits)
4. **System Monitoring** - Health metrics, performance dashboards, alerting
5. **Analytics** - Usage, revenue, and feature adoption metrics
6. **Content Moderation** - Flagged content queue and enforcement actions
7. **Audit Logging** - Immutable action logs and compliance reporting
8. **Feature Flags** - Rollout control, A/B testing, targeting
9. **Platform Configuration** - Settings for AI, email, payments, and platform behavior

### Key Files

| Purpose | Location |
|---------|----------|
| Admin Microservice Spec | `specs/001-admin-microservice/spec.md` |
| Admin Microservice Plan | `specs/001-admin-microservice/plan.md` |
| Admin Documentation | `docs/admin-microservice/` |
| Current Admin API | `backend/src/app/api/v1/admin.py` |
| Admin Features | `docs/Features/ADMIN_AND_PLATFORM_MANAGEMENT.md` |

### Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| Specification | Complete | Feature spec created and validated |
| Planning | Complete | Implementation tasks and architecture design |
| Development | Planned | Microservice implementation pending |

### Communication Patterns

- **Internal APIs**: RESTful communication between main backend and admin service
- **Shared Database**: PostgreSQL with `admin_*` table prefix for isolation
- **Redis Pub/Sub**: Event-driven communication for real-time updates
- **JWT Authentication**: Shared authentication tokens for seamless integration

## Performance Optimization

### Frontend Performance

```typescript
// Lazy load routes and heavy components
const GalleryView = lazy(() => import('@/pages/GalleryView'));

// Memoize expensive computations
const sortedPhotos = useMemo(() =>
  photos.sort((a, b) => b.createdAt - a.createdAt),
  [photos]
);

// Memoize callbacks passed to children
const handleSelect = useCallback((id: string) => {
  setSelected(prev => [...prev, id]);
}, []);

// Use React.memo for pure components
export const PhotoCard = memo(({ photo, onSelect }: PhotoCardProps) => {
  // ...
});

// Virtual scrolling for large lists (1000+ items)
import { VirtualPhotoGrid } from '@/components/ui/VirtualPhotoGrid';
```

### Image Optimization

```typescript
// Always use responsive images with srcSet
<img
  src={photo.thumbnailUrl}
  srcSet={`${photo.smallUrl} 400w, ${photo.mediumUrl} 800w, ${photo.largeUrl} 1200w`}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  loading="lazy"
  decoding="async"
  alt={photo.description}
/>

// Use WebP format with fallback
// Backend generates WebP versions automatically
```

### Database Performance

```typescript
// Always use indexes for filtered columns
// Key indexes:
// - assets: workspace_id+created_at, workspace_id+sha256, workspace_id+folder_id
// - upload_sessions: workspace_id+state, expires_at
// - storage_profiles: workspace_id (unique)

// Use cursor-based pagination for large datasets
const result = await pool.query(`
  SELECT * FROM assets
  WHERE workspace_id = $1 AND status = 'available'
  ORDER BY created_at DESC
  LIMIT $2
`, [workspaceId, limit]);

// Return next_cursor for pagination
// Avoid N+1 queries - use JOINs or batch fetching
// BAD: Fetching user for each asset in a loop
// GOOD: Single query with JOIN or batch user fetch
```

## Internationalization (i18n)

```typescript
// Use i18next for all user-facing text
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

// In components
<h1>{t('gallery.title')}</h1>
<p>{t('gallery.photoCount', { count: photos.length })}</p>

// Translation files: backend/src/locales/{en,es,fr,de,...}.json
// NEVER hardcode user-facing strings
```

## Git Workflow

### Branch Naming

```bash
feature/add-album-sharing      # New features
fix/photo-upload-timeout       # Bug fixes
refactor/gallery-service       # Code improvements
docs/api-documentation         # Documentation
chore/update-dependencies      # Maintenance
```

### Commit Messages

```bash
# Format: type(scope): description
feat(gallery): add bulk photo selection
fix(upload): handle timeout on large files
refactor(auth): extract token validation to middleware
docs(api): add gallery endpoints documentation
test(photos): add integration tests for upload flow
chore(deps): update React to v19.1

# Include ticket number if applicable
feat(gallery): add sharing feature [RAW-123]
```

### PR Guidelines

- Keep PRs focused (single feature/fix)
- Include tests for new functionality
- Update documentation if API changes
- Request review from code owners
- Squash commits before merge

## Code Review Checklist

Before submitting PR:

- [ ] Code follows project style guide
- [ ] No hardcoded colors/strings (use tokens/i18n)
- [ ] No hardcoded API keys, secrets, LLM providers, or model names
- [ ] All secrets loaded from environment variables
- [ ] All interactive elements have hover/focus states
- [ ] Error states handled with user-friendly messages
- [ ] Loading states shown during async operations
- [ ] Empty states designed for zero-data scenarios
- [ ] Accessibility: keyboard nav, ARIA, contrast
- [ ] Security: input validation, workspace isolation
- [ ] Tests added/updated
- [ ] No console.log statements left
- [ ] No commented-out code
- [ ] TypeScript strict mode passes

## Debugging Tips

### Frontend

```typescript
// React Query DevTools (dev only)
// Already configured - press Ctrl+Shift+D

// Check component renders
useEffect(() => {
  console.log('Component rendered', { props });
});

// Debug React state
import { useDebugValue } from 'react';
useDebugValue(state, s => `State: ${JSON.stringify(s)}`);
```

### Backend

```typescript
// Use pino logger with context
logger.info({ userId, galleryId, action: 'create' }, 'Gallery created');

// Debug database queries (dev only)
// Set DEBUG=knex:query in .env

// Check Redis cache
redis-cli MONITOR  # Watch all Redis commands
redis-cli KEYS "gallery:*"  # List cache keys
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 on API calls | Token expired | Check refresh token flow |
| CORS errors | Missing headers | Verify backend CORS config |
| Slow queries | Missing index | Add index, check EXPLAIN |
| Memory leak | Uncleared subscriptions | Clean up in useEffect return |
| Hydration mismatch | Server/client differ | Check SSR-safe code |

## Warnings & Gotchas

### Security - Never Hardcode

- **Never** hardcode API keys, secrets, or credentials in code
- **Never** hardcode LLM provider names or model identifiers - use environment variables
- **Never** expose API keys in frontend code - proxy through backend
- **Never** log PII (emails, names, phone numbers) - log user IDs only
- **Never** commit `.env` files or any file containing secrets

### Required Practices

- **Always** load secrets from environment variables (`process.env.AI_API_KEY`)
- **Always** use parameterized queries - never string concatenation
- **Always** include workspace_id in database queries
- **Always** include workspace_id prefix in storage object keys
- **Always** validate file uploads (MIME type, magic bytes, size, checksum)
- **Always** handle promise rejections (use try/catch or .catch())
- **Always** clean up subscriptions/timers in useEffect cleanup

### Configuration Notes

- LLM providers/models configured via `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` env vars
- Presigned URLs expire in 1 hour by default (R2 and BYOS)
- Upload sessions expire if not committed (check `expires_at`)
- Frontend dev server runs on port 3000, backend on 3001
- Database migrations are in `backend/src/db/migrations/` (numbered SQL files)
- WebSocket connections require authentication header
- File uploads max 100MB per file, 500MB per batch
- BYOS credentials must be encrypted at rest and rotated periodically
- Deletion must respect retention policies (see retention_customer_removal feature)

## Skills & Agents

Claude Code has access to specialized skills in `.claude/skills/`:

- `project-structure` - Codebase layout and conventions
- `testing` - Test patterns and coverage requirements
- `security` - Auth, RBAC, encryption, GDPR compliance
- `performance` - Caching, optimization, scaling
- `accessibility` - WCAG compliance, ARIA patterns
- `design-system` - UI components and theming
- `saas-practices` - Multi-tenancy, billing, onboarding
- `ai-mcp-integration` - AI features and MCP tools

## Storage & Ingestion

RawDrive supports **Managed Storage** (Cloudflare R2) and **BYOS** (Bring Your Own Storage - S3-compatible).

### Storage Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `managed_r2` | Cloudflare R2 (default) | Standard workspaces |
| `byos_s3` | Customer S3-compatible bucket | Enterprise governance |

### Storage Profile Configuration

```typescript
// Workspace admin configures BYOS
interface StorageProfile {
  storage_profile_id: string;
  workspace_id: string;
  mode: 'managed_r2' | 'byos_s3';
  bucket: string;
  endpoint?: string;        // Custom S3 endpoint for BYOS
  region?: string;
  key_prefix: string;       // Must include workspace_id
  credentials_ref: string;  // Reference to encrypted secret store
  encryption: 'none' | 'sse_s3' | 'sse_kms';
}
```

### Supported Formats

| Type | Extensions | Max Size |
|------|------------|----------|
| Photos | jpg, jpeg, png, webp, heic, heif, raw, cr2, nef, arw | 100MB |
| Videos | mp4, mov, avi, mkv | 500MB |
| Documents | pdf | 50MB |

### Resumable Upload Flow

RawDrive uses resumable uploads (TUS or S3 multipart) for reliable large file uploads:

```typescript
// 1. Create upload session
const session = await api.post(`/v1/workspaces/${workspaceId}/uploads`, {
  file_name: file.name,
  mime_type: file.type,
  size_bytes: file.size,
  sha256: await computeSha256(file),  // Optional, can provide at commit
  library_id: libraryId,
  folder_id: folderId,                // Optional
  resumable_protocol: 'tus',          // or 's3_multipart'
});

// Response: { upload_id, provider, upload_url, headers, expires_at }

// 2. Upload directly to storage (not through backend)
// Using TUS protocol for resumability
await tusClient.upload(file, {
  endpoint: session.upload_url,
  headers: session.headers,
  onProgress: (bytesUploaded, bytesTotal) => {
    setProgress((bytesUploaded / bytesTotal) * 100);
  },
});

// 3. Commit upload with checksum verification
const result = await api.post(
  `/v1/workspaces/${workspaceId}/uploads/${session.upload_id}/commit`,
  { sha256: checksum, etag: etag }
);

// Response: { asset_id, status: 'available' | 'processing' }

// 4. Backend emits asset.created event; enqueues processing jobs
```

### Upload Session States

| State | Description |
|-------|-------------|
| `created` | Session initialized, awaiting upload |
| `uploading` | Client actively uploading bytes |
| `verifying` | Server verifying checksum |
| `committed` | Upload complete, asset created |
| `aborted` | Client or server cancelled |
| `expired` | Session timed out |

### Asset Model

```typescript
interface Asset {
  asset_id: string;
  workspace_id: string;
  library_id: string;
  folder_id?: string;
  type: 'photo' | 'video';
  original_object_key: string;
  original_bytes: number;
  sha256: string;
  mime_type: string;
  exif?: Record<string, unknown>;
  status: 'uploading' | 'available' | 'processing' | 'failed' | 'deleted';
  created_by_user_id: string;
  created_at: Date;
}
```

### Validation

```typescript
// Frontend validation (before upload)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

if (!ALLOWED_TYPES.includes(file.type)) {
  showToast('Unsupported file type', 'error');
  return;
}

if (file.size > MAX_SIZE) {
  showToast('File too large. Maximum 100MB', 'error');
  return;
}

// Backend validation:
// - Magic bytes check in worker
// - Checksum verification on commit
// - Optional virus/malware scanning per workspace
```

### BYOS Security Requirements

```typescript
// BYOS credentials must have minimum IAM permissions:
// - s3:ListBucket (on bucket)
// - s3:GetObject, s3:PutObject, s3:DeleteObject (on prefix/*)
// - No wildcard beyond workspace prefix
// - Credentials encrypted at rest with rotation support

// System validates BYOS at setup:
// 1. ListBucket - verify access
// 2. PutObject/GetObject/DeleteObject on test key
// 3. Store encrypted credentials
// 4. Persist StorageProfile
```

## API Versioning

- All endpoints prefixed with `/v1/` (e.g., `/v1/workspaces/{workspace_id}/assets`)
- Breaking changes require new version (`/v2/`)
- Deprecation notice 6 months before removal
- Include `X-API-Version` header in responses

## Real-Time Updates (WebSockets)

```typescript
// Frontend: Connect to WebSocket
import { useSocket } from '@/hooks/useSocket';

const { socket, isConnected } = useSocket();

// Listen for events
useEffect(() => {
  socket?.on('asset:created', (data) => {
    queryClient.invalidateQueries(['assets', libraryId]);
  });

  socket?.on('asset:processed', (data) => {
    // Update UI with thumbnails, AI metadata
  });

  socket?.on('upload:progress', (data) => {
    // Track upload progress for resumable uploads
  });
}, [socket]);

// Events emitted by backend:
// - asset:created, asset:processed, asset:deleted
// - upload:progress, upload:committed
// - library:updated, library:shared
// - storage:byos_configured
// - notification:new
```

## MCP (Model Context Protocol) Integration

RawDrive is **MCP-ready** with tools for AI agents to interact with photo data.

### MCP Server

```
ai-service/src/mcp/server.py  # FastMCP tool definitions
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `detect_faces` | Detect faces in photo, generate 512-dim embeddings |
| `cluster_people` | Group faces into people clusters via HDBSCAN |
| `semantic_search` | Natural language photo search using CLIP |
| `analyze_photo` | AI caption, tags, quality scoring via configured LLM |
| `auto_select` | Auto-curate best photos from gallery |

### Tool Definition Pattern

```python
@mcp_server.tool()
async def detect_faces(
    photo_id: Annotated[str, "Photo ID in the database"],
    workspace_id: Annotated[str, "Workspace ID for isolation"],
    detect_attributes: Annotated[bool, "Detect age/gender"] = True,
) -> dict:
    """
    Detect faces in a photo and generate embeddings.

    Use this tool to:
    - Find all faces before clustering
    - Get embeddings for similarity search
    - Analyze demographics
    """
    # Implementation...
```

### MCP Resources

```python
@mcp_server.resource("photo://{photo_id}")
async def get_photo_info(photo_id: str) -> str:
    """Get AI metadata for a photo."""

@mcp_server.resource("gallery://{gallery_id}/stats")
async def get_gallery_stats(gallery_id: str) -> str:
    """Get AI statistics for a gallery."""
```

## Agentic AI & A2A (Agent-to-Agent)

### Agent Architecture

```
User Request → Orchestrator Agent
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
Photo Agent    Search Agent    Curation Agent
    ↓               ↓               ↓
 MCP Tools      MCP Tools       MCP Tools
```

### Agent Workflow Example

```typescript
// Agentic photo processing workflow
const processGalleryWithAgents = async (galleryId: string) => {
  // 1. Analysis agent - caption & tag all photos
  const analysisTask = await orchestrator.dispatch({
    agent: 'photo-analyzer',
    action: 'batch_analyze',
    payload: { galleryId },
  });

  // 2. Face agent - detect & cluster people
  const faceTask = await orchestrator.dispatch({
    agent: 'face-processor',
    action: 'cluster_people',
    payload: { galleryId },
  });

  // 3. Curation agent - select best photos
  const curationTask = await orchestrator.dispatch({
    agent: 'curator',
    action: 'auto_select',
    payload: { galleryId, count: 50, preferPeople: true },
  });

  return await orchestrator.awaitAll([analysisTask, faceTask, curationTask]);
};
```

### A2A Communication

```python
# Agent-to-Agent message via Redis pub/sub
class AgentMessage(BaseModel):
    sender: str           # Agent ID
    recipient: str        # Target agent ID
    action: str           # Requested action
    payload: dict         # Parameters
    correlation_id: str   # Conversation tracking

# Publish to agent channel
await redis.publish(f"agent:{recipient}", message.json())

# Subscribe pattern
async for message in redis.subscribe(f"agent:{self.id}"):
    await self.handle_message(AgentMessage.parse_raw(message))
```

## SDK & ADK

### TypeScript API Client

```typescript
// frontend/src/services/apiService.ts - Singleton pattern
export const api = ApiClient.getInstance();

// Type-safe API calls
const galleries = await api.galleries.list({ page: 1, limit: 20 });
const photo = await api.photos.get(photoId);
await api.photos.upload(file, { galleryId, metadata });

// AI endpoints
const analysis = await api.ai.analyze(photoId);
const results = await api.ai.search('sunset on beach');
const clusters = await api.ai.clusterPeople(galleryId);
```

### Python SDK (AI Service)

```python
# ai-service/src/sdk/client.py
class RawDriveSDK:
    """SDK for AI service to interact with backend."""

    async def get_photo(self, photo_id: str) -> Photo:
        """Fetch photo metadata from backend."""

    async def update_ai_metadata(self, photo_id: str, data: AIMetadata) -> None:
        """Store AI-generated caption, tags, scores."""

    async def store_embedding(self, photo_id: str, embedding: list[float]) -> None:
        """Store 512-dim vector in pgvector."""

    async def vector_search(self, embedding: list[float], limit: int = 20) -> list[Photo]:
        """Search similar photos by embedding."""
```

### ADK (Agent Development Kit)

```python
# ai-service/src/adk/base_agent.py
from abc import ABC, abstractmethod

class BaseAgent(ABC):
    """Base class for building RawDrive AI agents."""

    def __init__(self, name: str, mcp: FastMCP):
        self.name = name
        self.mcp = mcp
        self.logger = structlog.get_logger(agent=name)

    @abstractmethod
    async def process(self, task: AgentTask) -> AgentResult:
        """Process assigned task. Override in subclass."""

    async def call_tool(self, tool: str, **kwargs) -> dict:
        """Call an MCP tool with error handling."""
        try:
            return await self.mcp.call_tool(tool, kwargs)
        except Exception as e:
            self.logger.error("Tool call failed", tool=tool, error=str(e))
            raise

    async def emit_event(self, event: str, data: dict) -> None:
        """Emit event for A2A or UI updates."""
        await redis.publish(f"events:{event}", json.dumps(data))
```

## SEO & GEO (Generative Engine Optimization)

### SEO Meta Tags

```typescript
// Dynamic meta tags per page
import { Helmet } from 'react-helmet-async';

<Helmet>
  <title>{gallery.name} | RawDrive Photography</title>
  <meta name="description" content={gallery.description?.slice(0, 160)} />
  <meta property="og:title" content={gallery.name} />
  <meta property="og:description" content={gallery.description} />
  <meta property="og:image" content={gallery.coverPhotoUrl} />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href={`https://rawdrive.com/g/${gallery.slug}`} />
</Helmet>
```

### Structured Data (JSON-LD)

```typescript
// Schema.org markup for rich snippets
const gallerySchema = {
  "@context": "https://schema.org",
  "@type": "ImageGallery",
  "name": gallery.name,
  "description": gallery.description,
  "image": gallery.coverPhotoUrl,
  "numberOfItems": gallery.photoCount,
  "author": {
    "@type": "Person",
    "name": photographer.name,
    "url": photographer.portfolioUrl,
  },
  "dateCreated": gallery.createdAt,
};

<script type="application/ld+json">
  {JSON.stringify(gallerySchema)}
</script>
```

### GEO (AI Search Optimization)

```typescript
// Optimize for AI search engines (Perplexity, ChatGPT, etc.)

// 1. Clear, semantic HTML structure
<article itemScope itemType="https://schema.org/Article">
  <h1 itemProp="headline">{title}</h1>
  <p itemProp="description">{description}</p>
  <div itemProp="articleBody">{content}</div>
</article>

// 2. FAQ schema for AI snippets
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqs.map(faq => ({
    "@type": "Question",
    "name": faq.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": faq.answer
    }
  }))
};

// 3. AI-friendly content guidelines:
// - Direct answers in first paragraph
// - Clear heading hierarchy (H1 → H2 → H3)
// - Bullet points for scannable content
// - Authoritative, factual language
// - Include relevant statistics/numbers
```

### Technical SEO

```typescript
// robots.txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /dashboard/
Sitemap: https://rawdrive.com/sitemap.xml

// Dynamic XML sitemap
app.get('/sitemap.xml', async (req, res) => {
  const publicGalleries = await getPublicGalleries();
  const urls = publicGalleries.map(g => ({
    loc: `https://rawdrive.com/g/${g.slug}`,
    lastmod: g.updatedAt,
    changefreq: 'weekly',
    priority: 0.8,
  }));
  res.header('Content-Type', 'application/xml');
  res.send(generateSitemapXML(urls));
});
```

### Core Web Vitals

```typescript
// Performance targets for SEO
// LCP (Largest Contentful Paint): < 2.5s
// INP (Interaction to Next Paint): < 200ms
// CLS (Cumulative Layout Shift): < 0.1

// Optimize LCP with priority hints
<img
  src={heroImage.url}
  fetchPriority="high"
  loading="eager"
  decoding="sync"
/>

// Prevent CLS with aspect ratio containers
<div className="aspect-[4/3] bg-surface-hover">
  <img className="w-full h-full object-cover" loading="lazy" />
</div>

// Preload critical assets
<link rel="preload" href="/fonts/Inter.woff2" as="font" crossOrigin="" />
<link rel="preconnect" href="https://cdn.rawdrive.com" />
```

### Image SEO

```typescript
// Every image needs descriptive alt text
<img
  src={photo.url}
  alt={photo.aiDescription || photo.title || 'Photo'}
  title={photo.title}
  width={photo.width}
  height={photo.height}
  loading="lazy"
/>

// Use AI-generated descriptions for alt text
// Stored in photos.ai_description column
```

## AI Cost Optimization

### LLM Usage Strategy

```python
# Optimize AI costs with these strategies:
# (Pricing varies by provider - configure via AI_PROVIDER env var)

# 1. Cache by image content hash
cache_key = f"analysis:{image_hash}"
if cached := await redis.get(cache_key):
    return json.loads(cached)
result = await ai_client.analyze(image)  # Uses configured LLM provider
await redis.setex(cache_key, 86400, json.dumps(result))  # 24h cache

# 2. Use local models when possible
LLM_TASKS = {'caption', 'quality_assessment', 'scene_type'}
LOCAL_TASKS = {'face_detection', 'embedding', 'blur_detection'}

if task in LOCAL_TASKS:
    return await local_model.process(image)  # $0
else:
    return await ai_client.analyze(image)  # Uses configured provider

# 3. Batch processing to reduce overhead
async def batch_analyze(photos: list[Photo], batch_size: int = 10):
    for batch in chunked(photos, batch_size):
        results = await asyncio.gather(*[
            analyze_photo(p) for p in batch
        ])
        yield results
```

### Rate Limits per Workspace

```python
# AI Service rate limits (per workspace)
RATE_LIMITS = {
    'llm_analysis': 30,       # /minute
    'face_detection': 100,    # /minute
    'semantic_search': 50,    # /minute
    'embedding_generation': 200,  # /minute
}
```

## Observability

### Key Metrics

```typescript
// Storage & ingestion metrics (Prometheus format)
uploads_created_total{workspace_id, provider}     // Counter
uploads_committed_total{workspace_id, result}     // Counter (result=success|error)
upload_bytes_total{workspace_id}                  // Counter
asset_ingest_latency_seconds_bucket               // Histogram

// Performance targets
// - upload.commit p95: < 500ms (excluding background checksum for large files)
// - assets.list p95: < 250ms for 50 items
```

### Alerts

- Sustained checksum mismatch rate > threshold
- High upload commit error rate
- Storage provider connectivity failures (critical for BYOS)

## Useful Links

- API Docs: `docs/api/`
- Architecture: `docs/architecture/`
- Technical Specs: `docs/TechnicalSpecs/`
- Storage & BYOS Spec: `docs/TechnicalSpecs/storage_ingestion_byos.json`
- Test Users: `docs/TEST_USERS.md`
- Quick Start: `docs/QUICK_START.md`
- Design System: `.claude/skills/design-system/SKILL.md`
- Security Guidelines: `.claude/skills/security/SKILL.md`
- AI Integration: `.claude/skills/ai-mcp-integration/SKILL.md`
- MCP Specification: https://modelcontextprotocol.io/
- Schema.org: https://schema.org/

## Active Technologies
- Python 3.11+ (matching main backend) + FastAPI 0.115+, SQLAlchemy 2.0+, asyncpg 0.29+, Redis 5.0+, Pydantic 2.7+, python-jose (JWT) (001-admin-microservice)
- PostgreSQL 16 with pgvector (shared with main backend, admin_* table prefix), Redis 7 (sessions, cache, pub/sub) (001-admin-microservice)
- Python 3.9+ (Backend), TypeScript 5.2+ (Frontend) + FastAPI 0.115+, React 18.3, argon2-cffi, pyotp (new), react-hook-form, zod (002-user-profile-settings)
- PostgreSQL 16 (pgvector), Redis 7 (sessions/cache), Cloudflare R2 (avatar storage) (002-user-profile-settings)
- Python 3.9+ (Backend), TypeScript 5.2+ (Frontend) + FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+, httpx 0.27+ (Gemini calls) (003-user-gemini-settings)
- PostgreSQL 16 (new tables: `user_gemini_settings`, `gemini_models`), Redis 7 (settings cache) (003-user-gemini-settings)
- Python 3.11 (Backend), TypeScript 5.2+ (Frontend) + FastAPI 0.115+, React 18.3, Pydantic 2.7+, TailwindCSS (004-gallery-gradient-branding)
- PostgreSQL 16 (JSONB column for gradient_config) (004-gallery-gradient-branding)
- Python 3.11+ (Backend), TypeScript 5.2+ (Frontend) + FastAPI 0.115+, React 18.3, asyncpg 0.29+, pgvector (005-smart-tagging-cache)
- PostgreSQL 16 (pgvector for embeddings), Redis 7 (caching) (005-smart-tagging-cache)
- Python 3.11+ (Backend FastAPI), TypeScript 5.2+ (Frontend React 18.3) + FastAPI 0.115+, React 18.3, asyncpg 0.29+, razorpay SDK 1.4+, TailwindCSS (006-user-profile-sidebar)
- PostgreSQL 16 (new tables: invoices, payment_methods, checkout_sessions), Redis 7 (session cache) (006-user-profile-sidebar)
- Python 3.11 (Backend), TypeScript 5.2+ (Frontend) + FastAPI 0.115+, React 18.3, cryptography (AES-256-GCM via existing EncryptionService) (007-fix-gallery-pin-password)
- PostgreSQL 16 (new columns: `password_encrypted`, `password_iv`, `pin_encrypted`, `pin_iv`) (007-fix-gallery-pin-password)
- Python 3.11 (Backend), TypeScript 5.2+ (Frontend) + FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+, pgvector (008-face-group-merge)
- PostgreSQL 16 with pgvector extension, Redis 7 (for caching) (008-face-group-merge)
- TypeScript 5.2+ (Frontend React 18.3) + React 18.3, React Router DOM 6.21, TailwindCSS 3.3, Lucide React (icons) (009-profile-tabs-redesign)
- N/A (frontend-only, uses existing API endpoints) (009-profile-tabs-redesign)
- Python 3.11 (Backend), TypeScript 5.2+ (Frontend) + FastAPI 0.115+, React 19, SQLAlchemy 2.0+, asyncpg 0.29+, BullMQ, FFmpeg, Puppeteer (017-digital-wedding-invitations)
- PostgreSQL 16 (new tables), Redis 7 (job queues), Cloudflare R2 (media storage) (017-digital-wedding-invitations)
- Python 3.11 (matching existing microservice) + FastAPI 0.115+, asyncpg 0.29+, redis 5.0+, celery 5.3+, sendgrid 6.11+ (018-invitations-production-readiness)
- PostgreSQL 16 (existing), Redis 7 (existing) (018-invitations-production-readiness)

## Recent Changes
- 001-admin-microservice: Added Python 3.11+ (matching main backend) + FastAPI 0.115+, SQLAlchemy 2.0+, asyncpg 0.29+, Redis 5.0+, Pydantic 2.7+, python-jose (JWT)
