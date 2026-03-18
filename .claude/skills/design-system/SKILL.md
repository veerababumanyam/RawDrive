---
name: design-system
description: "RawDrive design system: UI components, design tokens, theming (light/dark), TailwindCSS patterns, accessibility (WCAG 2.1 AA), and component conventions. Use this skill when building UI components, working with the design system, implementing themes, choosing colors, adding animations (Framer Motion), ensuring accessibility, or creating responsive layouts. Also use for icon usage (Heroicons/Lucide), typography, spacing, or any visual design decisions. Triggers on: UI component, design system, theme, dark mode, TailwindCSS, accessibility, WCAG, ARIA, animation, Framer Motion, color, typography, responsive, icon."
---

# Design System & UI Patterns

RawDrive uses a custom design system with TailwindCSS, supporting light/dark themes. Never hardcode colors — always use design tokens.

## Design Tokens

```typescript
// ALWAYS use tokens from @rawdrive/shared-constants, never raw hex values
import { COLORS, SPACING, TYPOGRAPHY } from '@rawdrive/shared-constants';

// WRONG
<div className="bg-[#1a1a2e] text-[#e94560]">

// CORRECT
<div className="bg-primary text-accent dark:bg-primary-dark">
```

## Component Conventions

### UI Components (`components/ui/`)
Base building blocks — `AppButton`, `AppInput`, `AppModal`, `AppSelect`, etc.

```typescript
// components/ui/AppButton.tsx
interface AppButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export const AppButton: React.FC<AppButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  ...props
}) => {
  // Use consistent Tailwind class mapping
};
```

### Feature Components (`components/features/`)
Domain-specific, compose UI components:
```
components/features/
├── gallery/     # GalleryCard, GalleryGrid, GalleryToolbar
├── upload/      # UploadDropzone, UploadProgress, UploadQueue
├── ai/          # AIPanel, AIFilterBar, SmartTagBadge
└── invitations/ # InvitationEditor, RSVPForm
```

## Theme Support

```typescript
// ThemeEngine handles light/dark switching
// Always provide both variants in Tailwind classes
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">

// For dynamic theming in Design Studio
import { ThemeEngine } from '@/utils/ThemeEngine';
```

## Accessibility (WCAG 2.1 AA)

Every component must meet these minimums:

1. **Keyboard navigation:** All interactive elements reachable via Tab, activated via Enter/Space
2. **ARIA labels:** Non-text interactive elements need `aria-label` or `aria-labelledby`
3. **Color contrast:** 4.5:1 for normal text, 3:1 for large text
4. **Focus indicators:** Visible focus rings on all interactive elements
5. **Screen reader:** Semantic HTML (`<nav>`, `<main>`, `<button>`, not `<div onClick>`)

```typescript
// WRONG
<div onClick={handleClick} className="cursor-pointer">Delete</div>

// CORRECT
<button onClick={handleClick} aria-label="Delete gallery">Delete</button>
```

## Animation (Framer Motion)

```typescript
import { motion, AnimatePresence } from 'framer-motion';

// Page transitions
<AnimatePresence mode="wait">
  <motion.div
    key={currentPage}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
</AnimatePresence>
```

Keep animations subtle and purposeful. Respect `prefers-reduced-motion`.

## Icons

Use Heroicons (primary) or Lucide React:
```typescript
import { PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { Camera } from 'lucide-react';
```

## Responsive Breakpoints

Follow Tailwind defaults: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`, `2xl:1536px`

Mobile-first: base styles for mobile, then add breakpoints up.

**Deep dive:** Read `.claude/reference/ui-ux-design-best-practices.md`
