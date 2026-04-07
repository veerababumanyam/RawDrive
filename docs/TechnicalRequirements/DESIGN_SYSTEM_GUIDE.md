# RawDrive Design System Guide v1.0

This document outlines the engineering standards and design language for all RawDrive frontend applications. Adherence is mandatory for all new features and refactors.

## 1. Zero Hardcoding Policy

RawDrive enforces a strict **Zero Hardcoding** policy. All styling must consume semantic tokens from the centralized configuration.

### 1.1 Prohibited Practices
- **No Hex/RGB/HSL Literals:** Never use `#FFFFFF`, `rgba(0,0,0,0.5)`, or `hsl(200, 100%, 50%)` in component files.
- **No Tailwind Primitive Scales:** Avoid `bg-neutral-100`, `text-blue-500`, or `border-zinc-200`.
- **No Arbitrary Values:** Avoid `w-[245px]`, `h-[12vh]`, or `top-[10px]`. Use spacing tokens instead.

### 1.2 Correct Usage
Always use semantic tokens or configured utility classes:

| legacy (STRICTLY PROHIBITED) | correct (MANDATORY) |
| :--- | :--- |
| `text-[#1A1A1A]` | `text-text-primary` |
| `text-neutral-500` | `text-text-secondary` |
| `bg-white` | `bg-surface` |
| `bg-blue-600` | `bg-accent` |
| `border-zinc-200` | `border-border` |
| `shadow-xl` | `shadow-glass` |

---

## 2. Semantic Token Architecture

Tokens are defined in `frontend/src/index.css` and mapped via Tailwind CSS V4.

### 2.1 Surfaces & Backgrounds
- `bg-surface`: Primary page background.
- `bg-surface-elevated`: Cards, modals, and raised elements.
- `bg-surface-sunken`: Secondary backgrounds for differentiation.

### 2.2 Typography
- `text-text-primary`: High-contrast headers and body text.
- `text-text-secondary`: Subheaders and descriptive text.
- `text-text-tertiary`: Captions, timestamps, and metadata.

### 2.3 Accents & Brand
- `text-accent`: Main platform brand color.
- `bg-accent`: Buttons and interactive backgrounds.
- `bg-accent/10`: Subtle background washes of the accent color.

---

## 3. Liquid Glass Design Language

Inspired by **iOS 26 / macOS Tahoe**, our aesthetic focuses on depth, material-rich backgrounds, and fluid motion.

### 3.1 Glassmorphism
Apply `shadow-glass` and `backdrop-blur-md` to high-prominence UI layers:
- Navigation bars
- Floating Action Buttons (FABs)
- Modal backdrops
- Premium Plan cards

### 3.2 Motion Principles
- **Standard Durations:** Use `duration-300` for most interactions.
- **Curve:** All transitions must use the standard cubic-bezier: `cubic-bezier(0.4, 0, 0.2, 1)`.

---

## 4. Verification & Auditing

The build system will automatically audit for hardcoded values. You can manually check using:
```bash
# Search for hex codes in TSX files
grep -rE "#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})" src/**/*.tsx
```
