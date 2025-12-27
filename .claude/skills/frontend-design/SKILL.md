---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality for RawDrive. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics while leveraging RawDrive's design system.
---

# RawDrive Frontend Design Skill

This skill guides creation of **distinctive, production-grade, futuristic** frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices, while leveraging RawDrive's comprehensive design system.

## Philosophy

RawDrive is a **premium photography SaaS platform**. Every interface should feel:
- **Cinematic** - Like a high-end photo editing suite
- **Futuristic** - Forward-thinking, cutting-edge aesthetics
- **Premium** - Luxury brand quality befitting professional photographers
- **Memorable** - Distinctive enough to be recognized instantly

## Design Thinking Process

Before coding, understand the context and commit to a **BOLD** aesthetic direction:

### 1. Context Analysis
- **Purpose**: What problem does this interface solve? Who uses it?
- **User Journey**: Where does this fit in the photographer's workflow?
- **Emotional Response**: What should users FEEL when they see this?

### 2. Aesthetic Direction (Pick ONE and commit fully)

| Direction | Characteristics | Best For |
|-----------|----------------|----------|
| **Cinematic Dark** | Deep blacks, dramatic lighting effects, film grain textures, spotlight focus areas | Gallery views, photo editing, AI features |
| **Premium Editorial** | Generous whitespace, serif headlines, magazine layout, asymmetric grids | Portfolio pages, client proofs, landing pages |
| **Futuristic Glass** | Glassmorphism, aurora gradients, floating elements, subtle depth layers | Dashboards, AI tools, premium features |
| **Brutalist Pro** | Raw typography, stark contrasts, grid-breaking elements, intentional tension | Creative tools, batch operations, power-user interfaces |
| **Organic Flow** | Subtle curves, natural gradients, breathing animations, soft transitions | Onboarding, empty states, wellness-focused UX |
| **Neo-Retro** | Film camera aesthetics, vintage color grades, analog textures, nostalgic warmth | Photography-specific features, galleries |

### 3. Differentiation Questions
- What makes this **UNFORGETTABLE**?
- What's the **ONE thing** someone will remember?
- How does this **transcend** typical SaaS design?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is **intentionality**, not intensity.

---

## RawDrive Design System Integration

### Required Imports

```typescript
// ALWAYS use RawDrive's component library
import { AppButton, AppInput, AppCard, AppBadge } from '@/components/ui';
import { Modal, Toast, Progress, Spinner, Skeleton } from '@/components/ui';
import { PhotoGrid, MasonryGrid, FileUploader } from '@/components/ui';
import { AppShell, Sidebar } from '@/components/layout';
import { useTheme, useToastActions } from '@/hooks';
```

### Brand Color Palette

```typescript
// Primary - Blue (from logo gradient start)
const primary = {
  main: 'var(--color-primary-600)',     // #2563EB
  hover: 'var(--color-primary-700)',    // #1D4ED8
  light: 'var(--color-primary-100)',    // #DBEAFE
  glow: 'rgba(37, 99, 235, 0.4)',
};

// Accent - Cyan (from logo gradient end)
const accent = {
  main: 'var(--color-accent-500)',      // #06B6D4
  hover: 'var(--color-accent-600)',     // #0891B2
  light: 'var(--color-accent-100)',     // #CFFAFE
  glow: 'rgba(6, 182, 212, 0.4)',
};

// Gold - Premium Accent (luxury features)
const gold = {
  main: 'var(--color-gold-500)',        // #D4AF37
  light: 'var(--color-gold-200)',       // #FDE68A
  glow: 'rgba(212, 175, 55, 0.4)',
};
```

### Typography That Commands Attention

```typescript
// NEVER use: Inter, Roboto, Arial, system fonts for display
// ALWAYS: Pair distinctive display fonts with refined body fonts

// Heading (Display) - Use serif for luxury feel
className="font-serif text-4xl font-bold tracking-tight"

// Body - Keep clean and readable
className="font-sans text-base leading-relaxed"

// Accents & Labels
className="font-mono text-xs uppercase tracking-widest"

// Gradient Text (Premium Look)
className="text-gradient bg-gradient-to-r from-accent-500 to-primary-600 bg-clip-text text-transparent"
```

---

## Futuristic Effects Toolkit

### 1. Glassmorphism Layers

```typescript
// Standard Glass
<div className="glass bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl">

// Premium Dark Glass
<div className="glass-dark bg-neutral-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl">

// Hero Glass with Aurora
<div className="
  relative overflow-hidden rounded-3xl
  bg-gradient-to-br from-white/10 via-white/5 to-transparent
  backdrop-blur-2xl
  border border-white/20
  before:absolute before:inset-0 before:bg-gradient-to-r
  before:from-accent-500/20 before:via-transparent before:to-primary-500/20
  before:animate-aurora
">
```

### 2. Aurora & Gradient Mesh Backgrounds

```typescript
// Aurora Background Effect
const AuroraBackground = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden">
    <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] animate-aurora-slow">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-500/30 rounded-full blur-[128px]" />
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-primary-600/30 rounded-full blur-[128px]" />
      <div className="absolute bottom-1/4 left-1/2 w-72 h-72 bg-gold-500/20 rounded-full blur-[128px]" />
    </div>
  </div>
);

// Mesh Gradient (Static)
<div className="
  bg-[radial-gradient(ellipse_at_top_left,_var(--color-accent-500)_0%,_transparent_50%),
      radial-gradient(ellipse_at_bottom_right,_var(--color-primary-600)_0%,_transparent_50%)]
  bg-neutral-950
">
```

### 3. Dramatic Shadows & Depth

```typescript
// Floating Card with Dramatic Shadow
<div className="
  relative
  bg-surface rounded-2xl p-6
  shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)]
  hover:shadow-[0_30px_80px_-10px_rgba(0,0,0,0.4)]
  hover:-translate-y-1
  transition-all duration-500 ease-out
">

// Glowing Border Effect
<div className="
  relative rounded-2xl p-6 bg-surface
  before:absolute before:inset-0 before:rounded-2xl
  before:p-[1px] before:bg-gradient-to-br before:from-accent-500 before:to-primary-600
  before:-z-10 before:opacity-50 before:blur-sm
">

// Inner Glow (Premium)
<div className="
  bg-surface rounded-2xl p-6
  shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]
  ring-1 ring-white/10
">
```

### 4. Motion & Micro-Interactions

```typescript
// Staggered Reveal on Page Load
const StaggeredList = ({ items }) => (
  <div className="space-y-4">
    {items.map((item, i) => (
      <div
        key={item.id}
        className="animate-fade-in-up opacity-0"
        style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'forwards' }}
      >
        {item.content}
      </div>
    ))}
  </div>
);

// Magnetic Hover Effect
const MagneticButton = ({ children }) => {
  const [transform, setTransform] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) * 0.1;
    const y = (e.clientY - rect.top - rect.height / 2) * 0.1;
    setTransform({ x, y });
  };

  return (
    <AppButton
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTransform({ x: 0, y: 0 })}
      style={{ transform: `translate(${transform.x}px, ${transform.y}px)` }}
      className="transition-transform duration-200"
    >
      {children}
    </AppButton>
  );
};

// Breathing/Pulse Animation
<div className="animate-pulse-glow">
  <div className="absolute inset-0 bg-accent-500/20 rounded-full blur-2xl animate-pulse" />
  <div className="relative">Content</div>
</div>

// Scroll-Triggered Animations (use Intersection Observer)
const useScrollReveal = () => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setIsVisible(true),
      { threshold: 0.1 }
    );
    ref.current && observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
};
```

### 5. Premium Textures & Grain

```typescript
// Film Grain Overlay (Photography Aesthetic)
<div className="relative">
  <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none mix-blend-overlay" />
  {children}
</div>

// CSS for noise texture
// Add to index.css:
// .bg-noise { background-image: url("data:image/svg+xml,..."); }

// Subtle Grid Pattern
<div className="
  bg-[linear-gradient(to_right,_var(--color-border)_1px,_transparent_1px),
      linear-gradient(to_bottom,_var(--color-border)_1px,_transparent_1px)]
  bg-[size:64px_64px]
  opacity-20
">
```

### 6. Asymmetric & Grid-Breaking Layouts

```typescript
// Offset Grid
<div className="grid grid-cols-12 gap-6">
  <div className="col-span-7 -ml-12"> {/* Bleeds left */}
  <div className="col-span-5 col-start-8 mt-24"> {/* Offset down */}
</div>

// Overlapping Elements
<div className="relative">
  <div className="absolute -top-8 -right-8 z-10">
    <AppBadge variant="gold">Premium</AppBadge>
  </div>
  <AppCard>...</AppCard>
</div>

// Diagonal Section Divider
<div className="relative">
  <div className="absolute inset-0 bg-primary-600 transform -skew-y-3 origin-left" />
  <div className="relative py-20">{children}</div>
</div>
```

---

## Component Patterns for RawDrive

### Premium Photo Card

```typescript
const PremiumPhotoCard = ({ photo, onSelect }) => (
  <div className="group relative overflow-hidden rounded-2xl bg-neutral-900">
    {/* Image */}
    <img
      src={photo.thumbnailUrl}
      alt={photo.title}
      className="w-full aspect-[4/3] object-cover transition-transform duration-700 group-hover:scale-105"
      loading="lazy"
    />

    {/* Gradient Overlay */}
    <div className="
      absolute inset-0
      bg-gradient-to-t from-black/80 via-black/20 to-transparent
      opacity-0 group-hover:opacity-100
      transition-opacity duration-500
    " />

    {/* Content */}
    <div className="
      absolute inset-x-0 bottom-0 p-4
      transform translate-y-full group-hover:translate-y-0
      transition-transform duration-500 ease-out
    ">
      <h3 className="font-serif text-lg text-white truncate">{photo.title}</h3>
      <p className="text-sm text-white/60 mt-1">{photo.date}</p>
    </div>

    {/* Selection Indicator */}
    <div className="
      absolute top-4 left-4
      w-6 h-6 rounded-full border-2 border-white/50
      flex items-center justify-center
      bg-white/10 backdrop-blur-sm
      opacity-0 group-hover:opacity-100
      transition-opacity duration-300
    ">
      <Check className="w-4 h-4 text-white opacity-0 group-data-[selected=true]:opacity-100" />
    </div>

    {/* AI Badge */}
    {photo.aiEnhanced && (
      <div className="absolute top-4 right-4">
        <AppBadge variant="accent" className="backdrop-blur-sm">
          <Sparkles className="w-3 h-3 mr-1" /> AI Enhanced
        </AppBadge>
      </div>
    )}
  </div>
);
```

### Futuristic Dashboard Card

```typescript
const DashboardMetricCard = ({ icon: Icon, label, value, trend, trendUp }) => (
  <div className="
    relative overflow-hidden
    bg-gradient-to-br from-surface via-surface to-surface-hover
    rounded-2xl p-6
    border border-border/50
    shadow-card hover:shadow-card-hover
    transition-all duration-300
    group
  ">
    {/* Background Glow on Hover */}
    <div className="
      absolute -top-12 -right-12 w-32 h-32
      bg-accent-500/20 rounded-full blur-3xl
      opacity-0 group-hover:opacity-100
      transition-opacity duration-500
    " />

    {/* Icon */}
    <div className="
      inline-flex items-center justify-center
      w-12 h-12 rounded-xl
      bg-gradient-to-br from-accent-500/20 to-primary-600/20
      text-accent-500
      mb-4
    ">
      <Icon className="w-6 h-6" />
    </div>

    {/* Content */}
    <p className="text-sm text-text-secondary font-medium">{label}</p>
    <p className="text-3xl font-bold text-text-primary mt-1 font-serif">{value}</p>

    {/* Trend */}
    <div className={`
      flex items-center gap-1 mt-3 text-sm font-medium
      ${trendUp ? 'text-success' : 'text-error'}
    `}>
      {trendUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      {trend}
    </div>
  </div>
);
```

### AI Feature Hero Section

```typescript
const AIFeatureHero = () => (
  <section className="relative min-h-[80vh] flex items-center overflow-hidden">
    {/* Aurora Background */}
    <div className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-neutral-950" />
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent-500/30 rounded-full blur-[200px] animate-float" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-primary-600/30 rounded-full blur-[200px] animate-float-delayed" />
    </div>

    {/* Grid Pattern */}
    <div className="absolute inset-0 bg-grid-pattern opacity-20" />

    {/* Content */}
    <div className="max-w-7xl mx-auto px-6 py-20 relative z-10">
      <div className="max-w-3xl">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
          <Sparkles className="w-4 h-4 text-gold-500 animate-pulse-glow" />
          <span className="text-sm font-medium text-white/80">AI-Powered</span>
        </div>

        {/* Headline */}
        <h1 className="
          text-5xl md:text-7xl font-serif font-bold
          text-white leading-tight
          animate-fade-in-up
        ">
          Your Photos,{' '}
          <span className="text-gradient bg-gradient-to-r from-accent-400 to-primary-500">
            Intelligently Curated
          </span>
        </h1>

        {/* Subtitle */}
        <p className="
          text-xl text-white/60 mt-6 leading-relaxed
          animate-fade-in-up animation-delay-100
        ">
          Let AI analyze, organize, and surface your best work.
          Face detection, smart albums, and instant search - all in one place.
        </p>

        {/* CTA */}
        <div className="flex gap-4 mt-10 animate-fade-in-up animation-delay-200">
          <AppButton variant="accent" size="lg" className="shadow-accent-glow">
            <Sparkles className="w-5 h-5 mr-2" />
            Try AI Features
          </AppButton>
          <AppButton variant="ghost" size="lg" className="text-white hover:bg-white/10">
            Learn More
          </AppButton>
        </div>
      </div>
    </div>
  </section>
);
```

---

## Animation Classes Reference

Add these to your Tailwind config or index.css:

```css
/* Aurora Animation */
@keyframes aurora {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(3deg) scale(1.05); }
  50% { transform: rotate(-3deg) scale(1.1); }
  75% { transform: rotate(2deg) scale(1.02); }
}
.animate-aurora { animation: aurora 20s ease-in-out infinite; }
.animate-aurora-slow { animation: aurora 40s ease-in-out infinite; }

/* Float */
@keyframes float {
  0%, 100% { transform: translateY(0) translateX(0); }
  50% { transform: translateY(-20px) translateX(10px); }
}
.animate-float { animation: float 8s ease-in-out infinite; }
.animate-float-delayed { animation: float 8s ease-in-out infinite 2s; }

/* Glow Pulse */
@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}
.animate-pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }

/* Shimmer */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.animate-shimmer {
  animation: shimmer 2s infinite;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
}
```

---

## Anti-Patterns (NEVER Do These)

### Generic AI Slop Indicators

| Problem | Example | Fix |
|---------|---------|-----|
| **Overused fonts** | Inter, Roboto, System UI | Use serif for headlines, distinctive sans for body |
| **Purple gradient on white** | `from-purple-500 to-pink-500` | Use brand colors: blue-to-cyan or gold accents |
| **Centered everything** | All text center-aligned | Embrace asymmetry, left-align body text |
| **Equal spacing** | Same padding everywhere | Create rhythm with varied spacing |
| **Stock illustrations** | Generic vector people | Use photography, abstract gradients, or nothing |
| **Boring shadows** | `shadow-md` | Use dramatic shadows, glows, or none |
| **Rainbow gradients** | 5+ color gradients | Stick to 2-3 brand colors max |
| **Rounded everything** | `rounded-full` on all cards | Mix sharp and round strategically |

### Design System Violations

```typescript
// NEVER
<button className="bg-blue-500 px-4 py-2 rounded">
<div className="bg-white shadow-md p-4">
<input className="border border-gray-300 rounded px-3 py-2">

// ALWAYS
<AppButton variant="primary">
<AppCard variant="elevated">
<AppInput label="Field" />
```

---

## Execution Checklist

Before submitting any frontend code:

- [ ] **Bold Direction**: Is there a clear, intentional aesthetic?
- [ ] **Brand Alignment**: Uses RawDrive's colors, typography, components?
- [ ] **Premium Feel**: Would a professional photographer be impressed?
- [ ] **Motion**: Are key moments animated? (Page load, hovers, transitions)
- [ ] **Dark Mode**: Tested and stunning in both themes?
- [ ] **Responsive**: Looks incredible from 320px to 4K?
- [ ] **Accessible**: Meets WCAG 2.1 AA? (Contrast, focus, ARIA)
- [ ] **Memorable**: What's the ONE thing someone will remember?
- [ ] **No AI Slop**: Avoided generic patterns and stock aesthetics?

---

## Remember

> "Claude is capable of extraordinary creative work. Don't hold back - show what can truly be created when thinking outside the box and committing fully to a distinctive vision."

Every interface should feel like it belongs in a design portfolio. Not safe. Not generic. **Exceptional.**

RawDrive photographers deserve a tool that's as visually stunning as their work.
