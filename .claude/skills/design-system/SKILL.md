---
name: design-system
aliases: [ui, styling, tokens, theme, colors, components, tailwind, css]
description: Design system guidelines for RawDrive. Use when styling components, using color tokens, implementing themes, or following UI patterns.
---

# RawDrive Design System

## Core Files

| Purpose | Location |
|---------|----------|
| CSS Variables & Tokens | `frontend/src/index.css` |
| Tailwind Config | `frontend/tailwind.config.js` |
| UI Components | `frontend/src/components/ui/` |
| Layout Components | `frontend/src/components/layout/` |

## Brand Colors

```css
/* Primary - Blue (Brand Core) */
--color-primary: #2563EB;
--color-primary-hover: #1D4ED8;

/* Accent - Cyan */
--color-accent: #06B6D4;
--color-accent-hover: #0891B2;

/* Gold - Premium */
--color-gold: #D4AF37;
--color-gold-light: #FDE68A;
```

## Semantic Tokens

```css
/* Backgrounds */
--color-background: #F8FAFC;
--color-surface: #FFFFFF;
--color-surface-hover: #F1F5F9;

/* Text */
--color-text-primary: #0F172A;
--color-text-secondary: #475569;
--color-text-tertiary: #64748B;

/* Borders */
--color-border: #E2E8F0;
--color-border-focus: #2563EB;

/* Status */
--color-success: #059669;
--color-warning: #B45309;
--color-error: #B91C1C;
```

## Component Library

### Required Imports

```typescript
import { AppButton, AppInput, AppCard, AppBadge } from '@/components/ui';
import { Modal, Toast, Spinner, Skeleton } from '@/components/ui';
import { AppShell, Sidebar } from '@/components/layout';
import { useTheme } from '@/hooks';
```

### AppButton

```typescript
// Variants: primary, secondary, outline, ghost, destructive, gold
<AppButton variant="primary">Save</AppButton>
<AppButton variant="outline">Cancel</AppButton>
<AppButton variant="destructive">Delete</AppButton>
<AppButton variant="gold">Upgrade</AppButton>

// Sizes: sm, md, lg, icon
<AppButton size="icon"><X size={20} /></AppButton>

// States
<AppButton isLoading>Saving...</AppButton>
<AppButton disabled>Disabled</AppButton>

// With icons
<AppButton leftIcon={<Plus size={16} />}>Add</AppButton>
```

### AppInput

```typescript
<AppInput
  label="Email"
  type="email"
  placeholder="Enter email"
  isRequired
/>

<AppInput
  label="Password"
  error={errors.password?.message}
  helperText="Must be 8+ characters"
/>

<AppInput
  leftIcon={<Search size={16} />}
  rightIcon={<X size={16} />}
/>
```

### AppCard

```typescript
// Variants: default, elevated, glass
<AppCard variant="elevated" hoverable onClick={handleClick}>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Content>Content</Card.Content>
  <Card.Footer>
    <AppButton>Action</AppButton>
  </Card.Footer>
</AppCard>
```

### Modal

```typescript
<Modal isOpen={isOpen} onClose={onClose} size="md">
  <Modal.Header>
    <Modal.Title>Edit Gallery</Modal.Title>
  </Modal.Header>
  <Modal.Body>{/* Form */}</Modal.Body>
  <Modal.Footer>
    <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
    <AppButton variant="primary" onClick={onSave}>Save</AppButton>
  </Modal.Footer>
</Modal>
```

### Toast

```typescript
import { useToastActions } from '@/components/ui';

const toast = useToastActions();
toast.success('Gallery created');
toast.error('Upload failed');
toast.warning('Storage almost full');
```

## Theme System

```typescript
import { useTheme } from '@/hooks';

const { theme, toggleTheme, isDark } = useTheme();

<AppButton variant="ghost" size="icon" onClick={toggleTheme}>
  {isDark ? <Sun size={20} /> : <Moon size={20} />}
</AppButton>
```

```css
/* Light theme (default) */
:root {
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
}

/* Dark theme */
[data-theme="dark"] {
  --color-background: #020617;
  --color-surface: #0F172A;
}
```

## Glassmorphism

```css
.glass {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.glass-dark {
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(12px);
}
```

## Typography

```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-serif: 'Playfair Display', Georgia, serif;
--font-mono: 'Roboto Mono', monospace;
```

```typescript
<h1 className="heading-1">Page Title</h1>     // 36px bold
<h2 className="heading-2">Section</h2>        // 30px bold
<span className="text-gradient">Gradient</span>
```

## Spacing (4px base)

| Class | Value | Use Case |
|-------|-------|----------|
| `p-1` | 4px | Tight inline |
| `p-2` | 8px | Default inline |
| `p-4` | 16px | Card padding |
| `p-6` | 24px | Section spacing |

## Animations

```typescript
<div className="animate-fade-in-up">Fade in</div>
<div className="animate-scale-in">Scale in</div>
<div className="animate-pulse-glow">Glow</div>

// With delays
<div className="animate-fade-in-up delay-100">Delayed</div>
```

## Design Rules

### ALWAYS Do

1. Use design tokens: `bg-surface`, `text-text-primary`
2. Use component library: `AppButton`, `AppInput`
3. Support dark mode
4. Include all states: hover, focus, disabled
5. Add `focus-visible:ring-2` for keyboard nav

### NEVER Do

1. Hardcode colors: No `bg-blue-500`, `#ffffff`
2. Create custom buttons/inputs
3. Use `outline-none` without replacement
4. Skip loading/error states
