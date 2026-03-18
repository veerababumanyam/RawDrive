---
name: react-frontend
description: "RawDrive frontend development with React 18, TypeScript, TanStack Query, and the project's component architecture. Use this skill when creating or modifying React components, hooks, pages, services, contexts, or any frontend TypeScript code. Also use for state management decisions, data fetching patterns, form handling, routing, or performance optimization questions. Triggers on: React component, hook, page, frontend, UI component, TanStack Query, React Query, form, state management, Vite, TailwindCSS."
---

# React Frontend Architecture

RawDrive frontend uses React 18 + TypeScript + Vite with strict conventions for state management, data fetching, and component organization.

## State Management Rules

| State Type | Solution | Example |
|-----------|----------|---------|
| **Server state** (API data) | TanStack Query ONLY | Gallery list, user profile |
| **Client state** (UI) | `useState` / Zustand | Modal open, sidebar collapsed |
| **Form state** | React Hook Form + Zod | Create gallery form |
| **URL state** | React Router params | Current gallery ID, filters |

**CRITICAL:** Never store API data in Zustand/Redux. TanStack Query handles caching, refetching, and stale data.

## Data Fetching Pattern

Always wrap queries in custom hooks:

```typescript
// hooks/useGalleries.ts
export function useGalleries(workspaceId: string) {
  return useQuery({
    queryKey: ['galleries', workspaceId],
    queryFn: () => galleryService.list(workspaceId),
  });
}

// hooks/useCreateGallery.ts
export function useCreateGallery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: galleryService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['galleries'] });
    },
  });
}
```

## Component Patterns

```typescript
// Functional components only, with typed props
interface GalleryCardProps {
  gallery: Gallery;
  onSelect: (id: string) => void;
}

export const GalleryCard: React.FC<GalleryCardProps> = ({ gallery, onSelect }) => {
  // Component logic
};
```

## Form Pattern

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export const CreateGalleryForm: React.FC = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  // Never use raw form state
};
```

## File Placement (Strict)

```
frontend/src/
├── components/
│   ├── ui/              # Design system (AppButton, AppInput, etc.)
│   ├── layout/          # Header, Sidebar, PageWrapper
│   ├── common/          # Shared utility components
│   └── features/        # Feature-specific components
│       ├── gallery/     # GalleryCard, GalleryGrid, etc.
│       ├── upload/      # UploadDropzone, UploadProgress
│       └── [feature]/   # Grouped by domain
├── pages/               # Route page components
├── hooks/               # Custom hooks (useHookName.ts)
├── services/            # API client services
├── contexts/            # React contexts (Auth, Search, etc.)
├── utils/               # Pure utility functions
├── types/               # Global TypeScript types
└── config/              # App configuration
```

## Shared Packages

Import from monorepo shared packages:
```typescript
import { GalleryStatus } from '@rawdrive/shared-types';
import { API_BASE, PAGINATION } from '@rawdrive/shared-constants';
import { isValidHexColor } from '@rawdrive/shared-validation';
import { formatFileSize } from '@rawdrive/shared-utils';
```

## Performance Rules

- `useMemo` only for expensive calculations, not premature optimization
- `useCallback` when passing functions to memoized children
- Large lists (1000+ items): virtualize with `react-window` or `virtua`
- Images: LQIP blur-up placeholders + `srcSet` for responsive sizing
- Code splitting: `React.lazy()` for route-level chunks

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | `PascalCase.tsx` | `GalleryUpload.tsx` |
| Hooks | `useCamelCase.ts` | `useUpload.ts` |
| Services | `camelCase.ts` | `galleryService.ts` |
| Utils | `camelCase.ts` | `formatDate.ts` |
| Types | `PascalCase` | `GalleryStatus` |

**Deep dive:** Read `.claude/reference/react-frontend-best-practices.md`
