# Design Document: Public Profile Mobile Responsiveness & Theme Enhancement

> **Spec ID:** 021-public-profile-mobile-responsive-theme
> **Status:** Draft
> **Created:** 2026-01-03
> **Last Updated:** 2026-01-03

---

## Architecture Overview

This design document details the technical implementation for making the company public profile page mobile-first, fully responsive, and theme-aware with system detection and manual toggle support.

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Public Profile Page (/p/{slug})                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Theme Context Provider                         │   │
│  │  - System preference detection (prefers-color-scheme)                │   │
│  │  - Manual toggle state                                                │   │
│  │  - localStorage persistence                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      PublicProfileView.tsx                           │   │
│  │  - Fetches profile data                                              │   │
│  │  - Loads theme fonts                                                 │   │
│  │  - Passes theme context to layout                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      PublicProfileLayout.tsx                         │   │
│  │  - Mobile-first responsive grid                                      │   │
│  │  - Theme-aware styling                                               │   │
│  │  - Coordinates child components                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│       ┌────────────────────────────┼────────────────────────────┐          │
│       ▼                            ▼                            ▼          │
│  ┌──────────────┐    ┌────────────────────────┐    ┌──────────────────┐   │
│  │ HeroGlassCard│    │   StudioInfoCard       │    │ContactMethodsCard│   │
│  │ - Logo       │    │   - Website link       │    │ - Email/Phone    │   │
│  │ - Name       │    │   (NO duplicate logo)  │    │ - Address        │   │
│  │ - Tagline    │    │                        │    │ - vCard/QR       │   │
│  │ - CTAs       │    │                        │    │ - Socials        │   │
│  └──────────────┘    └────────────────────────┘    └──────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      ServicesGlassGrid                               │   │
│  │  - Responsive grid (1/2/3 columns)                                   │   │
│  │  - Custom links display                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Theme Toggle Button                             │   │
│  │  - Fixed position top-right                                          │   │
│  │  - Sun/Moon icon                                                     │   │
│  │  - Accessible                                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Theme Management Hook (`usePublicProfileTheme`)

**File:** `frontend/src/hooks/usePublicProfileTheme.ts`

```typescript
interface UsePublicProfileThemeReturn {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  isSystemTheme: boolean;
  systemPreference: 'light' | 'dark';
}

// Implementation approach:
// 1. Check localStorage for saved preference
// 2. If none, detect system preference via matchMedia
// 3. Listen for system preference changes
// 4. Apply data-theme attribute to document root
// 5. Persist manual selections to localStorage
```

**localStorage Key:** `rawdrive-public-profile-theme`

**Priority Order:**
1. User's manual preference (localStorage)
2. System preference (`prefers-color-scheme`)
3. Default to 'light'

---

### 2. Theme Toggle Component (`PublicProfileThemeToggle`)

**File:** `frontend/src/components/features/profile/public/PublicProfileThemeToggle.tsx`

```typescript
interface PublicProfileThemeToggleProps {
  className?: string;
}
```

**Design Specifications:**
- **Position:** Fixed, top-right corner (`fixed top-4 right-4 z-50`)
- **Size:** 44x44px minimum (iOS touch target)
- **Icons:** Sun (light mode), Moon (dark mode) from Lucide
- **Animation:** Rotate + fade transition (300ms)
- **Accessibility:**
  - `role="button"`
  - `aria-label="Switch to {opposite} mode"`
  - `tabIndex={0}`
  - Keyboard support (Enter/Space)

**Styling:**
```css
/* Light mode */
.theme-toggle {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}

/* Dark mode */
[data-theme="dark"] .theme-toggle {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
```

---

### 3. Updated `GlassContainer` Component

**File:** `frontend/src/components/features/profile/public/GlassContainer.tsx`

**Changes:**
1. Add dark mode gradient support
2. Fix background orbs for dark mode (use `mix-blend-screen` instead of `mix-blend-multiply`)
3. Add theme-aware gradient fallbacks

**Dark Mode Gradient:**
```css
/* Light mode default */
background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);

/* Dark mode */
[data-theme="dark"] {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}
```

**Background Orbs Dark Mode:**
```css
/* Light: mix-blend-multiply, Dark: mix-blend-screen */
[data-theme="dark"] .animated-orb {
  mix-blend-mode: screen;
  opacity: 0.3;
}
```

---

### 4. Updated `HeroGlassCard` Component

**File:** `frontend/src/components/features/profile/public/HeroGlassCard.tsx`

**Responsive Changes:**

| Element | Mobile (< 640px) | Tablet (640-1024px) | Desktop (> 1024px) |
|---------|------------------|---------------------|---------------------|
| Container min-height | `min-h-[60vh]` | `min-h-[60vh]` | `min-h-[70vh]` |
| Logo size | `w-20 h-20` | `w-24 h-24` | `w-32 h-32` |
| Name font | `text-3xl` | `text-5xl` | `text-7xl` |
| Tagline font | `text-base` | `text-lg` | `text-2xl` |
| CTA buttons | Stack vertical | Row | Row |
| Padding | `p-4` | `p-8` | `p-16` |

**Dark Mode Classes:**
```tsx
// Glass card background
className="bg-white/10 dark:bg-gray-900/20 backdrop-blur-xl"

// Text gradients
className="bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-200"

// Animated shapes
className="mix-blend-multiply dark:mix-blend-screen"
```

---

### 5. Updated `StudioInfoCard` Component

**File:** `frontend/src/components/features/profile/public/StudioInfoCard.tsx`

**Critical Change: REMOVE DUPLICATE LOGO**

The logo is already displayed in `HeroGlassCard`. The `StudioInfoCard` should focus on:
- Company name (smaller, for reference)
- Tagline (optional)
- Website link button

**New Structure:**
```tsx
<div className="glass-card p-4 sm:p-6 lg:p-8">
  {/* Compact header - no logo */}
  <h2 className="text-xl sm:text-2xl font-bold">{name}</h2>
  {tagline && <p className="text-sm text-text-secondary">{tagline}</p>}
  
  {/* Website button */}
  {website && (
    <AppButton variant="ghost" className="mt-4 w-full sm:w-auto">
      <Globe /> Visit Website <ExternalLink />
    </AppButton>
  )}
</div>
```

---

### 6. Updated `ContactMethodsCard` Component

**File:** `frontend/src/components/features/profile/public/ContactMethodsCard.tsx`

**Key Changes:**

1. **Move QR/vCard buttons** from header to prominent position below contact info
2. **Responsive grid** for email/phone cards
3. **Stack on mobile**, side-by-side on tablet+

**Layout Structure:**
```tsx
<div className="glass-card p-4 sm:p-6 lg:p-8 flex flex-col gap-4 sm:gap-6">
  {/* Header */}
  <h2 className="text-lg sm:text-xl font-bold">Contact Us</h2>
  
  {/* Email & Phone - responsive grid */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <ContactCard type="email" ... />
    <ContactCard type="phone" ... />
  </div>
  
  {/* Address card - full width */}
  {address && <AddressCard address={address} />}
  
  {/* ACTION BUTTONS - Prominent position */}
  <div className="flex flex-col sm:flex-row gap-3 pt-2">
    <AppButton onClick={onDownloadVCard} className="flex-1 min-h-[44px]">
      <Download /> Download vCard
    </AppButton>
    <AppButton onClick={onDownloadQr} className="flex-1 min-h-[44px]">
      <QrCode /> QR Code
    </AppButton>
  </div>
  
  {/* Social icons */}
  <SocialStrip socials={socials} />
</div>
```

**Touch Target Compliance:**
```tsx
// All interactive elements
className="min-h-[44px] min-w-[44px]"

// Social icons
className="p-3 rounded-full min-w-[44px] min-h-[44px]"
```

---

### 7. Updated `ServicesGlassGrid` Component

**File:** `frontend/src/components/features/profile/public/ServicesGlassGrid.tsx`

**Responsive Grid:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {links.map(...)}
</div>
```

| Breakpoint | Columns |
|------------|---------|
| Mobile (< 640px) | 1 |
| Tablet (640-1024px) | 2 |
| Desktop (> 1024px) | 3 |

---

### 8. Updated `PublicProfileLayout` Component

**File:** `frontend/src/components/features/profile/public/PublicProfileLayout.tsx`

**Current Problem:**
```tsx
// Current: Desktop-first, awkward on mobile
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <div className="lg:col-span-5">...</div>
  <div className="lg:col-span-7">...</div>
</div>
```

**New Mobile-First Layout:**
```tsx
<div className="container mx-auto px-4 sm:px-6 lg:px-8">
  {/* Mobile: Single column, stacked */}
  {/* Desktop: Two columns */}
  <div className="flex flex-col lg:flex-row lg:gap-8">
    
    {/* Left column: Contact info */}
    <div className="w-full lg:w-5/12 space-y-4 sm:space-y-6">
      <StudioInfoCard ... />
      <ContactMethodsCard ... />
    </div>
    
    {/* Right column: Services/Links */}
    <div className="w-full lg:w-7/12 mt-6 lg:mt-0">
      <ServicesGlassGrid ... />
    </div>
    
  </div>
</div>
```

---

### 9. Updated `PublicProfileView` Component

**File:** `frontend/src/components/features/profile/PublicProfileView.tsx`

**Changes:**

1. **Wrap with theme provider/hook**
2. **Add theme toggle component**
3. **Apply `data-theme` attribute**
4. **Update loading/error states for dark mode**

```tsx
export const PublicProfileView: React.FC<Props> = ({ slug }) => {
  const { theme, toggleTheme } = usePublicProfileTheme();
  
  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  return (
    <div data-theme={theme}>
      {/* Theme toggle - fixed position */}
      <PublicProfileThemeToggle onToggle={toggleTheme} currentTheme={theme} />
      
      {/* Rest of the component */}
      <PublicProfileLayout ... />
    </div>
  );
};
```

---

## CSS Token Updates

### Glass Variables - Dark Mode Support

**File:** `frontend/src/index.css`

The design system already has dark mode glass variables defined under `[data-theme="dark"]`:

```css
/* Already exists - verify usage */
[data-theme="dark"] {
  --glass-1: rgba(15, 23, 42, 0.6);
  --glass-2: rgba(15, 23, 42, 0.4);
  --glass-border-1: rgba(255, 255, 255, 0.1);
  --glass-border-2: rgba(255, 255, 255, 0.05);
  --glass-background: rgba(15, 23, 42, 0.8);
  --shadow-glass: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}
```

**Issue:** Components use inline styles instead of CSS variables. Need to update components to use variables.

---

## Responsive Breakpoints

Using Tailwind's default breakpoints (already configured):

| Breakpoint | Min Width | CSS Class Prefix |
|------------|-----------|------------------|
| Mobile | 0 | (default) |
| sm | 640px | `sm:` |
| md | 768px | `md:` |
| lg | 1024px | `lg:` |
| xl | 1280px | `xl:` |
| 2xl | 1536px | `2xl:` |

---

## Accessibility Implementation

### Focus Management

```tsx
// All interactive elements need visible focus
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
```

### ARIA Labels

```tsx
// Theme toggle
<button aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>

// Social links
<a aria-label={`Visit ${platform} profile`}>

// Action buttons
<button aria-label="Download contact card">
```

### Skip Links

Add at top of `PublicProfileLayout`:
```tsx
<a 
  href="#profile-content" 
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded"
>
  Skip to content
</a>
```

---

## Performance Considerations

### Image Optimization

```tsx
// Logo with responsive sizes
<img
  src={logoUrl}
  srcSet={`${logoUrl}?w=64 64w, ${logoUrl}?w=128 128w, ${logoUrl}?w=256 256w`}
  sizes="(max-width: 640px) 80px, (max-width: 1024px) 96px, 128px"
  loading="eager" // Hero image loads eagerly
  alt={`${name} logo`}
/>

// Below-fold images
loading="lazy"
```

### Reduce Motion

```tsx
// Respect user preference
className="motion-reduce:animate-none motion-reduce:transition-none"
```

### Backdrop Filter Fallback

```css
@supports not (backdrop-filter: blur(12px)) {
  .glass-card {
    background: rgba(255, 255, 255, 0.95); /* Solid fallback */
  }
  [data-theme="dark"] .glass-card {
    background: rgba(15, 23, 42, 0.95);
  }
}
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `usePublicProfileTheme.ts` | **NEW** | Theme management hook |
| `PublicProfileThemeToggle.tsx` | **NEW** | Theme toggle button component |
| `GlassContainer.tsx` | MODIFY | Dark mode support, fix mix-blend |
| `HeroGlassCard.tsx` | MODIFY | Responsive sizes, dark mode classes |
| `StudioInfoCard.tsx` | MODIFY | Remove logo, simplify, responsive |
| `ContactMethodsCard.tsx` | MODIFY | Move buttons, responsive grid |
| `ServicesGlassGrid.tsx` | MODIFY | Responsive columns |
| `PublicProfileLayout.tsx` | MODIFY | Mobile-first grid, flex layout |
| `PublicProfileView.tsx` | MODIFY | Theme integration, toggle |
| `index.css` | MODIFY | Add public profile specific styles if needed |

---

## Testing Strategy

### Unit Tests

```typescript
// usePublicProfileTheme.test.ts
describe('usePublicProfileTheme', () => {
  it('should detect system dark mode preference');
  it('should persist manual selection to localStorage');
  it('should apply data-theme attribute');
  it('should toggle between light and dark');
});

// PublicProfileThemeToggle.test.tsx
describe('PublicProfileThemeToggle', () => {
  it('should render sun icon in dark mode');
  it('should render moon icon in light mode');
  it('should be keyboard accessible');
  it('should call onToggle when clicked');
});
```

### Visual Regression Tests

- Screenshot at 320px (iPhone SE)
- Screenshot at 375px (iPhone 12)
- Screenshot at 768px (iPad)
- Screenshot at 1024px (Desktop)
- Screenshot at 1440px (Large desktop)
- Each breakpoint in both light and dark mode

### Manual Testing Checklist

- [ ] iPhone SE (smallest supported)
- [ ] iPhone 14 Pro
- [ ] iPad Mini
- [ ] iPad Pro
- [ ] Android phone (Chrome)
- [ ] Desktop Chrome
- [ ] Desktop Firefox
- [ ] Desktop Safari
- [ ] Screen reader (VoiceOver)
- [ ] Keyboard-only navigation

---

## Migration Notes

This is a **non-breaking change** for existing users. The public profile URL structure remains the same (`/p/{slug}`). All existing profiles will automatically receive:

1. Responsive layout improvements
2. System theme detection
3. Manual theme toggle

No database migrations required. No API changes needed.

---

## Related Documents

- [Requirements Document](requirements.md)
- [docs/Features/COMPANY_PROFILE_AND_THEMES.md](../../docs/Features/COMPANY_PROFILE_AND_THEMES.md)
- [Tailwind Config](../../frontend/tailwind.config.js)
- [Design System CSS](../../frontend/src/index.css)
