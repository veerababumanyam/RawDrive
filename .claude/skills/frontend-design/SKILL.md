---
name: frontend-design
aliases: [ui-design, frontend, react-components, pages, premium-ui, cinematic, landing-page]
description: Create distinctive, production-grade frontend interfaces with high design quality for RawDrive. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics while leveraging RawDrive's design system.
---

# RawDrive Frontend Design Skill

Create **distinctive, production-grade, futuristic** frontend interfaces that avoid generic "AI slop" aesthetics. RawDrive is a **premium photography SaaS platform**. Every interface should feel:

- **Cinematic** - Like a high-end photo editing suite
- **Premium** - Luxury brand quality for professional photographers
- **Memorable** - Distinctive enough to be recognized instantly

> **For brand colors, tokens, and component APIs**: See the `design-system` skill.

## Design Thinking Process

Before coding, commit to a **BOLD** aesthetic direction:

### Aesthetic Directions

| Direction | Characteristics | Best For |
|-----------|----------------|----------|
| **Cinematic Dark** | Deep blacks, dramatic lighting, film grain | Gallery views, photo editing |
| **Premium Editorial** | Generous whitespace, serif headlines, magazine layout | Portfolio, landing pages |
| **Futuristic Glass** | Glassmorphism, aurora gradients, floating elements | Dashboards, AI features |
| **Neo-Retro** | Film camera aesthetics, vintage color grades | Photography features |

**CRITICAL**: Choose a clear direction and execute with precision. Ask: "What's the ONE thing someone will remember?"

## Premium Effects Toolkit

### Aurora Backgrounds

```typescript
const AuroraBackground = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden">
    <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] animate-aurora-slow">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-500/30 rounded-full blur-[128px]" />
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-primary-600/30 rounded-full blur-[128px]" />
    </div>
  </div>
);
```

### Dramatic Shadows & Glows

```typescript
// Floating Card with lift effect
className="shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)] hover:shadow-[0_30px_80px_-10px_rgba(0,0,0,0.4)] hover:-translate-y-1 transition-all duration-500"

// Glowing border (use brand colors from design-system)
className="before:absolute before:inset-0 before:rounded-2xl before:p-[1px] before:bg-gradient-to-br before:from-accent-500 before:to-primary-600 before:-z-10 before:opacity-50 before:blur-sm"
```

### Motion & Micro-Interactions

```typescript
// Staggered reveal for lists
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-fade-in-up opacity-0"
    style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'forwards' }}
  >
    {item.content}
  </div>
))}

// Scroll-triggered animation hook
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

## Component Patterns

### Premium Photo Card

```typescript
const PremiumPhotoCard = ({ photo, onSelect }) => (
  <div className="group relative overflow-hidden rounded-2xl bg-neutral-900">
    <img
      src={photo.thumbnailUrl}
      alt={photo.title}
      className="w-full aspect-[4/3] object-cover transition-transform duration-700 group-hover:scale-105"
      loading="lazy"
    />
    {/* Gradient overlay on hover */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    {/* Slide-up content */}
    <div className="absolute inset-x-0 bottom-0 p-4 transform translate-y-full group-hover:translate-y-0 transition-transform duration-500">
      <h3 className="font-serif text-lg text-white truncate">{photo.title}</h3>
    </div>
  </div>
);
```

### AI Feature Hero

```typescript
const AIFeatureHero = () => (
  <section className="relative min-h-[80vh] flex items-center overflow-hidden">
    <AuroraBackground />
    <div className="max-w-7xl mx-auto px-6 py-20">
      {/* Premium badge */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
        <Sparkles className="w-4 h-4 text-gold-500 animate-pulse-glow" />
        <span className="text-sm font-medium text-white/80">AI-Powered</span>
      </div>
      {/* Headline with gradient */}
      <h1 className="text-5xl md:text-7xl font-serif font-bold text-white animate-fade-in-up">
        Your Photos,{' '}
        <span className="bg-gradient-to-r from-accent-400 to-primary-500 bg-clip-text text-transparent">
          Intelligently Curated
        </span>
      </h1>
      <div className="flex gap-4 mt-10 animate-fade-in-up animation-delay-200">
        <AppButton variant="accent" size="lg" className="shadow-accent-glow">
          <Sparkles className="w-5 h-5 mr-2" /> Try AI Features
        </AppButton>
      </div>
    </div>
  </section>
);
```

## Anti-Patterns (NEVER Do)

| Problem | Fix |
|---------|-----|
| Generic fonts (Inter, Roboto, Arial) | Use serif for headlines, vary fonts |
| Purple gradient on white | Use brand colors: blue-cyan or gold |
| Centered everything | Embrace asymmetry |
| Stock illustrations | Use photography or abstract gradients |
| Boring shadows (`shadow-md`) | Use dramatic shadows or glows |
| Rainbow gradients | Stick to 2-3 brand colors |
| Same aesthetic every time | Vary between directions |

## Execution Checklist

- [ ] **Bold Direction**: Clear, intentional aesthetic chosen?
- [ ] **Brand Alignment**: Using design-system tokens and components?
- [ ] **Premium Feel**: Would a professional photographer be impressed?
- [ ] **Motion**: Key moments animated (stagger, reveal, hover)?
- [ ] **Dark Mode**: Tested in both themes?
- [ ] **Accessible**: WCAG 2.1 AA compliant?
- [ ] **No AI Slop**: Avoided generic patterns?

## Creative Philosophy

Every interface should feel like it belongs in a design portfolio. Not safe. Not generic. **Exceptional.**

NEVER use generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Cliched color schemes (purple gradients on white)
- Predictable layouts and patterns
- Cookie-cutter design lacking context-specific character

**Interpret creatively.** Make unexpected choices that feel genuinely designed. No design should be the same. Vary between light/dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, etc.) across generations.

**Match complexity to vision.** Maximalist designs need elaborate code with extensive animations. Minimalist designs need restraint, precision, and careful attention to spacing and typography. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back.
