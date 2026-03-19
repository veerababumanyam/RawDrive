# Phase 11: Public Page Redesign - Research

**Researched:** 2026-03-19
**Domain:** Frontend visual redesign (glassmorphism, animations, responsive), Backend SEO (HTML shell, OG images, JSON-LD)
**Confidence:** HIGH

## Summary

Phase 11 transforms existing public profile pages (`/u/:slug` personal, `/p/:slug` company) from functional but basic layouts into premium, Linktree-level experiences. The foundation from Phase 10 is solid: `PublicProfileRenderer`, `UnifiedThemeEngine`, `SectionRegistry`, `GlassContainer`, `ProfileBentoGrid`, and `ProfileGridItem` all exist and work. The codebase already has glassmorphism patterns (GlassContainer with animated blob orbs, HeroGlassCard with backdrop-blur-xl), a 4-column bento grid (ProfileBentoGrid), stagger entrance animations (ProfileGridItem with Framer Motion), and dark mode support via CSS custom properties. The redesign work is enhancement and polish of existing patterns, not a greenfield build.

The SEO challenge is real: current pages use `react-helmet-async` for meta tags, which works for Google (which executes JS) but fails for Facebook, Twitter, iMessage, and other social crawlers that don't execute JavaScript. The solution is a FastAPI HTML shell endpoint that renders `<head>` with OG/meta/JSON-LD server-side, with the React SPA hydrating the `<body>`. Pillow 10.4.0 is already installed in the backend for OG image generation -- no new dependencies needed.

**Primary recommendation:** Enhance existing GlassContainer and ProfileBentoGrid with responsive breakpoints, animated theme backgrounds, and Framer Motion stagger patterns. Add a new FastAPI endpoint that serves pre-rendered HTML shells for crawler SEO. Generate OG images with Pillow (already installed) on the backend.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Glassmorphism + Bento grid aesthetic -- frosted glass cards on animated gradient backgrounds, modular grid layout
- Theme accent + neutral base color strategy -- each theme defines accent color + gradient, text stays high-contrast
- System font stack + 1 display font -- fast loading, consistent cross-platform rendering
- Subtle micro-interactions -- hover lifts, stagger entrance animations, smooth scrolls (60fps, no jank on low-end devices)
- Mobile-first breakpoints: 375px -> 768px -> 1024px -> 1280px -- Bento grid reflows from 1->2->3 columns
- Dark mode via CSS `prefers-color-scheme` + theme variant auto-switch -- each theme has light/dark variant selected by system preference
- Mobile layout: single column stack with prioritized sections -- header/avatar first, bio, socials, contacts
- Touch: tap targets >=44px (WCAG compliant), swipe for gallery preview, pull-to-share
- Backend HTML shell with meta tags -- FastAPI renders `<head>` with OG/meta/JSON-LD from profile data, React hydrates the body
- JSON-LD schema: Person type for personal profiles, Organization type for company profiles
- Auto-generated OG images -- server-side image with avatar, name, title on branded background using theme colors
- Canonical URLs: `https://rawdrive.ai/u/{slug}` and `https://rawdrive.ai/p/{slug}`
- CSS gradient animations with Framer Motion for particle/motion effects
- Performance budget: animations must not cause jank on mid-range mobile (test with 4x CPU throttle)
- 3-4 animated theme options minimum (gradient shift, subtle particles, wave motion, aurora effect)
- Fallback: reduce motion for `prefers-reduced-motion` users

### Claude's Discretion
- Exact Bento grid column/row span configuration per section per breakpoint
- Animated gradient keyframe timings and easing functions
- OG image generation library choice (Pillow, Satori, or similar)
- Glassmorphism blur/opacity values per theme
- Section entrance animation stagger timing

### Deferred Ideas (OUT OF SCOPE)
- Drag-and-drop section reordering (Phase 12)
- Gallery preview blocks and booking CTA (Phase 13)
- Custom CSS injection (v2)
- Profile A/B testing (v2)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PUBPG-01 | Public personal profile (`/u/:slug`) renders mobile-first responsive layout across all devices | Bento grid responsive breakpoints (375->768->1024->1280), existing ProfileBentoGrid enhanced with column reflow |
| PUBPG-02 | Public company profile (`/p/:slug`) renders mobile-first responsive layout across all devices | Same responsive grid system; PublicProfileRenderer already handles both profile types via SectionRegistry |
| PUBPG-03 | User can select from animated theme backgrounds (gradients, particles, subtle motion effects) | CSS @keyframes gradient animations + Framer Motion for particles/wave; 3-4 theme options; GlassContainer already has animated orbs |
| PUBPG-04 | Bento grid layout polished with proper spacing, transitions, and responsive breakpoints | ProfileBentoGrid enhanced from `grid-cols-1 md:grid-cols-4` to full breakpoint cascade with gap scaling |
| PUBPG-06 | Both public pages support dark mode rendering | UnifiedThemeEngine already resolves light/dark variants; enhance with `prefers-color-scheme` listener + real-time switching |
| SEO-01 | Public profile pages include proper meta tags (title, description, keywords) | FastAPI HTML shell endpoint renders `<head>` server-side; react-helmet-async for client-side hydration |
| SEO-02 | Public profile pages include Open Graph and Twitter Card metadata | HTML shell includes og:title, og:description, og:image, twitter:card tags; OG image auto-generated with Pillow |
| SEO-03 | Public profile pages include JSON-LD Person/Organization structured data | SEOSchemaService already generates Person and ProfessionalService schemas; embed in HTML shell |
| SEO-04 | Public profile pages are crawlable by search engines (not blocked by client-side rendering) | FastAPI HTML shell serves complete `<head>` to all visitors (not just crawlers); React hydrates body |

</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| framer-motion | ^11.0.0 (installed) | Stagger entrance animations, AnimatePresence, motion variants | Already used in ProfileGridItem; project standard for all animations |
| react-helmet-async | ^2.0.4 (installed) | Client-side meta tag management | Already used in both PublicPersonalProfilePage and PublicProfilePage |
| tailwindcss | ^4.0.0 (installed) | Responsive utilities, glassmorphism classes, dark mode | Project CSS framework; v4 uses CSS-first config in index.css |
| Pillow | 10.4.0 (installed) | Server-side OG image generation | Already in backend requirements.txt; used for photo processing |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | (installed) | Profile data fetching | Replace raw useState/useEffect with useQuery for caching |
| lucide-react | (installed) | Icons for social links, contact info | Already used in profile pages |
| @heroicons/react | (installed) | Additional icon set | Existing project standard |

### No New Packages Required

This phase requires **zero new npm or pip packages**. All functionality is achievable with:
- CSS `backdrop-filter` + `@keyframes` for glassmorphism and gradient animations
- Framer Motion (installed) for entrance animations and particle effects
- Pillow (installed) for server-side OG image generation
- FastAPI Jinja2 templates (FastAPI built-in) for HTML shell rendering

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pillow for OG images | Satori (@vercel/og) | Satori is JS-only; would need Node.js sidecar. Pillow already installed, Python-native, simpler. |
| CSS @keyframes for gradients | Framer Motion animate() | CSS is more performant for continuous background animations; Framer Motion better for entrance/exit |
| FastAPI HTML shell | Traefik crawler middleware | HTML shell is simpler, benefits all visitors (not just crawlers), no Traefik plugin complexity |
| prefers-color-scheme CSS | JS matchMedia polling | CSS media query is instant, no JS needed; JS hook only for React state sync |

**OG Image Decision: Use Pillow.** Pillow is already installed (10.4.0), Python-native (no Node.js sidecar), and sufficient for the simple OG image layout needed (avatar + name + title on gradient background). Satori requires a separate JS runtime and adds infrastructure complexity for no benefit in this context.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  components/features/profile/
    public/
      GlassContainer.tsx          # ENHANCE: add theme-specific gradient + animation variant support
      HeroGlassCard.tsx           # ENHANCE: glassmorphism values from theme tokens
      PublicProfileLayout.tsx     # ENHANCE: responsive bento grid breakpoints
      ProfileBody.tsx             # ENHANCE: responsive sections
      animations/
        GradientShiftBackground.tsx   # NEW: animated gradient shift theme
        ParticleBackground.tsx        # NEW: subtle floating particle theme
        WaveBackground.tsx            # NEW: wave motion theme
        AuroraBackground.tsx          # NEW: aurora/northern lights theme
        AnimatedBackgroundRenderer.tsx # NEW: dispatcher for theme animation type
      __tests__/
        GlassContainer.test.tsx       # EXISTS: enhance with responsive/animation tests
    shared/
      PublicProfileRenderer.tsx   # ENHANCE: pass animation theme, responsive grid config
      UnifiedThemeEngine.ts       # ENHANCE: add animation_type to ThemeTokens
      SectionRegistry.ts          # ENHANCE: per-breakpoint gridSpan configurations
    ProfileBentoGrid.tsx          # ENHANCE: responsive column reflow 1->2->3->4
    ProfileGridItem.tsx           # ENHANCE: stagger delay from parent, hover lift

backend/src/app/
  api/v1/
    personal_profile.py           # ENHANCE: HTML shell endpoint
    company_profile.py            # ENHANCE: HTML shell endpoint
  services/
    seo_service.py                # EXISTS: already generates Person + Business JSON-LD
    og_image_service.py           # NEW: Pillow-based OG image generator
  templates/
    profile_shell.html            # NEW: Jinja2 HTML shell template
```

### Pattern 1: Responsive Bento Grid with Column Reflow
**What:** CSS Grid with breakpoint-driven column changes: 1 col (mobile) -> 2 col (tablet) -> 3 col (desktop) -> 4 col (wide)
**When to use:** All public profile pages
**Example:**
```typescript
// ProfileBentoGrid.tsx - enhanced
export const ProfileBentoGrid: React.FC<ProfileBentoGridProps> = ({ children, className }) => {
  return (
    <div className={cn(
      'grid gap-3 w-full p-4',
      'grid-cols-1',           // 375px+ (mobile): single column
      'sm:grid-cols-2 sm:gap-4',  // 768px+ (tablet): 2 columns
      'lg:grid-cols-3 lg:gap-5',  // 1024px+ (desktop): 3 columns
      'xl:grid-cols-4 xl:gap-6',  // 1280px+ (wide): 4 columns
      className
    )}>
      {children}
    </div>
  );
};
```

### Pattern 2: Animated Theme Background Dispatcher
**What:** Each theme specifies an animation_type; a dispatcher component renders the appropriate animated background
**When to use:** PublicProfileRenderer wraps content in the selected animated background
**Example:**
```typescript
// AnimatedBackgroundRenderer.tsx
type AnimationType = 'gradient-shift' | 'particles' | 'wave' | 'aurora' | 'none';

export const AnimatedBackgroundRenderer: React.FC<{
  animationType: AnimationType;
  themeTokens: ThemeTokens;
  children: React.ReactNode;
}> = ({ animationType, themeTokens, children }) => {
  const prefersReducedMotion = useReducedMotion(); // from framer-motion

  if (prefersReducedMotion) {
    // Static gradient fallback
    return <div style={{ background: themeTokens['--theme-gradient'] }}>{children}</div>;
  }

  switch (animationType) {
    case 'gradient-shift': return <GradientShiftBackground tokens={themeTokens}>{children}</GradientShiftBackground>;
    case 'particles': return <ParticleBackground tokens={themeTokens}>{children}</ParticleBackground>;
    case 'wave': return <WaveBackground tokens={themeTokens}>{children}</WaveBackground>;
    case 'aurora': return <AuroraBackground tokens={themeTokens}>{children}</AuroraBackground>;
    default: return <GlassContainer>{children}</GlassContainer>;
  }
};
```

### Pattern 3: Framer Motion Stagger Entrance
**What:** Parent variant with staggerChildren drives child entrance animations
**When to use:** All section components entering the viewport
**Example:**
```typescript
// Container variant
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
      when: "beforeChildren",
    },
  },
};

// Child variant (used by ProfileGridItem)
const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// Usage in ProfileBentoGrid
<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {sections.map((section, i) => (
    <motion.div key={section.id} variants={itemVariants}>
      <ProfileGridItem .../>
    </motion.div>
  ))}
</motion.div>
```

### Pattern 4: FastAPI HTML Shell for SEO
**What:** FastAPI serves a complete HTML page with pre-rendered `<head>` for all profile URLs; React app hydrates `<body>`
**When to use:** All `/u/:slug` and `/p/:slug` routes
**Example:**
```python
# Backend endpoint
from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="app/templates")

@public_router.get("/{slug}/page", response_class=HTMLResponse)
async def get_profile_html_shell(slug: str, request: Request):
    """Serve HTML shell with pre-rendered meta tags for SEO crawlers."""
    service = get_personal_profile_service()
    data = await service.get_public_profile(slug)
    seo_schema = SEOSchemaService.generate_person_schema(data, f"https://rawdrive.ai/u/{slug}")
    og_image_url = f"https://rawdrive.ai/api/v1/u/{slug}/og-image"

    return templates.TemplateResponse("profile_shell.html", {
        "request": request,
        "title": data.get("display_name", "Profile"),
        "description": data.get("bio", ""),
        "og_image": og_image_url,
        "canonical_url": f"https://rawdrive.ai/u/{slug}",
        "json_ld": seo_schema,
        "profile_type": "personal",
    })
```

### Pattern 5: Pillow OG Image Generation
**What:** Server-side image generation with avatar composited on branded gradient background
**When to use:** OG image endpoint called by social crawlers and HTML shell og:image tag
**Example:**
```python
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO

class OGImageService:
    WIDTH = 1200
    HEIGHT = 630

    def generate_og_image(
        self, name: str, title: str, avatar_bytes: bytes | None,
        accent_color: str, primary_color: str,
    ) -> bytes:
        """Generate 1200x630 OG image with gradient, avatar, name, and title."""
        img = Image.new('RGB', (self.WIDTH, self.HEIGHT))
        draw = ImageDraw.Draw(img)

        # Draw gradient background using theme colors
        self._draw_gradient(draw, primary_color, accent_color)

        # Composite avatar (circular crop)
        if avatar_bytes:
            avatar = Image.open(BytesIO(avatar_bytes)).resize((200, 200))
            # Apply circular mask and paste
            ...

        # Draw name and title text
        draw.text((center_x, y), name, font=heading_font, fill="white", anchor="mm")
        draw.text((center_x, y+50), title, font=body_font, fill="white", anchor="mm")

        buffer = BytesIO()
        img.save(buffer, format='PNG', optimize=True)
        return buffer.getvalue()
```

### Anti-Patterns to Avoid
- **Animating backdrop-filter:** Never animate blur values on glassmorphism elements -- causes severe jank on mobile. Set static blur, animate opacity/transform only.
- **Multiple simultaneous gradient animations:** Limit to 1 animated gradient background per viewport. The existing GlassContainer blob animation is fine because it uses transform (GPU-composited), not background repaints.
- **Large will-change surfaces:** Don't apply `will-change: transform` to the full-page background -- promotes the entire page to a GPU layer, increasing memory usage. Apply only to individual animated elements.
- **User-agent sniffing for SEO:** Don't serve different HTML to crawlers vs users. Serve the same HTML shell with complete meta tags to everyone. The React SPA hydrates on top for all visitors equally.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gradient animation | Custom JS requestAnimationFrame loop | CSS @keyframes with background-position or @property | CSS animations are GPU-composited, 60fps on mobile; JS animations cause main thread jank |
| Particle effects | Canvas 2D particle system | Framer Motion motion.div with randomized transforms | Lightweight, respects prefers-reduced-motion, no Canvas overhead |
| Dark mode detection | Manual matchMedia polling | CSS prefers-color-scheme + Framer Motion useReducedMotion() | Built-in browser API, instant, no JS execution needed for initial render |
| JSON-LD schemas | Manual JSON construction | Existing SEOSchemaService | Already generates Person and ProfessionalService schemas correctly |
| Meta tag management | Manual DOM manipulation | react-helmet-async (client) + Jinja2 template (server) | Both already in use; Helmet handles client-side, Jinja2 handles server-side |
| OG image text layout | Manual pixel coordinate math with Pillow Draw | Pillow with pre-calculated layout constants | Keep it simple: fixed 1200x630, centered text, avatar top-center |

**Key insight:** The codebase already has 80% of the glassmorphism, animation, and theme infrastructure. The work is enhancement and polish, not creation from scratch.

## Common Pitfalls

### Pitfall 1: backdrop-filter Performance on Mobile
**What goes wrong:** Multiple glassmorphism cards with high blur values (20px+) cause frame drops on mid-range Android devices. GPU memory pressure causes compositing to fall back to CPU.
**Why it happens:** Each backdrop-filter element creates a separate compositing layer; blur radius scales GPU cost quadratically.
**How to avoid:** Limit blur to 8-12px on mobile (sm breakpoint), max 2-3 glassmorphic elements per viewport, use `will-change: backdrop-filter` only on elements that will animate. The existing GlassContainer correctly uses reduced blur on mobile (`blur-[60px] sm:blur-[80px] lg:blur-[100px]` on background orbs, not on glass cards).
**Warning signs:** Paint time > 16ms in Chrome DevTools Performance panel; "Compositing layer count" warnings.

### Pitfall 2: OG Tags Invisible to Social Crawlers
**What goes wrong:** react-helmet-async injects meta tags via JavaScript; Facebook, Twitter, iMessage, Slack, and Discord crawlers don't execute JS. Shared profile links show generic "RawDrive" with no image.
**Why it happens:** Social crawlers fetch raw HTML, parse `<head>`, and ignore `<script>` tags entirely.
**How to avoid:** FastAPI HTML shell endpoint renders complete `<head>` server-side for ALL visitors (not just crawlers). React SPA loads inside the body and react-helmet-async updates tags client-side for navigation. This is NOT user-agent sniffing -- the same HTML goes to everyone.
**Warning signs:** Test with `curl -s URL | grep og:image` -- if no results, crawlers can't see your tags.

### Pitfall 3: CSS @property Browser Support Gap
**What goes wrong:** CSS @property for animating custom properties (gradient color stops) is not supported in Firefox as of 2025/2026.
**Why it happens:** Firefox hasn't implemented CSS Houdini's @property rule.
**How to avoid:** Use background-position animation for gradient shift (universal support), not @property-based color interpolation. Alternatively, animate using CSS hue-rotate() filter on a static gradient (works everywhere). Test in Firefox explicitly.
**Warning signs:** Gradient appears static in Firefox while animated in Chrome/Safari.

### Pitfall 4: Stagger Animation Causing Layout Shift
**What goes wrong:** Section components animating from opacity:0 + y:20 cause cumulative layout shift (CLS) as they appear, especially on slow connections.
**Why it happens:** Elements with opacity:0 still take up space, but transform: translateY(20px) shifts them, causing visible reflow.
**How to avoid:** Use `transform: translateY(20px)` paired with `opacity: 0` (element reserves space but is invisible), NOT `height: 0` or `display: none`. Wrap in `position: relative` container with fixed min-height on mobile.
**Warning signs:** CLS score > 0.1 in Lighthouse.

### Pitfall 5: Dark Mode Flash (FOUC)
**What goes wrong:** Page loads with light theme, then flashes to dark after JS executes and detects `prefers-color-scheme: dark`.
**Why it happens:** UnifiedThemeEngine resolves theme in useEffect (after first render). Server-rendered HTML shell has no theme context.
**How to avoid:** HTML shell template includes inline `<script>` that reads `prefers-color-scheme` and sets `data-theme` attribute on `<html>` before React hydrates. CSS variables respond instantly. Also set `color-scheme: light dark` in CSS to hint the browser.
**Warning signs:** Brief white flash before dark mode activates on dark-mode devices.

### Pitfall 6: OG Image Caching
**What goes wrong:** Every social share request regenerates the OG image from scratch, hitting the database and avatar storage for each request.
**Why it happens:** No caching layer on the OG image endpoint.
**How to avoid:** Cache generated OG images in Redis (TTL 24 hours) keyed by `og:{profile_type}:{slug}:{updated_at}`. Invalidate when profile is updated. Set `Cache-Control: public, max-age=86400` header.
**Warning signs:** Slow social preview generation, high database load from crawler traffic.

## Code Examples

### Glassmorphism Card with Theme-Aware Values
```css
/* Glass card pattern -- values from research */
.glass-card {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);  /* Safari */
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--theme-radius, 1rem);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

/* Dark mode variant */
@media (prefers-color-scheme: dark) {
  .glass-card {
    background: rgba(15, 15, 30, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
}

/* Mobile: reduce blur for performance */
@media (max-width: 768px) {
  .glass-card {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
}

/* Reduced motion: remove hover lift */
@media (prefers-reduced-motion: reduce) {
  .glass-card { transition: none; }
}
```

### Animated Gradient Background (Pure CSS, 60fps)
```css
/* Gradient shift animation -- animates background-position (GPU composited) */
@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.animated-gradient {
  background: linear-gradient(
    -45deg,
    var(--theme-primary),
    var(--theme-accent),
    var(--theme-primary),
    var(--theme-accent)
  );
  background-size: 400% 400%;
  animation: gradient-shift 15s ease infinite;
  will-change: background-position;
}

@media (prefers-reduced-motion: reduce) {
  .animated-gradient {
    animation: none;
    background-size: 100% 100%;
  }
}
```

### Dark Mode Detection Hook (React)
```typescript
// useColorScheme.ts
import { useState, useEffect } from 'react';

export function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setScheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return scheme;
}
```

### Jinja2 HTML Shell Template
```html
<!-- profile_shell.html -->
<!DOCTYPE html>
<html lang="en" data-theme="{{ 'dark' if dark_mode else 'light' }}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{ title }} | RawDrive</title>
  <meta name="description" content="{{ description }}" />
  <link rel="canonical" href="{{ canonical_url }}" />

  <!-- Open Graph -->
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="{{ title }}" />
  <meta property="og:description" content="{{ description }}" />
  <meta property="og:image" content="{{ og_image }}" />
  <meta property="og:url" content="{{ canonical_url }}" />
  <meta property="og:site_name" content="RawDrive" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{{ title }}" />
  <meta name="twitter:description" content="{{ description }}" />
  <meta name="twitter:image" content="{{ og_image }}" />

  <!-- JSON-LD -->
  <script type="application/ld+json">{{ json_ld | safe }}</script>

  <!-- Prevent dark mode flash -->
  <script>
    (function(){
      var d = window.matchMedia('(prefers-color-scheme:dark)').matches;
      document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    })();
  </script>

  {% if not indexable %}
  <meta name="robots" content="noindex, nofollow" />
  {% endif %}
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS @property for gradient color animation | background-position animation on oversized gradient | 2024-2025 | @property still lacks Firefox support; background-position is universal and GPU-composited |
| Headless browser for OG images | Pillow/Satori direct rendering | 2023-2024 | 10x faster, no browser overhead, serverless-friendly |
| User-agent sniffing for crawler SEO | Universal HTML shell for all visitors | 2024-2025 | Same HTML for everyone; no cloaking risk; simpler architecture |
| Manual dark mode toggle state | prefers-color-scheme with CSS custom properties | 2024 | Instant, no JS flash, respects OS preference |
| Tailwind v3 config file | Tailwind v4 CSS-first with @import "tailwindcss" | 2025 | No tailwind.config.js needed; @custom-variant in index.css |

**Deprecated/outdated:**
- `tailwind.config.js` -- project uses Tailwind v4 CSS-first configuration in `index.css`
- `@apply` heavy patterns -- Tailwind v4 prefers utility classes directly in JSX
- Separate dark mode toggle component -- system preference auto-detection preferred for public pages

## Open Questions

1. **HTML Shell Serving Strategy**
   - What we know: FastAPI can render Jinja2 templates. Current profile pages are served by Vite/React router.
   - What's unclear: Should the HTML shell replace the Vite SPA entry point for profile routes, or should Traefik/Nginx route `/u/:slug` and `/p/:slug` to FastAPI first?
   - Recommendation: FastAPI serves HTML shell for `/u/:slug` and `/p/:slug` routes. The shell includes the React app bundle via script tag. Vite dev server proxies these routes to FastAPI in dev mode. This avoids Traefik middleware complexity.

2. **OG Image Font Rendering**
   - What we know: Pillow requires font files on disk for ImageFont.truetype().
   - What's unclear: Which fonts to bundle in the Docker image for consistent rendering.
   - Recommendation: Bundle Inter (the system font used in themes) as a .ttf in `backend/src/app/assets/fonts/`. Use it for all OG images regardless of theme font.

3. **Theme Animation Type Storage**
   - What we know: Current themes in `constants/themes.ts` have no animation_type field.
   - What's unclear: Whether animation_type should be per-theme (baked into PREBUILT_THEMES) or per-user (stored in profile preferences).
   - Recommendation: Add `animation_type` field to PREBUILT_THEMES. Each theme gets a default animation. Users don't pick animation separately from theme in Phase 11 (that's Phase 12 editor territory).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend), pytest (backend) |
| Config file | `frontend/vite.config.ts` (Vitest inline config) |
| Quick run command | `cd frontend && pnpm test src/components/features/profile` |
| Full suite command | `cd frontend && pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUBPG-01 | Personal profile renders responsive layout | unit + snapshot | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/PublicProfileRenderer.test.tsx` | Yes (enhance) |
| PUBPG-02 | Company profile renders responsive layout | unit + snapshot | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/PublicProfileRenderer.test.tsx` | Yes (enhance) |
| PUBPG-03 | Animated theme backgrounds render + respect reduced motion | unit | `cd frontend && pnpm test src/components/features/profile/public/__tests__/AnimatedBackgrounds.test.tsx` | No - Wave 0 |
| PUBPG-04 | Bento grid responsive breakpoints | unit | `cd frontend && pnpm test src/components/features/profile/__tests__/ProfileBentoGrid.test.tsx` | No - Wave 0 |
| PUBPG-06 | Dark mode renders correctly | unit | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/UnifiedThemeEngine.test.ts` | Yes (enhance) |
| SEO-01 | Meta tags rendered in HTML shell | integration | `docker exec rawdrive-backend pytest tests/test_personal_profile_seo.py -x` | No - Wave 0 |
| SEO-02 | OG + Twitter Card tags present | integration | `docker exec rawdrive-backend pytest tests/test_personal_profile_seo.py -x` | No - Wave 0 |
| SEO-03 | JSON-LD schema included | unit | `docker exec rawdrive-backend pytest tests/test_seo_service.py -x` | No - Wave 0 |
| SEO-04 | HTML shell servable without JS | integration | `docker exec rawdrive-backend pytest tests/test_personal_profile_seo.py -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test src/components/features/profile --run`
- **Per wave merge:** `cd frontend && pnpm test --run`
- **Phase gate:** Full frontend + backend test suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/features/profile/public/__tests__/AnimatedBackgrounds.test.tsx` -- covers PUBPG-03
- [ ] `frontend/src/components/features/profile/__tests__/ProfileBentoGrid.test.tsx` -- covers PUBPG-04
- [ ] `backend/tests/test_personal_profile_seo.py` -- covers SEO-01, SEO-02, SEO-04
- [ ] `backend/tests/test_seo_service.py` -- covers SEO-03 (enhance existing if present)
- [ ] `backend/tests/test_og_image_service.py` -- covers OG image generation
- [ ] `backend/src/app/templates/` directory creation -- Jinja2 templates for HTML shell

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `PublicProfileRenderer.tsx`, `UnifiedThemeEngine.ts`, `GlassContainer.tsx`, `ProfileBentoGrid.tsx`, `ProfileGridItem.tsx`, `SectionRegistry.ts`, `seo_service.py`, `personal_profile.py`
- Installed package versions verified: framer-motion ^11.0.0, react-helmet-async ^2.0.4, tailwindcss ^4.0.0, Pillow 10.4.0
- [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter) -- browser support and syntax
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) -- media query API
- [MDN prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme) -- dark mode detection
- [FastAPI Templates](https://fastapi.tiangolo.com/advanced/templates/) -- Jinja2 template rendering

### Secondary (MEDIUM confidence)
- [Glassmorphism Implementation Guide 2025](https://playground.halfaccessible.com/blog/glassmorphism-design-trend-implementation-guide) -- performance data (15-25% GPU overhead, 12fps drop on mid-range Android)
- [CSS Gradient Animation 2026](https://frontend-hero.com/how-to-animate-gradients-css) -- @property vs background-position comparison
- [Framer Motion Stagger](https://www.framer.com/motion/stagger/) -- official stagger API docs
- [Josh Comeau prefers-reduced-motion](https://www.joshwcomeau.com/react/prefers-reduced-motion/) -- React hook pattern
- [SitePoint 60fps Mobile Animations](https://www.sitepoint.com/achieve-60-fps-mobile-animations-with-css3/) -- GPU compositing best practices

### Tertiary (LOW confidence)
- [Django OG Images with Pillow](https://www.djangotricks.com/blog/2025/01/creating-open-graph-images-in-django-for-improved-social-media-sharing/) -- Pillow OG pattern (Django, not FastAPI, but Pillow code is framework-agnostic)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified as installed in codebase; zero new dependencies
- Architecture: HIGH -- patterns derived from direct analysis of existing Phase 10 code
- Pitfalls: HIGH -- glassmorphism/animation performance issues well-documented across multiple sources; SEO crawler limitation is factual
- Animated themes: MEDIUM -- specific keyframe timings and easing are discretionary; general performance patterns are HIGH
- OG image with Pillow: MEDIUM -- pattern verified from Django example; Pillow API is stable but exact text layout needs implementation-time tuning

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain; CSS/animation patterns don't change rapidly)
