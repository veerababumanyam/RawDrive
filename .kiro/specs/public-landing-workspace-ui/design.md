# Design Document: Public Landing Page & Workspace UI

## Overview

This design document outlines the technical architecture for RawDrive's public-facing landing page, marketing pages, authentication flows, and workspace shell. The landing page is designed to be a visually stunning, conversion-optimized experience with unlimited creative freedom, while the workspace leverages existing UI components for consistency.

### Key Design Principles

1. **Landing Page Independence**: Public pages have their own component library and styling, separate from workspace UI
2. **Mobile-First**: All designs start from mobile and scale up
3. **Performance-Driven**: Lighthouse 90+ score through code-splitting, lazy loading, and optimized assets
4. **Accessibility-First**: WCAG 2.1 AA compliance built into every component
5. **SEO-Optimized**: Semantic HTML, structured data, and proper meta tags

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Router                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │   Public Pages        │    │      Workspace Pages          │  │
│  │   (Landing Design)    │    │   (App UI Components)         │  │
│  │                       │    │                               │  │
│  │  /                    │    │  /workspace                   │  │
│  │  /features            │    │  /workspace/galleries         │  │
│  │  /pricing             │    │  /workspace/albums            │  │
│  │  /how-it-works        │    │  /workspace/clients           │  │
│  │  /faq                 │    │  /workspace/settings          │  │
│  │  /signin              │    │                               │  │
│  │  /signup              │    │                               │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
│           │                              │                       │
│           ▼                              ▼                       │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │ components/landing/   │    │  components/ui/               │  │
│  │ (Glass morphism,      │    │  (AppButton, AppCard, etc.)   │  │
│  │  animations, etc.)    │    │                               │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Route Structure

```typescript
// Public routes (landing design system)
/                    → LandingPage
/features            → FeaturesPage
/pricing             → PricingPage
/how-it-works        → HowItWorksPage
/faq                 → FAQPage
/signin              → SignInPage
/signup              → SignUpPage

// Protected routes (workspace UI components)
/workspace           → WorkspaceDashboard
/workspace/galleries → GalleriesPage
/workspace/albums    → AlbumsPage
/workspace/clients   → ClientsPage
/workspace/bookings  → BookingsPage
/workspace/settings  → SettingsPage
```

## Components and Interfaces

### Landing Page Components (`frontend/src/components/landing/`)

```
landing/
├── layout/
│   ├── LandingHeader.tsx      # Sticky nav with glass morphism
│   ├── LandingFooter.tsx      # Footer with links and social
│   └── LandingLayout.tsx      # Wrapper with gradient background
├── sections/
│   ├── HeroSection.tsx        # Hero with product preview
│   ├── StatsSection.tsx       # Animated counters
│   ├── FeaturesSection.tsx    # Feature cards grid
│   ├── TestimonialsSection.tsx # Carousel/grid testimonials
│   ├── PricingSection.tsx     # Pricing cards with toggle
│   └── CTASection.tsx         # Final call-to-action
├── ui/
│   ├── GlassCard.tsx          # Glass morphism card
│   ├── AnimatedCounter.tsx    # Number counting animation
│   ├── FeatureCard.tsx        # Individual feature card
│   ├── PricingCard.tsx        # Pricing tier card
│   ├── TestimonialCard.tsx    # Customer testimonial
│   ├── TrustBadge.tsx         # Trust indicators
│   └── GradientButton.tsx     # CTA buttons with gradients
├── animations/
│   ├── FadeIn.tsx             # Fade-in wrapper
│   ├── SlideUp.tsx            # Slide-up wrapper
│   ├── StaggerChildren.tsx    # Staggered animation container
│   └── FloatingElement.tsx    # Continuous float animation
└── seo/
    ├── SEOHead.tsx            # Meta tags component
    └── StructuredData.tsx     # JSON-LD schemas
```

### Workspace Components (using existing `frontend/src/components/ui/`)

```
components/
├── ui/                        # Existing components
│   ├── AppButton.tsx
│   ├── AppCard.tsx
│   ├── AppInput.tsx
│   ├── AppBadge.tsx
│   └── Modal.tsx
└── workspace/                 # New workspace-specific
    ├── WorkspaceLayout.tsx    # Main layout with sidebar
    ├── Sidebar.tsx            # Collapsible navigation
    ├── WorkspaceHeader.tsx    # Top bar with user menu
    └── DashboardCards.tsx     # Dashboard summary cards
```

### Component Interfaces

```typescript
// Landing Components
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  blur?: 'sm' | 'md' | 'lg';      // 8px, 12px, 20px
  opacity?: number;               // 0.1 - 0.3
  border?: boolean;
  hover?: boolean;
}

interface AnimatedCounterProps {
  end: number;
  duration?: number;              // ms, default 2000
  prefix?: string;                // e.g., "$"
  suffix?: string;                // e.g., "+"
  decimals?: number;
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
}

interface PricingCardProps {
  name: string;
  price: { monthly: number; annual: number };
  features: string[];
  highlighted?: boolean;
  ctaText: string;
  ctaHref: string;
}

interface TestimonialCardProps {
  quote: string;
  author: {
    name: string;
    title: string;
    avatar: string;
  };
  rating: number;
}

// Workspace Components
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeItem: string;
}

interface WorkspaceLayoutProps {
  children: React.ReactNode;
}
```

## Data Models

### Landing Page Data

```typescript
// Static content - can be moved to CMS later
interface LandingContent {
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    primaryCTA: { text: string; href: string };
    secondaryCTA: { text: string; href: string };
    trustPoints: string[];
  };
  stats: Array<{
    icon: string;
    value: number;
    suffix: string;
    label: string;
  }>;
  features: Array<{
    icon: string;
    title: string;
    description: string;
    category: string;
  }>;
  testimonials: Array<{
    quote: string;
    author: { name: string; title: string; avatar: string };
    rating: number;
  }>;
  pricing: {
    plans: Array<{
      id: string;
      name: string;
      description: string;
      price: { monthly: number; annual: number };
      features: string[];
      highlighted: boolean;
    }>;
  };
}

// SEO Data
interface SEOData {
  title: string;
  description: string;
  keywords: string[];
  ogImage: string;
  canonicalUrl: string;
  structuredData: {
    organization: object;
    product: object;
    faq?: object;
  };
}
```

### Workspace Data (from `docs/TechnicalSpecs/`)

```typescript
// Navigation items per galleries_client_portal.json
interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
}

// Dashboard summary
interface DashboardSummary {
  totalGalleries: number;
  totalPhotos: number;
  storageUsed: string;
  recentActivity: Activity[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified. After reflection to eliminate redundancy, these are the core testable properties:

### Property 1: Mobile Touch Target Size
*For any* interactive element (button, link, input) on mobile viewport, the element's tap target SHALL have a minimum dimension of 48px.
**Validates: Requirements 1.5, 13.1**

### Property 2: Testimonial Data Completeness
*For any* testimonial displayed, the testimonial SHALL contain a quote, author name, business type, and star rating (1-5).
**Validates: Requirements 5.1**

### Property 3: Pricing Feature Display
*For any* pricing plan displayed, all listed features SHALL have a visual checkmark indicator.
**Validates: Requirements 6.4**

### Property 4: Semantic HTML Structure
*For any* public page rendered, the page SHALL contain semantic HTML5 elements (header, main, footer) with proper landmark roles.
**Validates: Requirements 9.1**

### Property 5: Meta Tags Presence
*For any* public page rendered, the page SHALL contain meta tags for title, description, og:title, og:description, and twitter:card.
**Validates: Requirements 9.2**

### Property 6: Heading Hierarchy
*For any* page rendered, the page SHALL have exactly one H1 element and headings SHALL follow a logical hierarchy (no skipped levels).
**Validates: Requirements 9.5**

### Property 7: Image Optimization
*For any* image element rendered, the image SHALL have srcset attribute for responsive loading and loading="lazy" for below-fold images.
**Validates: Requirements 13.2, 14.2**

### Property 8: Minimum Text Size
*For any* body text element, the computed font-size SHALL be at least 16px on mobile viewports.
**Validates: Requirements 13.4**

### Property 9: Focus Visibility
*For any* interactive element, when focused via keyboard, the element SHALL have a visible focus indicator (outline or ring).
**Validates: Requirements 15.1**

### Property 10: ARIA Labels
*For any* interactive element without visible text content, the element SHALL have an aria-label or aria-labelledby attribute.
**Validates: Requirements 15.2**

### Property 11: Form Label Association
*For any* form input element, the input SHALL have an associated label element (via htmlFor/id or wrapping).
**Validates: Requirements 15.4**

### Property 12: Decorative Element Hiding
*For any* decorative image or icon, the element SHALL have aria-hidden="true" or role="presentation".
**Validates: Requirements 15.5**

## Error Handling

### Client-Side Errors

```typescript
// Error boundary for landing pages
class LandingErrorBoundary extends React.Component {
  state = { hasError: false };
  
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  
  render() {
    if (this.state.hasError) {
      return <LandingErrorFallback />;
    }
    return this.props.children;
  }
}

// Form validation errors
interface FormError {
  field: string;
  message: string;
}

// Auth errors
const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  OAUTH_FAILED: 'Google sign-in failed. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  RATE_LIMITED: 'Too many attempts. Please wait before trying again.',
};
```

### Loading States

```typescript
// Skeleton loaders for sections
const HeroSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-12 bg-gray-700/50 rounded w-3/4 mb-4" />
    <div className="h-6 bg-gray-700/50 rounded w-1/2 mb-8" />
    <div className="h-12 bg-gray-700/50 rounded w-32" />
  </div>
);

// Image loading with blur placeholder
const OptimizedImage = ({ src, alt, ...props }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      className={cn('transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
      onLoad={() => setLoaded(true)}
      {...props}
    />
  );
};
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

1. **Unit Tests**: Verify specific component rendering and behavior
2. **Property-Based Tests**: Verify universal properties hold across all inputs

### Property-Based Testing Library

**Library**: `fast-check` (TypeScript-native, excellent React integration)

**Configuration**:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    // Run 100 iterations per property test
    testTimeout: 30000,
  },
});

// Property test setup
import fc from 'fast-check';

fc.configureGlobal({
  numRuns: 100,
  verbose: true,
});
```

### Test File Structure

```
frontend/src/
├── components/landing/
│   ├── ui/
│   │   ├── GlassCard.tsx
│   │   ├── GlassCard.test.tsx           # Unit tests
│   │   └── GlassCard.property.test.tsx  # Property tests
│   └── sections/
│       ├── HeroSection.tsx
│       └── HeroSection.test.tsx
├── pages/
│   ├── LandingPage.tsx
│   ├── LandingPage.test.tsx
│   └── LandingPage.property.test.tsx    # SEO/accessibility properties
└── __tests__/
    └── accessibility.property.test.tsx   # Cross-cutting a11y properties
```

### Unit Test Examples

```typescript
// HeroSection.test.tsx
describe('HeroSection', () => {
  it('renders headline and CTAs', () => {
    render(<HeroSection />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Start Free Trial')).toBeInTheDocument();
  });

  it('displays trust badges', () => {
    render(<HeroSection />);
    expect(screen.getByText(/No credit card required/)).toBeInTheDocument();
  });
});
```

### Property Test Examples

```typescript
// accessibility.property.test.tsx
/**
 * **Feature: public-landing-workspace-ui, Property 9: Focus Visibility**
 * **Validates: Requirements 15.1**
 */
describe('Property 9: Focus Visibility', () => {
  it('all interactive elements have visible focus indicators', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...interactiveElements),
        (element) => {
          render(element);
          const el = screen.getByRole('button') || screen.getByRole('link');
          el.focus();
          const styles = window.getComputedStyle(el);
          return (
            styles.outlineWidth !== '0px' ||
            styles.boxShadow !== 'none'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: public-landing-workspace-ui, Property 1: Mobile Touch Target Size**
 * **Validates: Requirements 1.5, 13.1**
 */
describe('Property 1: Mobile Touch Target Size', () => {
  it('all buttons have minimum 48px tap target', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allButtons),
        (ButtonComponent) => {
          render(<ButtonComponent />);
          const button = screen.getByRole('button');
          const rect = button.getBoundingClientRect();
          return rect.height >= 48 && rect.width >= 48;
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/landing.spec.ts
test.describe('Landing Page', () => {
  test('loads within performance budget', async ({ page }) => {
    const metrics = await page.evaluate(() => performance.getEntriesByType('navigation')[0]);
    expect(metrics.loadEventEnd - metrics.startTime).toBeLessThan(3000);
  });

  test('navigation works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.click('[data-testid="mobile-menu-button"]');
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  });
});
```

## Visual Design Specifications

### Color Palette (Landing Pages)

```css
:root {
  /* Primary gradient background */
  --landing-bg-start: #0a1628;
  --landing-bg-end: #1a2744;
  
  /* Accent colors */
  --landing-accent: #3b82f6;
  --landing-accent-hover: #60a5fa;
  --landing-accent-glow: rgba(59, 130, 246, 0.5);
  
  /* Glass morphism */
  --glass-bg: rgba(255, 255, 255, 0.1);
  --glass-border: rgba(255, 255, 255, 0.2);
  --glass-blur: 12px;
  
  /* Text */
  --landing-text-primary: #ffffff;
  --landing-text-secondary: #94a3b8;
  --landing-text-muted: #64748b;
}
```

### Typography Scale

```css
:root {
  /* Font family */
  --font-display: 'Inter', system-ui, sans-serif;
  
  /* Size scale (fluid) */
  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
  --text-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 1.25rem + 1.25vw, 2rem);
  --text-3xl: clamp(1.875rem, 1.5rem + 1.875vw, 2.5rem);
  --text-4xl: clamp(2.25rem, 1.75rem + 2.5vw, 3.5rem);
  --text-5xl: clamp(3rem, 2rem + 5vw, 4.5rem);
}
```

### Glass Morphism Variants

```css
.glass-sm {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.glass-md {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.glass-lg {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

### Animation Presets (Framer Motion)

```typescript
export const animations = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.5 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: 'easeOut' },
  },
  stagger: {
    animate: { transition: { staggerChildren: 0.1 } },
  },
  float: {
    animate: {
      y: [0, -10, 0],
      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
    },
  },
  scale: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { type: 'spring', stiffness: 400, damping: 17 },
  },
};
```

## File Structure

```
frontend/
├── public/
│   ├── logo.svg                    # Full logo (to be created)
│   ├── logo-dark.svg               # Dark variant
│   ├── favicon-16x16.png           # Existing
│   ├── favicon-32x32.png           # Existing
│   ├── apple-touch-icon.png        # Existing
│   ├── android-chrome-192x192.png  # Existing
│   ├── android-chrome-512x512.png  # Existing
│   ├── sitemap.xml                 # Generated
│   └── robots.txt                  # SEO
├── src/
│   ├── components/
│   │   ├── landing/                # NEW: Landing page components
│   │   │   ├── layout/
│   │   │   ├── sections/
│   │   │   ├── ui/
│   │   │   ├── animations/
│   │   │   └── seo/
│   │   ├── workspace/              # NEW: Workspace shell
│   │   │   ├── WorkspaceLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── WorkspaceHeader.tsx
│   │   └── ui/                     # Existing app components
│   ├── pages/
│   │   ├── public/                 # NEW: Public pages
│   │   │   ├── LandingPage.tsx
│   │   │   ├── FeaturesPage.tsx
│   │   │   ├── PricingPage.tsx
│   │   │   ├── HowItWorksPage.tsx
│   │   │   ├── FAQPage.tsx
│   │   │   ├── SignInPage.tsx
│   │   │   └── SignUpPage.tsx
│   │   └── workspace/              # NEW: Workspace pages
│   │       ├── DashboardPage.tsx
│   │       └── ...
│   ├── styles/
│   │   ├── landing.css             # NEW: Landing-specific styles
│   │   └── ...
│   └── data/
│       └── landing-content.ts      # NEW: Static content
└── ...
```
