---
name: design-system
description: Design system guidelines for RawDrive. Use when styling components, using color tokens, implementing themes, or following UI patterns.
---

# RawDrive Design System v1.0

## Overview

RawDrive uses a comprehensive, production-ready design system with:
- **TailwindCSS 4.x** with custom design tokens
- **CSS Custom Properties** for theming (100+ tokens)
- **React Component Library** with full TypeScript support
- **Lucide React** for icons
- **WCAG 2.1 AA** accessibility compliance

## Core Files

| Purpose | Location |
|---------|----------|
| CSS Variables & Tokens | `frontend/src/index.css` |
| Tailwind Config | `frontend/tailwind.config.js` |
| UI Components | `frontend/src/components/ui/` |
| Layout Components | `frontend/src/components/layout/` |
| Hooks | `frontend/src/hooks/` |

## Brand Colors (From Logo)

```css
/* Primary - Blue (Brand Core) */
--color-primary-600: #2563EB;  /* Main brand blue */
--color-primary-500: #3B82F6;
--color-primary-700: #1D4ED8;

/* Accent - Cyan (Secondary Brand) */
--color-accent-500: #06B6D4;   /* Cyan from logo gradient */
--color-accent-600: #0891B2;

/* Gold - Premium Accent */
--color-gold-500: #D4AF37;     /* Gold from logo */
--color-gold-200: #FDE68A;
```

## Semantic Color Tokens

```css
/* Backgrounds */
--color-background: var(--color-neutral-50);      /* Main app background */
--color-surface: #FFFFFF;                          /* Cards, modals */
--color-surface-hover: var(--color-neutral-100);  /* Interactive hover */

/* Text */
--color-text-primary: var(--color-neutral-900);   /* Headings */
--color-text-secondary: var(--color-neutral-600); /* Body text */
--color-text-tertiary: var(--color-neutral-500);  /* Muted text */

/* Borders */
--color-border: var(--color-neutral-200);
--color-border-focus: var(--color-primary-500);

/* Status */
--color-success: var(--color-success-600);
--color-warning: var(--color-warning-600);
--color-error: var(--color-error-600);
--color-info: var(--color-info-600);
```

## Component Library

### Required Imports

```typescript
// Import from centralized exports
import { AppButton, AppInput, AppCard, AppBadge } from '@/components/ui';
import { Modal, Toast, Progress, Spinner } from '@/components/ui';
import { DataTable, Tabs, Breadcrumb, Pagination } from '@/components/ui';
import { PhotoGrid, FileUploader } from '@/components/ui';
import { AppShell, Sidebar } from '@/components/layout';
import { useTheme, ThemeProvider } from '@/hooks';
```

### AppButton

**ALWAYS use AppButton - NEVER create custom buttons**

```typescript
import { AppButton } from '@/components/ui';

// Variants: primary, secondary, outline, ghost, destructive, gold, accent
<AppButton variant="primary">Save Changes</AppButton>
<AppButton variant="secondary">Cancel</AppButton>
<AppButton variant="outline">Edit</AppButton>
<AppButton variant="ghost">Close</AppButton>
<AppButton variant="destructive">Delete</AppButton>
<AppButton variant="gold">Upgrade to Pro</AppButton>
<AppButton variant="accent">New Feature</AppButton>

// Sizes: xs, sm, md, lg, xl, icon
<AppButton size="sm">Small</AppButton>
<AppButton size="lg">Large</AppButton>
<AppButton size="icon"><X size={20} /></AppButton>

// States
<AppButton isLoading loadingText="Saving...">Save</AppButton>
<AppButton disabled>Disabled</AppButton>

// With icons
<AppButton leftIcon={<Plus size={16} />}>Add Photo</AppButton>
<AppButton rightIcon={<ChevronRight size={16} />}>Next</AppButton>
```

### AppInput

```typescript
import { AppInput, AppTextarea } from '@/components/ui';

// Basic input
<AppInput
  label="Email"
  type="email"
  placeholder="Enter your email"
  isRequired
/>

// With validation
<AppInput
  label="Password"
  type="password"
  error={errors.password?.message}
  helperText="Must be at least 8 characters"
/>

// With icons
<AppInput
  label="Search"
  leftIcon={<Search size={16} />}
  rightIcon={<X size={16} />}
/>

// With addons
<AppInput
  label="Website"
  leftAddon="https://"
  rightAddon=".com"
/>

// Textarea
<AppTextarea
  label="Description"
  rows={4}
  autoResize
/>
```

### AppCard

```typescript
import { AppCard, Card } from '@/components/ui';

// Simple card
<AppCard variant="default" hoverable onClick={handleClick}>
  <Card.Header>
    <Card.Title>Gallery Name</Card.Title>
    <Card.Description>50 photos</Card.Description>
  </Card.Header>
  <Card.Content>
    {/* Content */}
  </Card.Content>
  <Card.Footer>
    <AppButton variant="secondary">View</AppButton>
  </Card.Footer>
</AppCard>

// Variants: default, elevated, outlined, flat, glass
<AppCard variant="glass">Glassmorphism card</AppCard>
<AppCard variant="elevated">Elevated shadow</AppCard>

// With image
<AppCard>
  <Card.Image src={cover} alt="Gallery cover" aspectRatio="16/9" overlay />
  <Card.Content>Content below image</Card.Content>
</AppCard>
```

### AppBadge

```typescript
import { AppBadge, StatusBadge, CountBadge } from '@/components/ui';

// Variants: default, primary, accent, gold, success, warning, error, info, outline
<AppBadge variant="success">Published</AppBadge>
<AppBadge variant="warning" dot>Pending</AppBadge>
<AppBadge variant="gold">Premium</AppBadge>

// Removable badges
<AppBadge removable onRemove={() => handleRemove(tag)}>{tag}</AppBadge>

// Status preset
<StatusBadge status="online" />
<StatusBadge status="pending" />

// Count badge
<CountBadge count={5} max={99} />
```

### Modal

```typescript
import { Modal, Dialog, ConfirmDialog } from '@/components/ui';

// Standard modal
<Modal isOpen={isOpen} onClose={onClose} size="md">
  <Modal.Header>
    <Modal.Title>Edit Gallery</Modal.Title>
    <Modal.Description>Update gallery settings</Modal.Description>
  </Modal.Header>
  <Modal.Body>
    {/* Form content */}
  </Modal.Body>
  <Modal.Footer>
    <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
    <AppButton variant="primary" onClick={onSave}>Save</AppButton>
  </Modal.Footer>
</Modal>

// Confirmation dialog
<ConfirmDialog
  isOpen={showConfirm}
  onClose={() => setShowConfirm(false)}
  onConfirm={handleDelete}
  title="Delete Gallery?"
  message="This will permanently delete all photos."
  confirmText="Delete"
  variant="destructive"
/>
```

### Toast Notifications

```typescript
import { ToastProvider, useToast, useToastActions } from '@/components/ui';

// Wrap app with provider
<ToastProvider position="top-right">
  <App />
</ToastProvider>

// Use in components
const toast = useToastActions();

toast.success('Gallery created successfully');
toast.error('Failed to upload photo');
toast.warning('Storage almost full');
toast.info('New features available');

// With action
toast.custom({
  title: 'Photo uploaded',
  message: 'View in gallery?',
  variant: 'success',
  action: {
    label: 'View',
    onClick: () => navigate('/gallery'),
  },
});
```

### Progress & Loading

```typescript
import { Progress, CircularProgress, Spinner, Skeleton } from '@/components/ui';

// Progress bar
<Progress value={75} showLabel />
<Progress value={50} variant="accent" striped animated />

// Circular progress
<CircularProgress value={60} size={48} showLabel />

// Spinner
<Spinner size="md" />
<AppButton isLoading><Spinner size="sm" /></AppButton>

// Skeleton loading
<Skeleton variant="text" width="60%" />
<Skeleton variant="circular" width="40px" height="40px" />
<SkeletonCard />
<SkeletonListItem />
```

### DataTable

```typescript
import { DataTable, TablePagination } from '@/components/ui';

const columns = [
  { id: 'name', header: 'Name', accessor: 'name', sortable: true },
  { id: 'date', header: 'Date', accessor: 'createdAt', sortable: true },
  { id: 'status', header: 'Status', accessor: 'status',
    cell: (value) => <StatusBadge status={value} /> },
];

<DataTable
  data={galleries}
  columns={columns}
  keyAccessor="id"
  selectable
  selectedKeys={selected}
  onSelectionChange={setSelected}
  sortable
  sortColumn={sortCol}
  sortDirection={sortDir}
  onSortChange={handleSort}
  hoverable
  striped
/>

<TablePagination
  page={page}
  totalPages={totalPages}
  totalItems={total}
  pageSize={20}
  onPageChange={setPage}
  showPageSizeSelector
  onPageSizeChange={setPageSize}
/>
```

### Tabs & Navigation

```typescript
import { Tabs, TabList, Tab, TabPanels, TabPanel, Breadcrumb, Pagination } from '@/components/ui';

// Tabs (variants: default, pills, underline, segmented)
<Tabs defaultValue="photos" variant="underline">
  <TabList>
    <Tab value="photos" icon={<Image size={16} />}>Photos</Tab>
    <Tab value="videos" icon={<Video size={16} />}>Videos</Tab>
    <Tab value="settings" icon={<Settings size={16} />}>Settings</Tab>
  </TabList>
  <TabPanels>
    <TabPanel value="photos"><PhotoGrid photos={photos} /></TabPanel>
    <TabPanel value="videos">Video content</TabPanel>
    <TabPanel value="settings">Settings content</TabPanel>
  </TabPanels>
</Tabs>

// Breadcrumb
<Breadcrumb
  items={[
    { label: 'Home', href: '/' },
    { label: 'Galleries', href: '/galleries' },
    { label: 'Wedding Photos' },
  ]}
  maxItems={4}
/>

// Pagination
<Pagination
  currentPage={page}
  totalPages={20}
  onPageChange={setPage}
  siblingCount={1}
/>
```

### PhotoGrid

```typescript
import { PhotoGrid, MasonryGrid } from '@/components/ui';

<PhotoGrid
  photos={photos}
  layout="grid"
  columns={{ sm: 2, md: 3, lg: 4, xl: 5 }}
  gap="md"
  selectable
  selectedIds={selected}
  onSelectionChange={setSelected}
  onPhotoClick={handleView}
  showActions
  lazyLoad
/>

// Masonry layout
<MasonryGrid
  photos={photos}
  columnWidth={280}
  gap="md"
  onPhotoClick={handleView}
/>
```

### FileUploader

```typescript
import { FileUploader, DropZone } from '@/components/ui';

<FileUploader
  accept="image/*"
  multiple
  maxSize={100 * 1024 * 1024} // 100MB
  maxFiles={50}
  onUpload={handleUpload}
  onFilesChange={setFiles}
  showFileList
/>

// Simple drop zone
<DropZone onDrop={handleDrop}>
  <div className="p-8 text-center">
    Drop files here
  </div>
</DropZone>
```

### Form Controls

```typescript
import { Checkbox, Radio, RadioGroup, Toggle, Select, RangeSlider } from '@/components/ui';

// Checkbox
<Checkbox
  label="Remember me"
  description="Keep me signed in"
  checked={remember}
  onChange={setRemember}
/>

// Radio group
<RadioGroup
  name="quality"
  value={quality}
  onChange={setQuality}
  label="Export Quality"
>
  <Radio value="high" label="High (Original)" />
  <Radio value="medium" label="Medium (Compressed)" />
  <Radio value="low" label="Low (Web)" />
</RadioGroup>

// Toggle switch
<Toggle
  label="Dark Mode"
  description="Use dark theme"
  checked={isDark}
  onChange={setIsDark}
/>

// Select
<Select
  label="Sort by"
  options={[
    { value: 'date', label: 'Date' },
    { value: 'name', label: 'Name' },
    { value: 'size', label: 'Size' },
  ]}
  value={sortBy}
  onChange={setSortBy}
/>

// Range slider
<RangeSlider
  label="Quality"
  min={0}
  max={100}
  value={quality}
  onChange={setQuality}
  showValue
/>
```

## Layout Components

### AppShell

```typescript
import { AppShell, Shell, useAppShell } from '@/components/layout';

<AppShell defaultSidebarOpen={true}>
  <Shell.Header sticky bordered>
    <Logo />
    <Navigation />
    <UserMenu />
  </Shell.Header>

  <Shell.Content>
    <Shell.Sidebar width={280} mobileOverlay>
      <SidebarNav />
    </Shell.Sidebar>

    <Shell.Main padded maxWidth="xl">
      {children}
    </Shell.Main>
  </Shell.Content>

  <Shell.Footer>
    <FooterContent />
  </Shell.Footer>
</AppShell>

// Control sidebar
const { toggleSidebar, toggleMobileMenu, sidebarCollapsed } = useAppShell();
```

### Sidebar

```typescript
import { Sidebar, Nav, useSidebar } from '@/components/layout';

<Sidebar collapsed={isCollapsed} activeItem={activeNav} onActiveChange={setActiveNav}>
  <Sidebar.Header>
    <Logo />
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Section title="Main">
      <Sidebar.Item id="dashboard" label="Dashboard" icon={<Home />} />
      <Sidebar.Item id="galleries" label="Galleries" icon={<Image />} badge={<CountBadge count={5} />} />
      <Sidebar.Item id="clients" label="Clients" icon={<Users />} />
    </Sidebar.Section>

    <Sidebar.Divider />

    <Sidebar.Section title="Settings" collapsible>
      <Sidebar.Item id="profile" label="Profile" icon={<User />} />
      <Sidebar.Item id="billing" label="Billing" icon={<CreditCard />} />
    </Sidebar.Section>
  </Sidebar.Content>

  <Sidebar.Footer>
    <UserProfile />
  </Sidebar.Footer>
</Sidebar>
```

## Theme System

### useTheme Hook

```typescript
import { useTheme, ThemeProvider } from '@/hooks';

// Wrap app
<ThemeProvider defaultTheme="system">
  <App />
</ThemeProvider>

// Use in components
const { theme, resolvedTheme, setTheme, toggleTheme, isDark } = useTheme();

// Toggle button
<AppButton variant="ghost" size="icon" onClick={toggleTheme}>
  {isDark ? <Sun size={20} /> : <Moon size={20} />}
</AppButton>

// Theme options: 'light', 'dark', 'system'
setTheme('dark');
```

### Dark Mode CSS

```css
/* Light (default) */
:root {
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-text-primary: #0F172A;
}

/* Dark */
[data-theme="dark"] {
  --color-background: #020617;
  --color-surface: #0F172A;
  --color-text-primary: #F8FAFC;
}
```

## Glassmorphism

```typescript
// Glass utility classes
<div className="glass">Standard glass</div>
<div className="glass-dark">Dark glass</div>
<div className="glass-heavy">Heavy blur glass</div>
<div className="hero-glass-premium">Premium hero glass</div>
```

## Animations

```typescript
// Built-in animation classes
<div className="animate-fade-in">Fade in</div>
<div className="animate-fade-in-up">Fade in from bottom</div>
<div className="animate-scale-in">Scale in</div>
<div className="animate-slide-in-right">Slide from right</div>
<div className="animate-pulse-glow">Glowing pulse</div>
<div className="animate-float">Floating effect</div>
<div className="animate-shimmer">Skeleton shimmer</div>

// With delays
<div className="animate-fade-in-up delay-100">Delayed 100ms</div>
<div className="animate-fade-in-up delay-200">Delayed 200ms</div>
```

## Typography

```css
/* Font families */
--font-sans: 'Inter', system-ui, sans-serif;
--font-serif: 'Playfair Display', Georgia, serif;
--font-mono: 'Roboto Mono', monospace;
```

```typescript
// Heading classes
<h1 className="heading-1">Page Title (36px bold)</h1>
<h2 className="heading-2">Section (30px bold)</h2>
<h3 className="heading-3">Card Title (24px semibold)</h3>

// Text gradient
<span className="text-gradient">Gradient text</span>
<span className="text-gradient-gold">Gold gradient</span>
```

## Spacing Scale (4px base)

| Class | Value | Use Case |
|-------|-------|----------|
| `space-1` | 4px | Tight inline |
| `space-2` | 8px | Default inline |
| `space-3` | 12px | Component padding |
| `space-4` | 16px | Card padding |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Large gaps |

## Border Radius

```typescript
// Semantic radius tokens
className="rounded-button"  // 8px - buttons
className="rounded-input"   // 8px - inputs
className="rounded-card"    // 16px - cards
className="rounded-modal"   // 24px - modals
className="rounded-badge"   // full - badges
```

## Shadows

```typescript
// Shadow utilities
className="shadow-card"        // Standard card shadow
className="shadow-card-hover"  // Elevated on hover
className="shadow-primary"     // Blue glow
className="shadow-gold"        // Gold glow
className="shadow-error"       // Red glow
```

## Responsive Breakpoints

| Breakpoint | Min Width | Use Case |
|------------|-----------|----------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

```typescript
// Mobile-first responsive
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
<div className="p-4 md:p-6 lg:p-8">
<div className="text-sm md:text-base lg:text-lg">
```

## Design Rules

### ALWAYS Do

1. **Use design tokens** - `bg-surface`, `text-text-primary`, `border-border`
2. **Use component library** - `AppButton`, `AppInput`, `AppCard`
3. **Support dark mode** - Test both themes
4. **Include all states** - hover, focus, active, disabled
5. **Follow spacing scale** - 4px base unit
6. **Use semantic colors** - `text-error`, `bg-success-100`
7. **Add focus-visible rings** - For keyboard navigation
8. **Provide aria-labels** - For icon-only buttons

### NEVER Do

1. **Hardcode colors** - No `bg-blue-500`, `#ffffff`
2. **Create custom buttons** - Use `AppButton`
3. **Create custom inputs** - Use `AppInput`
4. **Skip focus states** - Use `focus-visible:ring-2`
5. **Use outline-none alone** - Always provide ring replacement
6. **Use arbitrary values** - No `p-[13px]`
7. **Assume light theme only** - Always test dark mode
8. **Skip loading states** - Use `Skeleton`, `Spinner`

## Accessibility Requirements

- **Contrast**: 4.5:1 for text, 3:1 for UI components
- **Touch targets**: 44x44px minimum
- **Focus visible**: 2px ring with offset
- **Semantic HTML**: Use proper heading hierarchy
- **ARIA labels**: For all icon-only interactive elements
- **Keyboard nav**: Tab order, Escape to close

## File Size Limits

- Component files: Maximum 600 lines
- Service files: Maximum 800 lines
- Split large files into smaller modules
