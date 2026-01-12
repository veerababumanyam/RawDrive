# Sidebar & Navigation Component Standards

## 🚨 Critical: 90% of Glassmorphism Visibility Issues Occur in Sidebars

### The Problem (From Your Screenshot)

| Element | Current Issue | Impact |
|---------|---------------|--------|
| "NEURAL DNA" text | Light gray (`text-gray-300`) | Unreadable in light mode |
| Icons | White/light (`text-white/50`) | Invisible on light glass |
| Chevrons (▼) | Washed out (`text-gray-200`) | Can't tell if expandable |
| Input placeholders | Too light (`text-white/30`) | Can't see where to type |
| Mode toggle | No distinction | Can't tell what's selected |

---

## The Fix: Color Contrast Rules

### Text Colors

```tsx
// ❌ WRONG - Your current code
<span className="text-gray-300 dark:text-gray-400">NEURAL DNA</span>

// ✅ CORRECT - High contrast in both modes
<span className="text-slate-800 dark:text-white">NEURAL DNA</span>
```

### Icon Colors

```tsx
// ❌ WRONG
<Icon className="text-white/50" />

// ✅ CORRECT
<Icon className="text-slate-700 dark:text-slate-200" />
```

### Input Placeholders

```tsx
// ❌ WRONG
<input 
  placeholder="Search..." 
  className="placeholder:text-white/30"
/>

// ✅ CORRECT
<input 
  placeholder="Search..." 
  className="text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
/>
```

---

## Complete Navigation Item Component

```tsx
// components/ui/nav-item.tsx
import { ChevronDown, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  isOpen?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function NavItem({ icon: Icon, label, isOpen, onClick, children }: NavItemProps) {
  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors group"
      >
        <div className="flex items-center gap-3">
          {/* ✅ Icon - Clearly visible */}
          <Icon className="h-5 w-5 text-slate-700 dark:text-slate-200 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" />
          
          {/* ✅ Text - High contrast */}
          <span className="text-sm font-medium text-slate-800 dark:text-white tracking-wide uppercase">
            {label}
          </span>
        </div>
        
        {/* ✅ Chevron - Visible */}
        {onClick && (
          <ChevronDown 
            className={cn(
              "h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        )}
      </button>

      {children && isOpen && (
        <div className="pl-12 pr-4 py-2 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}
```

---

## Mode Toggle Component (Light/Dark/System)

```tsx
// components/ui/mode-toggle.tsx
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const modes = [
    { value: 'light', icon: Sun, label: 'LIGHT' },
    { value: 'dark', icon: Moon, label: 'DARK' },
    { value: 'system', icon: Monitor, label: 'SYSTEM' },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
        Visual Mode
      </h3>
      
      <div className="flex gap-2">
        {modes.map(({ value, icon: Icon, label }) => {
          const isActive = theme === value;
          
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex-1 flex flex-col items-center gap-2 px-4 py-3 rounded-xl",
                "transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                isActive
                  ? // ✅ Active: Solid background, high contrast
                    "bg-white dark:bg-slate-800 shadow-md text-slate-900 dark:text-white"
                  : // ✅ Inactive: Glass effect, visible text
                    "bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 border border-black/8 dark:border-white/10"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium tracking-wide">{label}</span>
              {isActive && <div className="w-1 h-1 rounded-full bg-sky-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Key Points:**
- **Active state:** Solid background with `shadow-md` for elevation
- **Inactive state:** Glass with visible text (`slate-600`/`slate-400`)
- **Border:** Subtle definition on inactive buttons
- **Indicator dot:** Visual feedback for active state

---

## Search/Input Component

```tsx
// components/ui/sidebar-input.tsx
import { Search, X } from "lucide-react";

interface SidebarInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SidebarInput({ value, onChange, placeholder = "Search..." }: SidebarInputProps) {
  return (
    <div className="relative">
      {/* ✅ Search icon - Visible */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        <Search className="h-4 w-4 text-slate-500 dark:text-slate-400" />
      </div>

      {/* ✅ Input - High contrast */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-10 pr-10 rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-black/8 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
      />

      {/* Clear button */}
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

---

## Quick Fix Cheat Sheet

Copy-paste these classes to fix visibility immediately:

```tsx
// Primary text (menu items, titles)
className="text-slate-800 dark:text-white"

// Secondary text (descriptions, subtitles)
className="text-slate-600 dark:text-slate-300"

// Tertiary text (captions, helpers)
className="text-slate-500 dark:text-slate-400"

// Icons (primary)
className="text-slate-700 dark:text-slate-200"

// Icons (secondary - chevrons, indicators)
className="text-slate-500 dark:text-slate-400"

// Input text
className="text-slate-900 dark:text-white"

// Input placeholders
className="placeholder:text-slate-400 dark:placeholder:text-slate-500"

// Active backgrounds (selected states)
className="bg-white dark:bg-slate-800 shadow-md"

// Interactive backgrounds (buttons, clickable cards)
className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl hover:bg-white dark:hover:bg-slate-700"

// Borders (definition)
className="border-black/8 dark:border-white/10"

// Dividers
className="border-t border-black/8 dark:border-white/10"
```

---

## Visibility Testing Checklist

Test in **BOTH** light and dark mode:

### Light Mode
- [ ] Primary text clearly readable
- [ ] Icons immediately visible (not white)
- [ ] Chevrons/arrows visible
- [ ] Input placeholders legible
- [ ] Active states stand out
- [ ] Borders provide definition

### Dark Mode
- [ ] Text is white or near-white
- [ ] Icons are bright enough
- [ ] Chevrons visible
- [ ] Placeholders distinguishable
- [ ] Active states stand out
- [ ] Glass effect subtle but present

---

## Common Mistakes

| ❌ WRONG | ✅ CORRECT | Why |
|----------|-----------|-----|
| `text-gray-300` | `text-slate-800 dark:text-white` | Gray-300 invisible on light glass |
| `text-white/50` | `text-slate-700 dark:text-slate-200` | White/50 invisible on light bg |
| `text-white/30` | `text-slate-400 dark:text-slate-500` | Too transparent in both modes |
| `bg-white/70` | `bg-white/90` or `bg-[#F5F5F7]/78` | Need gray tint for contrast |
| `border-white/20` | `border-black/8 dark:border-white/10` | White borders invisible in light |

---

## Color Contrast Requirements (WCAG AA)

| Text Type | Min Contrast | Light Mode | Dark Mode |
|-----------|-------------|------------|-----------|
| Primary | 7:1 | `slate-800` (#1e293b) | `white` (#ffffff) |
| Secondary | 4.5:1 | `slate-600` (#475569) | `slate-300` (#cbd5e1) |
| Tertiary | 4.5:1 | `slate-500` (#64748b) | `slate-400` (#94a3b8) |
| Icons | 4.5:1 | `slate-700` (#334155) | `slate-100` (#f1f5f9) |
| Placeholders | 3:1 | `slate-400` (#94a3b8) | `slate-500` (#64748b) |

Use Chrome DevTools Contrast Checker to verify.

---

## Implementation Priority

1. **Immediate:** Fix menu text colors (`text-slate-800 dark:text-white`)
2. **Immediate:** Fix icon colors (`text-slate-700 dark:text-slate-200`)
3. **High:** Fix mode toggle active states
4. **High:** Fix input placeholders
5. **Medium:** Add borders for definition
6. **Medium:** Add hover states

Start with text and icons—these have the biggest visibility impact.