# UI/UX Design System & Theming Guide

**Last Updated**: January 5, 2026

## Overview

This document outlines the visual language, technical requirements for the frontend, and the design system principles for RawDrive. The goal is to create a premium, "wow-factor" aesthetic using the best open-source tools available.

---

## 1. Core Design Principles

*   **Content-First**: The photography is the hero. The UI should recede, providing a clean, distraction-free stage for the images.
*   **Premium & Polished**: High attention to micro-interactions, smooth transitions, and consistent spacing.
*   **Accessibility**: WCAG 2.1 AA compliance is mandatory. High contrast modes and keyboard navigation must be first-class citizens.
*   **Responsive**: "Mobile-First" is not just a buzzword. The experience on a phone must be as powerful as on a desktop.

---

## 2. Technology Stack (Visual Layer)

We strictly use best-in-class open-source libraries to ensure maintainability and ecosystem support.

*   **Framework**: **React 18+** with **Vite** (Fast, modern build tool).
*   **Styling Engine**: **Tailwind CSS v3+** (Utility-first, highly customizable).
*   **Component Primitives**: **Radix UI** (Headless, accessible, unstyled primitives).
*   **Component Library**: **shadcn/ui** (Re-usable components built with Radix UI and Tailwind CSS).
*   **Icons**: **Lucide React** (Clean, consistent, lightweight SVG icons).
*   **Animations**: **Framer Motion** (Production-ready declarative animations).
*   **Fonts**: **Google Fonts** (Optimized loading via `next/font` or standard CSS import).

---

## 3. AI Native UX Patterns (New)

We are building an **AI Native** application, meaning AI is not an addon but the primary interface.

### Conversational & Natural Language
*   **Command Bar**: A central "Cmd+K" interface that accepts natural language (e.g., "Find photos of the bride smiling at sunset").
*   **Generative Inputs**: Text areas that offer auto-completion and "Magic Rewrite" buttons.
*   **Skeleton Loading**: Use "Shimmer" effects that mimic the shape of the content being generated to reduce perceived latency during AI inference.

### Smart Curation UI
*   **Masonry Layouts**: Dynamic grids that resize based on AI "Quality Scores" (better photos = larger display).
*   **Contextual Actions**: Floating action buttons that change based on the content detection (e.g., "Edit Face" appears only when a face is detected).

---

## 4. Theming & Token System

We use CSS variables (via Tailwind) to handle theming, enabling instant switching between Light, Dark, and High-Contrast modes.

### Typography

*   **Primary Font**: **Inter** (Google Font).
    *   *Why*: Excellent legibility at all sizes, neutral character, standard for modern SaaS.
    *   *Fallbacks*: system-ui, -apple-system, sans-serif.
*   **Headings**: Tight tracking (-0.025em), higher weights (600/700).
*   **Body**: Normal tracking, regular weights (400/500).

### Color Palette (Slate & Indigo)

We avoid "generic" colors. We use a curated **Slate** scale for neutrals to give a premium, slightly cool tone, and **Indigo/Violet** for primary actions.

**Neutral Scale (Slate)**

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-background` | `#ffffff` | Page background (Light) |
| `bg-muted` | `#f1f5f9` | Secondary backgrounds, cards |
| `text-foreground` | `#0f172a` | Primary text |
| `text-muted-foreground` | `#64748b` | Secondary text, captions |

**Primary Brand Scale (Indigo)**

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#4f46e5` | Primary buttons, active states (Indigo-600) |
| `bg-primary/90` | `#4338ca` | Hover states |
| `text-primary-foreground`| `#ffffff` | Text on primary buttons |

**Status Colors**
*   **Destructive**: Red-600 (`#dc2626`)
*   **Success**: Emerald-600 (`#059669`)
*   **Warning**: Amber-500 (`#f59e0b`)

### Dark Mode Strategy

*   **Backgrounds**: Do NOT use pure black (`#000000`). Use rich dark grays (Slate-950: `#020617`).
*   **Borders**: Subtle borders (Slate-800) to define structure without heavy lines.
*   **Depth**: use `shadow-xl` and lighter background layers (Slate-900) to indicate elevation.

---

## 4. UI Component Library (shadcn/ui)

We adopt the **shadcn/ui** philosophy: *components are source code, not a dependency*. This allows full ownership and customization.

### Key Components

*   **Buttons**: Variants for Default, Secondary, Ghost, and Destructive.
*   **Dialogs / Modals**: Managed via Radix UI `Dialog` primitive for focus trapping and screen reader support.
*   **Dropdowns**: Radix UI `DropdownMenu`.
*   **Forms**: `react-hook-form` + `zod` validation, styled with shadcn input wrappers.
*   **Toast Notifications**: `sonner` (an opinionated, polished toast library).

---

## 5. Animation Guidelines

Animations should be purposeful, not decorative. Use **Framer Motion**.

*   **Duration**: Fast (0.2s - 0.3s).
*   **Easing**: Ease-out (`[0.22, 1, 0.36, 1]`) for entrance, Ease-in for exit.
*   **Micro-interactions**:
    *   Scale down slightly (0.98) on button click.
    *   Subtle color shifts on hover.
    *   Skeletons for loading states (no spinners for content layouts).

---

## 6. Implementation Checklist

1.  Initialize Tailwind CSS with the defined color tokens in `globals.css`.
2.  Install `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`.
3.  Configure `inter` font family in `tailwind.config.js`.
4.  Set up Dark Mode toggle using `next-themes` or a simple React context provider.
5.  Copy core primitives (Button, Input, Card) from shadcn/ui to `src/components/ui`.
