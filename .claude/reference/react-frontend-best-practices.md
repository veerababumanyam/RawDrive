# React Frontend Best Practices Reference

A concise guide for the RawDrive Frontend (React 19 + Vite + TypeScript).

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Components & UI](#2-components--ui)
3. [State Management](#3-state-management)
4. [Data Fetching (React Query)](#4-data-fetching-react-query)
5. [Routing & Layouts](#5-routing--layouts)
6. [Forms (React Hook Form)](#6-forms-react-hook-form)
7. [Directives & Performance](#7-directives--performance)
8. [TypeScript Patterns](#8-typescript-patterns)

---

## 1. Project Structure

```text
src/
├── assets/          # Static images, fonts
├── components/
│   ├── ui/          # Generic UI atoms (Buttons, Inputs) - shadcn/ui style
│   ├── features/    # Business-logic components (GalleryGrid, PhotoCard)
│   └── layout/      # Layout wrappers (Sidebar, Header)
├── hooks/           # Custom hooks
├── lib/             # Utilities (utils.ts, axios.ts)
├── pages/           # Route pages
├── services/        # API calls (axios definitions)
├── stores/          # Global state (Zustand)
├── types/           # Global type definitions
└── App.tsx
```

---

## 2. Components & UI

### Atomic Design (shadcn/ui)
We use a library of unstyled, accessible components styled with Tailwind CSS.

*   **Location:** `src/components/ui/`
*   **Usage:** Import specific components.

```tsx
import { Button } from "@/components/ui/button"

export function Action() {
  return <Button variant="destructive">Delete</Button>
}
```

### Feature Components
Feature-specific components (e.g., `GalleryCard`) should live near where they are used or in `components/features`.

### Props
Use interfaces for props. Keep props minimal and localized.

```tsx
interface GalleryCardProps {
  title: string;
  coverUrl: string;
  onClick: () => void;
}
```

---

## 3. State Management

### Server State vs Client State
*   **Server State (API Data):** Use **TanStack Query (React Query)**. Do NOT store API data in Redux/Zustand unless absolutely necessary.
*   **Client State (UI):** Use **Zustand** or local `useState`.

### Zustand Pattern

```tsx
import { create } from 'zustand'

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
```

---

## 4. Data Fetching (React Query)

Use generic hooks for API interaction.

```tsx
// hooks/use-galleries.ts
export function useGalleries(workspaceId: string) {
  return useQuery({
    queryKey: ['galleries', workspaceId],
    queryFn: () => GalleryService.list(workspaceId),
  })
}

// Component
const { data, isLoading } = useGalleries(wsId);
```

**Mutations:**

```tsx
const mutation = useMutation({
  mutationFn: GalleryService.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['galleries'] });
    toast.success("Gallery created!");
  },
});
```

---

## 5. Routing & Layouts

Using `react-router-dom` v6+.

*   **Layout Routes:** Use `<Outlet />` for nested layouts (MainLayout, AuthLayout).
*   **Lazy Loading:** Use `React.lazy` for page-level code splitting.

```tsx
const GalleryPage = React.lazy(() => import('./pages/GalleryPage'));
```

---

## 6. Forms (React Hook Form)

Use `react-hook-form` with `zod` for schema validation.

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1, "Required"),
})

export function CreateForm() {
  const form = useForm({ resolver: zodResolver(schema) })
  
  return (
    <Form {...form}>
       <FormField control={form.control} ... />
    </Form>
  )
}
```

---

## 7. Directives & Performance

### UseMemo & UseCallback
Don't premature optimize using `useMemo` unless expensive calculation.
Do use `useCallback` when passing functions to memoized children.

### Virtualization
For large grids (1000+ photos), use `react-window` or `virtua` to DOM virtualization.

### Image Optimization
Use standard `<img>` with `loading="lazy"` or a specialized `Image` component that handles:
*   Blur-up placeholders (LQIP).
*   `srcSet` for responsive sizing.

---

## 8. TypeScript Patterns

*   **Strict Mode:** Standard for the project. No `any` unless strictly required.
*   **Shared Types:** Import types/enums from `src/types` or `@rawdrive/shared-types` (if referencing monorepo packages).

```tsx
import type { Gallery } from "@/types"
```
