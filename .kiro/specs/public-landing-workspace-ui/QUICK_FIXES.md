# Landing Page Quick Fixes - Priority Actions

## 🔴 Critical Fixes (Do First)

### 1. Fix Color Contrast (WCAG Compliance)

**File:** `frontend/src/components/landing/sections/HeroSection.tsx`

```tsx
// Line 237 - CHANGE:
<p className="text-lg sm:text-xl text-slate-300">

// TO:
<p className="text-lg sm:text-xl text-slate-200">
```

**File:** `frontend/src/components/landing/sections/ProblemSolutionSection.tsx`

```tsx
// Line 108 - CHANGE:
<span className="text-sm text-slate-300">Sound Familiar?</span>

// TO:
<span className="text-sm text-slate-200">Sound Familiar?</span>
```

**File:** `frontend/src/styles/landing.css`

```css
/* ADD after line 21: */
:root {
  --landing-text-on-dark: #e2e8f0; /* 7.2:1 contrast */
  --landing-text-secondary-on-dark: #cbd5e1; /* 5.8:1 contrast */
}

/* UPDATE line 20: */
--landing-text-secondary: #cbd5e1; /* Was: #94a3b8 */
```

### 2. Improve Image Alt Text

**File:** `frontend/src/components/landing/sections/HeroSection.tsx`

```tsx
// Line 414-418 - CHANGE:
<img
  src={card.src}
  alt={card.title}
  className="w-full h-full object-cover"
  loading="lazy"
/>

// TO:
<img
  src={card.src}
  alt={`${card.title} gallery preview showing ${card.count} professional photos`}
  className="w-full h-full object-cover"
  loading="lazy"
  decoding="async"
/>
```

### 3. Fix Newsletter Form Accessibility

**File:** `frontend/src/components/landing/layout/LandingFooter.tsx`

```tsx
// Line 213-227 - CHANGE:
<label htmlFor="footer-email" className="sr-only">
  Email address
</label>
<input
  id="footer-email"
  type="email"
  placeholder="Enter your email"
  ...
/>

// TO:
<label htmlFor="footer-email" className="block text-sm text-white mb-2">
  Email address
</label>
<input
  id="footer-email"
  type="email"
  placeholder="Enter your email"
  aria-describedby="footer-email-error"
  ...
/>
<span id="footer-email-error" className="sr-only" role="alert"></span>
```

## 🟡 High Priority Fixes

### 4. Improve Typography Sizes

**File:** `frontend/src/styles/landing.css`

```css
/* UPDATE line 62-64: */
--landing-text-4xl: clamp(2rem, 1.5rem + 2vw, 2.5rem); /* Was: 2.25rem - 3.5rem */
--landing-text-5xl: clamp(2.5rem, 2rem + 2.5vw, 3rem); /* Was: 3rem - 4.5rem */
--landing-text-6xl: clamp(3rem, 2.5rem + 2.5vw, 3.75rem); /* Was: 3.75rem - 5.5rem */
```

### 5. Reduce Container Width

**File:** `frontend/src/styles/landing.css`

```css
/* UPDATE line 69: */
--landing-container-max: 1280px; /* Was: 1400px */
```

### 6. Improve Line Heights

**File:** `frontend/src/styles/landing.css`

```css
/* UPDATE line 304: */
.landing-body {
  line-height: 1.75; /* Was: 1.7 */
}

/* ADD: */
.landing-body-lg {
  line-height: 1.75; /* Was: 1.7 */
}
```

## 🟢 Medium Priority Fixes

### 7. Add Loading States

**File:** `frontend/src/components/landing/ui/SkeletonCard.tsx` (NEW FILE)

```tsx
export const SkeletonCard: React.FC = () => (
  <div className="animate-pulse rounded-2xl bg-white/5 border border-white/10 p-6">
    <div className="h-48 bg-white/5 rounded-lg mb-4" />
    <div className="h-4 bg-white/5 rounded w-3/4 mb-2" />
    <div className="h-4 bg-white/5 rounded w-1/2" />
  </div>
);
```

### 8. Add Aria-Live Regions

**File:** `frontend/src/components/landing/sections/HeroSection.tsx`

```tsx
// Line 203-206 - CHANGE:
<span className="landing-live-counter text-slate-300">
  <span className="landing-live-dot" aria-hidden="true" />
  <span>{liveViewers} viewing now</span>
</span>

// TO:
<div className="landing-live-counter text-slate-200" aria-live="polite" aria-atomic="true">
  <span className="landing-live-dot" aria-hidden="true" />
  <span>{liveViewers} viewing now</span>
</div>
```

### 9. Improve Mobile Hero Height

**File:** `frontend/src/components/landing/sections/HeroSection.tsx`

```tsx
// Line 143 - CHANGE:
className="relative min-h-screen pt-[72px] flex flex-col"

// TO:
className="relative min-h-[85vh] md:min-h-screen pt-[72px] flex flex-col"
```

## Testing Checklist

After making these fixes, test:

- [ ] Color contrast with WebAIM Contrast Checker
- [ ] Screen reader navigation (NVDA/JAWS/VoiceOver)
- [ ] Keyboard-only navigation
- [ ] Mobile responsiveness (iPhone SE, iPad)
- [ ] Lighthouse accessibility score (target: 95+)
- [ ] Form submission and validation

## Quick Wins Summary

1. **5 minutes:** Fix color contrast in 3 files
2. **10 minutes:** Improve image alt text
3. **15 minutes:** Fix newsletter form accessibility
4. **20 minutes:** Adjust typography and spacing
5. **30 minutes:** Add loading states

**Total time:** ~1.5 hours for critical fixes

