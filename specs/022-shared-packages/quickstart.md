# Quickstart: Shared Packages Infrastructure

**Feature**: 022-shared-packages
**Date**: 2026-01-04

## Prerequisites

- Node.js 18+
- pnpm 8+ (install with `npm install -g pnpm`)
- Python 3.9+ (for generated type verification)

## Setup

### 1. Initialize pnpm Workspaces

Create `pnpm-workspace.yaml` at repository root:

```yaml
packages:
  - 'packages/*'
  - 'frontend'
  - 'backend'
  - 'services/*'
```

### 2. Create Package Structure

```bash
# Create package directories
mkdir -p packages/shared-types/src
mkdir -p packages/shared-constants/src
mkdir -p packages/shared-validation/src
mkdir -p packages/shared-utils/src

# Create package.json for each package
```

### 3. Install Dependencies

```bash
# Install workspace dependencies
pnpm install

# Add shared packages to frontend
pnpm add @rawdrive/shared-types @rawdrive/shared-constants \
  @rawdrive/shared-validation @rawdrive/shared-utils \
  --filter rawdrive-frontend --workspace
```

## Usage Examples

### Frontend (TypeScript/React)

```typescript
// Import types
import { InvitationStatus, GalleryStatus } from '@rawdrive/shared-types';
import type { GradientConfiguration } from '@rawdrive/shared-types';

// Import constants
import { API_BASE, STORAGE, PAGINATION } from '@rawdrive/shared-constants';

// Import validation
import { hexColorSchema, isValidUUID } from '@rawdrive/shared-validation';

// Import utilities
import { formatRelativeDate, formatFileSize } from '@rawdrive/shared-utils';

// Use in component
function GalleryCard({ gallery }: { gallery: Gallery }) {
  const isPublished = gallery.status === GalleryStatus.PUBLISHED;
  const sizeDisplay = formatFileSize(gallery.total_bytes);
  const lastUpdated = formatRelativeDate(gallery.updated_at);

  return (
    <div>
      <span>{isPublished ? 'Live' : 'Draft'}</span>
      <span>{sizeDisplay}</span>
      <span>Updated {lastUpdated}</span>
    </div>
  );
}
```

### Backend (Python/FastAPI)

```python
# Import generated types
from app.shared.types import (
    InvitationStatus,
    GradientConfiguration,
    ColorStop,
    ErrorResponse,
)

# Import generated constants
from app.shared.constants import (
    API_BASE,
    STORAGE,
    PAGINATION,
)

# Use in endpoint
@router.get("/invitations/{id}")
async def get_invitation(id: str) -> InvitationResponse:
    invitation = await service.get(id)
    if invitation.status == InvitationStatus.EXPIRED:
        raise HTTPException(status_code=410, detail="Invitation expired")
    return invitation

# Use in Pydantic model
class GalleryUpdate(BaseModel):
    gradient_config: Optional[GradientConfiguration] = None
    status: Optional[GalleryStatus] = None
```

### Microservice (Python)

```python
# services/invitations-service/src/api/rsvp.py
from shared.types import RSVPStatus, GuestStatus

async def submit_rsvp(guest_id: str, status: RSVPStatus):
    guest = await repo.get(guest_id)
    guest.rsvp_status = status
    guest.status = GuestStatus.RESPONDED
    await repo.save(guest)
```

## Development Workflow

### Building Packages

```bash
# Build all packages
pnpm build:packages

# Build single package
pnpm --filter @rawdrive/shared-types build

# Watch mode for development
pnpm --filter @rawdrive/shared-types dev
```

### Generating Python Types

```bash
# Generate Python types from TypeScript
pnpm generate:python

# This runs:
# 1. ts-json-schema-generator → JSON schemas
# 2. datamodel-codegen → Pydantic models
# 3. Copy to backend/src/app/shared/
```

### Running Tests

```bash
# Test all packages
pnpm test:packages

# Test single package
pnpm --filter @rawdrive/shared-types test

# Run parity tests (TypeScript vs Python)
pnpm test:parity
```

### Adding New Types

1. **Add TypeScript definition** in `packages/shared-types/src/`:

```typescript
// packages/shared-types/src/booking.ts
export const BookingStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
} as const;
export type BookingStatus = typeof BookingStatus[keyof typeof BookingStatus];
```

2. **Export from index.ts**:

```typescript
// packages/shared-types/src/index.ts
export { BookingStatus } from './booking';
export type { BookingStatus } from './booking';
```

3. **Regenerate Python**:

```bash
pnpm generate:python
```

4. **Add parity test**:

```typescript
// packages/shared-types/tests/booking.test.ts
import { BookingStatus } from '../src';

describe('BookingStatus', () => {
  it('has expected values', () => {
    expect(Object.values(BookingStatus)).toEqual([
      'pending', 'confirmed', 'cancelled'
    ]);
  });
});
```

## Migration Guide

### Phase 1: Add Packages (Non-Breaking)

Existing code continues to work. Add re-exports to existing files:

```typescript
// frontend/src/types/invitations.ts (MODIFIED)

// Re-export from shared package
export { InvitationStatus, RSVPStatus, EventType } from '@rawdrive/shared-types';
export type { InvitationStatus, RSVPStatus, EventType } from '@rawdrive/shared-types';

// Keep old exports as deprecated aliases
/** @deprecated Import from '@rawdrive/shared-types' instead */
export const InvitationStatusLegacy = InvitationStatus;
```

### Phase 2: Update New Code

All new code imports directly from shared packages:

```typescript
// New file: frontend/src/components/InvitationCard.tsx
import { InvitationStatus } from '@rawdrive/shared-types'; // ✅ Direct import
```

### Phase 3: Run Codemod

Automatically update all imports:

```bash
# Run codemod to update imports
npx jscodeshift \
  -t scripts/codemods/update-imports.ts \
  frontend/src/**/*.{ts,tsx}
```

### Phase 4: Remove Deprecated Exports

After 2 release cycles, remove deprecated re-exports:

```typescript
// frontend/src/types/invitations.ts (FINAL)
// File can be deleted or kept minimal
export * from '@rawdrive/shared-types';
```

## Troubleshooting

### "Module not found: @rawdrive/shared-types"

Ensure the package is linked in workspace:

```bash
pnpm install
pnpm --filter rawdrive-frontend add @rawdrive/shared-types@workspace:*
```

### Python import error: "No module named 'app.shared'"

Ensure Python types are generated and copied:

```bash
pnpm generate:python
# Check backend/src/app/shared/types.py exists
```

### TypeScript error: "Type 'X' is not assignable to type 'Y'"

Types may have drifted. Regenerate and verify:

```bash
pnpm build:packages
pnpm test:parity
```

### Parity test failure

Check that both TypeScript and Python use identical values:

```bash
# Debug by printing both
node -e "console.log(require('@rawdrive/shared-types').InvitationStatus)"
python -c "from app.shared.types import InvitationStatus; print([e.value for e in InvitationStatus])"
```

## Package Scripts Reference

| Script | Description |
|--------|-------------|
| `pnpm build:packages` | Build all shared packages |
| `pnpm generate:python` | Generate Python types from TypeScript |
| `pnpm test:packages` | Run tests for all shared packages |
| `pnpm test:parity` | Run TypeScript-Python parity tests |
| `pnpm lint:packages` | Lint all shared packages |
| `pnpm publish:packages` | Publish packages (CI only) |

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/shared-packages.yml
name: Shared Packages

on:
  push:
    paths:
      - 'packages/**'
  pull_request:
    paths:
      - 'packages/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build:packages
      - run: pnpm test:packages
      - run: pnpm generate:python
      - run: pnpm test:parity

      # Fail if generated files differ
      - run: git diff --exit-code packages/*/generated/
```

## Next Steps

After setup:

1. Run `pnpm build:packages` to verify build works
2. Run `pnpm test:packages` to verify tests pass
3. Update one frontend file to use shared import
4. Verify application still works
5. Commit and push

See [plan.md](./plan.md) for full implementation plan.
