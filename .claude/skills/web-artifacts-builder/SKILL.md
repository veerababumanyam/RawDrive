---
name: web-artifacts-builder
aliases: [prototype, bundle, demo, standalone-html, component-demo]
description: Build and prototype RawDrive UI components with bundling support. Use for creating standalone component demos, prototyping new features, or building shareable HTML previews.
---

# RawDrive Component Builder

Tools for building and prototyping RawDrive UI components with standalone bundling.

> **For design patterns**: See the `frontend-design` skill.
> **For design tokens**: See the `design-system` skill.

## Use Cases

| Scenario | Approach |
|----------|----------|
| New component in app | Add to `frontend/src/components/` |
| Prototype/demo | Use this skill to create standalone bundle |
| Quick iteration | Initialize isolated project, bundle when ready |

## Quick Start

### Step 1: Initialize Project

```bash
bash .claude/skills/web-artifacts-builder/scripts/init-artifact.sh my-prototype
cd my-prototype
```

Creates a project with:
- React 18 + TypeScript + Vite
- Tailwind CSS with RawDrive theming
- shadcn/ui components (40+ pre-installed)
- Path aliases (`@/`)
- Parcel bundling configured

### Step 2: Develop Component

Edit files in the project. Use RawDrive patterns:

```typescript
// src/App.tsx
import { AppButton, AppCard } from '@/components/ui';

export default function App() {
  return (
    <AppCard variant="elevated">
      <AppCard.Header>
        <h2 className="text-xl font-serif">New Feature Prototype</h2>
      </AppCard.Header>
      <AppCard.Content>
        <p className="text-text-secondary">Demo content here</p>
      </AppCard.Content>
      <AppCard.Footer>
        <AppButton variant="primary">Action</AppButton>
      </AppCard.Footer>
    </AppCard>
  );
}
```

### Step 3: Bundle to Single HTML

```bash
bash .claude/skills/web-artifacts-builder/scripts/bundle-artifact.sh
```

Creates `bundle.html` - self-contained HTML with all dependencies inlined.

## RawDrive Design Integration

### Import Design Tokens

```typescript
// Use RawDrive color tokens
<div className="bg-surface text-text-primary border-border" />

// Use brand colors
<div className="bg-primary text-white hover:bg-primary-hover" />
<div className="bg-accent text-white" />
<div className="text-gold" />
```

### Use RawDrive Components

The bundled shadcn/ui components match RawDrive's design system:

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
```

### Add Premium Effects

```typescript
// Aurora background (from frontend-design skill)
<div className="fixed inset-0 -z-10 overflow-hidden">
  <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-500/30 rounded-full blur-[128px]" />
</div>

// Glassmorphism
<div className="glass bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl" />

// Dramatic shadows
<div className="shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)]" />
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/init-artifact.sh <name>` | Create new prototype project |
| `scripts/bundle-artifact.sh` | Bundle to single HTML file |

## When to Use This Skill

**Use this skill when:**
- Prototyping a new feature before integrating into RawDrive
- Creating standalone demos for stakeholder review
- Building quick UI experiments
- Need shareable HTML without running dev server

**Don't use when:**
- Building production features (add to `frontend/` directly)
- Need backend integration (use full dev environment)
- Simple component (just create in `frontend/src/components/`)

## Project Structure

After initialization:

```
my-prototype/
├── src/
│   ├── App.tsx           # Main component
│   ├── main.tsx          # Entry point
│   └── components/
│       └── ui/           # shadcn/ui components
├── index.html
├── tailwind.config.js    # RawDrive-compatible config
├── vite.config.ts
└── package.json
```

## Integration Path

When prototype is ready for production:

1. Copy component logic to `frontend/src/components/`
2. Update imports to use RawDrive's actual components
3. Add tests in `frontend/src/test/`
4. Integrate into appropriate page/route

## Design Guidelines

Follow RawDrive design principles:

- Use semantic color tokens (`bg-surface`, not `bg-white`)
- Use `AppButton`, `AppCard` patterns
- Support dark mode (`[data-theme="dark"]`)
- Include hover/focus states
- Follow WCAG 2.1 AA accessibility

See `frontend-design` and `design-system` skills for details.
