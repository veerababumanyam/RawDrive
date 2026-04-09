Gallery Cover & Design System - Requirements Document
Project Overview
Build a specialized **"Gallery Design Studio"**—a dedicated split-screen editing environment that allows photographers to design their client galleries with real-time visual feedback.

This moves beyond simple "settings forms" into a visual builder experience. The system requires a recurring "Draft State" interaction model where changes are previewed instantly on the right canvas without saving to the database until explicit confirmation or auto-save intervals.


Key Pillars:
1.  **Design Studio Architecture**: A persistent Left-Sidebar (Controls) + Right-Canvas (Live Preview) layout. DO NOT use modals for visual design.
2.  **Curated Theme Engine**: Pre-defined 9+ color palettes that map to semantic tokens.
3.  **Data Structure**: All design decisions encapsulated in `GalleryDesignConfig`.
4.  **Aesthetic North Star**: **"Liquid Fluidity & Glass"**. The interface must mirror recent Apple iOS/macOS human interface guidelines.
    *   **Glassmorphism**: Heavy use of `backdrop-filter: blur()`, translucent panels, and depth.
    *   **Fluid Motion**: Every interaction (hover, click, transition) must happen with spring physics animations (no linear eases).
    *   **Tactile Depth**: Use subtle inner-shadows, glossy gradients, and super-soft drop shadows to create 3D hierarchy.


## Clarifications

### Session 2026-01-22
- Q: Draft State & Persistence Strategy - Resolve contradiction between "Publish Changes" button (5.2) and "auto-save" with no save button (8.1) → A: Hybrid - Auto-save draft to browser localStorage every 3-5 seconds + explicit "Publish" button to commit to database (recommended for safety & undo capability)
- Q: Font Pairing Concrete Mappings - Section 2.1 defines font pairings but doesn't specify actual font families → A: Mix of Google Fonts (premium pairings) + system fonts (basic pairings) for performance balance
- Q: Cover Photo Upload Constraints - File size limits, format restrictions, and dimension requirements not specified → A: Balanced - Max 15MB, JPEG/PNG/WebP, min 1920x1080px, max 8192x8192px, auto-compress to target size on server
- Q: Accent Color Override Controls - UI mechanism and constraints for optional accent color override not specified → A: Predefined accent swatches per theme (3-5 carefully curated accent options per theme)
- Q: Default Gallery Design Configuration - Default values for new galleries not specified → A: Brand-forward defaults - Cover: 'classic', Typography: 'modern', Theme: 'brand', Grid: 'vertical/md/md'

---

1. COVER PHOTO SYSTEM
1.1 Cover Photo Management
Feature: Cover Photo Upload & Selection

Upload Options:
- Drag and drop photo upload
- "Select from Collection" button (choose from existing gallery photos)
- "Browse files" button for local file upload
- Modal interface for cover photo management

**1.1.1 Upload Constraints & Optimization:**
- **File Size Limit**: Maximum 15MB per upload (enforced on client-side with user warning + server-side validation)
- **Supported Formats**: JPEG, PNG, WebP (HEIC will be auto-converted to JPEG on mobile devices)
- **Minimum Dimensions**: 1920×1080px (prevents pixelated covers)
- **Maximum Dimensions**: 8192×8192px (accommodates high-resolution photography)
- **Server-Side Processing**:
  - Auto-compress to 4000px (longest dimension) if exceeds max
  - Convert to WebP for modern browsers (JPEG fallback for older browsers)
  - Generate thumbnails: 1920px, 1280px, 640px variants for responsive delivery
  - Store in Cloudflare R2 with 1-year cache TTL
- **Client Feedback**:
  - Show upload progress bar with percentage
  - Display validation errors: "File too large (18MB > 15MB limit)" or "Image too small (800×600 < 1920×1080 minimum)"
  - Allow retry on failure with exponential backoff



Feature: Focal Point Adjustment

Interactive focal point selector with draggable marker
Visual preview showing how cover will be cropped
Real-time preview of focal point changes
Centered marker/crosshair interface overlay on photo

1.2 Cover Style Templates (25+ Styles)
Implement the following cover style variations:
Basic Layouts:

Center - Title centered over full-width image
Left - Title aligned left over full-width image
None - No cover, direct to gallery

Text Placement Variations:
4. Vintage - Title centered with decorative border/frame
5. Novel - Split layout with title on separate panel
6. Frame - Full border frame around image with title
7. Stripe - Horizontal stripe overlay with title
8. Divider - Split screen with image and title sections
9. Journal - Magazine-style layout with offset title
10. Stamp - Small photo with prominent title area
11. Outline - Title with outlined box treatment
Advanced Styles:
12. Classic - Traditional centered layout with subtitle support
13. Split - Vertical 50/50 split between image and solid color
14. Label - Tab-style label with image background
15. Border - Thick border frame with title
16. Album - Compact photo with large title area
Premium Styles:
17. Cliff - Overlapping image panels with text
18. Cedar - Multiple image thumbnails with central title
19. Breeze - Soft overlay with transparent text area
20. Aero - Modern clean layout with minimal text
21. Surf - Dynamic layout with angled elements
22. Cosmos - Dark theme with centered minimal text
23. Reef - Beach/nature inspired with wave elements
24. Bondi - Horizontal panoramic with bottom text
25. West - Western/rustic aesthetic with photo treatment
26. Oakwood - Natural wood-toned overlay style
27. Edge - Artistic edge fade with text integration
28. Anchor - Nautical theme with icon elements
29. Joy - Holiday/festive themed with decorative elements
1.3 Technical Requirements - Cover

Each style should have a thumbnail preview (approximately 150x100px)
Selected style should have visual indicator (teal/green border)
Lazy loading for style thumbnails
"More" button to expand and show all available styles
Styles should be organized in a responsive grid (2 columns on desktop)


2. TYPOGRAPHY SYSTEM
2.1 Font Families
Implement 6 curated font pairings (Mix of system fonts for performance + Google Fonts for premium quality):

**Sans - A neutral font** (System Fonts)
- Headings: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Body: Same as headings
- Clean, modern sans-serif
- Default/fallback option
- Zero network overhead

**Serif - A classic font** (System Fonts)
- Headings: `Georgia, 'Times New Roman', serif`
- Body: Same as headings
- Traditional serif for elegant galleries
- Zero network overhead

**Modern - A sophisticated font** (Google Fonts - Premium)
- Headings: `'Outfit', sans-serif` (Google Fonts)
- Body: `'DM Sans', sans-serif` (Google Fonts)
- Contemporary sans-serif with refined details
- Variable font weights supported

**Timeless - A light and airy font** (Google Fonts - Premium)
- Headings: `'Crimson Text', serif` (Google Fonts)
- Body: `'Source Serif 4', serif` (Google Fonts)
- Thin weights, spacious letter spacing
- Elegant readability

**Bold - A punchy font** (Google Fonts - Premium)
- Headings: `'Montserrat', sans-serif` (Google Fonts)
- Body: `'Raleway', sans-serif` (Google Fonts)
- Heavy weight, impactful typography
- Strong visual hierarchy

**Subtle - A minimal font** (Google Fonts - Premium)
- Headings: `'Work Sans', sans-serif` (Google Fonts)
- Body: `'Nunito Sans', sans-serif` (Google Fonts)
- Understated, refined letterforms
- Excellent web readability



2.2 Typography UI Requirements

Display font name and description for each option
Show example text preview in the actual font
Radio button selection interface
Selected state with visual border indicator
Real-time preview update on main gallery preview

2.3 Typography Implementation

**Google Fonts Loading Strategy:**
- Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`
- Load only Google Fonts pairings (Modern, Timeless, Bold, Subtle) when selected
- Use `font-display: swap` to prevent FOIT (Flash of Invisible Text)
- Subset to Latin characters only to reduce file size

**Each font pairing includes:**
- Primary font family for headings (h1-h6, gallery title, cover title)
- Secondary font family for body text (captions, descriptions, metadata)
- Defined font weights:
  - System fonts: 400 (regular), 600 (semibold), 700 (bold)
  - Google Fonts: 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- Letter spacing presets:
  - Headings: `tracking-tight` (-0.025em) to `tracking-normal` (0)
  - Body: `tracking-normal` (0) to `tracking-wide` (0.025em)
- Line height configurations:
  - Headings: 1.1 to 1.3 (tight for visual impact)
  - Body: 1.5 to 1.7 (comfortable reading)

**Fallback Strategy:**
- All Google Fonts include system font fallbacks in CSS
- If Google Fonts fail to load, system fonts render immediately
- Font metrics matched to minimize layout shift (CLS optimization)




3. COLOR SYSTEM (THEME ENGINE)
3.1 Curated Theme Engine
Do not simply implement a color picker. Implement a **Theme Engine** that applies a system of colors based on a selected "Theme ID".

Curated Themes (9+) — *Prioritizing Application Brand Identity*:
1.  **Brand (RawDrive)**: The core identity. Deep Blue (`#2563EB`) primary with Cyan (`#06B6D4`) gradients.
2.  **Gold (Premium)**: The authentic "Gold" (`#D4AF37`) palette from the current design system.
3.  **Neutral (Slate)**: Clean Slate Gray (`#64748B`) and White surfaces. Matches the app's default neutral look.
4.  **Cyan (Vibrant)**: Focuses on the secondary brand color (`#06B6D4`) as the primary accent.
5.  **Midnight (Dark)**: High-contrast dark mode using the brand's `hero-bg` (`#0a1628`).
6.  **Rose**: (Client Option) Soft romance aesthetics.
7.  **Terracotta**: (Client Option) Earthy, warm organic vibes.
8.  **Olive**: (Client Option) Nature-inspired, muted green.
9.  **Sea**: (Client Option) Oceanic/Blue-grey palette.

*Requirement*: Every theme must define both a `light` and `dark` token set. The "Dark" theme (item 9) is a specialized "Always Dark" option, but "Gold" or "Olive" must also react to the user's mode preference if selected.

3.2 Semantic Token System
Each Theme must map to a rigorous CSS Variable / Token system. When a user selects a theme, the following tokens must update instantly:

*   `--bg-primary`: Main background (e.g., White vs Black)
*   `--bg-secondary`: Sidebar/Panel background
*   `--text-primary`: Main content text
*   `--text-secondary`: Meta information text
*   `--accent-primary`: Main action color (Buttons, Links)
*   `--accent-secondary`: Subtle highlights
*   `--border-subtle`: Dividers
*   `--status-active`: For selection states
*   `--font-primary`: Heading font (from Typography settings)
*   `--font-secondary`: Body font

*Requirement:* The user selects a "Theme" (e.g., 'Olive'), and the system injects the full palette. Users can *optionally* override just the `Accent` color from a curated set of 3-5 predefined accent swatches per theme, but the base surfaces are determined by the theme to ensure design integrity.

**3.1.1 Accent Color Override (Per-Theme Curated Swatches):**

Each theme provides 3-5 carefully curated accent color alternatives that maintain visual harmony with the theme's base palette:

- **Brand Theme Accents**: Cyan `#06B6D4` (default), Indigo `#6366F1`, Purple `#A855F7`, Emerald `#10B981`
- **Gold Theme Accents**: Gold `#D4AF37` (default), Amber `#F59E0B`, Orange `#F97316`, Rose Gold `#E8A598`
- **Neutral Theme Accents**: Slate `#64748B` (default), Blue `#3B82F6`, Teal `#14B8A6`, Violet `#8B5CF6`
- **Cyan Theme Accents**: Cyan `#06B6D4` (default), Sky `#0EA5E9`, Blue `#3B82F6`, Teal `#14B8A6`
- **Midnight Theme Accents**: Cyan `#06B6D4` (default), Purple `#A855F7`, Pink `#EC4899`, Amber `#F59E0B`
- **Rose Theme Accents**: Rose `#FB7185` (default), Pink `#F472B6`, Red `#EF4444`, Fuchsia `#E879F9`
- **Terracotta Theme Accents**: Orange `#F97316` (default), Amber `#F59E0B`, Red `#DC2626`, Brown `#92400E`
- **Olive Theme Accents**: Green `#22C55E` (default), Lime `#84CC16`, Emerald `#10B981`, Teal `#14B8A6`
- **Sea Theme Accents**: Teal `#14B8A6` (default), Cyan `#06B6D4`, Sky `#0EA5E9`, Blue `#3B82F6`

**UI Implementation:**
- Display accent swatches as small color circles below the selected theme card
- Only show accent swatches for the currently selected theme
- First swatch is always the theme's default accent
- Click to apply accent override; click default swatch to reset
- Selected accent has subtle ring indicator
- Accent changes update `--accent-primary` and `--accent-secondary` tokens instantly

3.3 Color UI Requirements
*   **Theme Grid**: Display the 9 curated themes as "Mini Gallery Cards" showing the interaction of their colors.
*   **Active Indicator**: Teal/Brand border around the active theme card.
*   **Real-time Interaction**: Clicking a theme immediately swaps the CSS variables in the Preview Pane.


4. GRID LAYOUT SYSTEM
4.1 Grid Style Options
Vertical Grid

Traditional row-by-row layout
Photos scroll vertically

Horizontal Grid

Side-by-side scrolling
Photos arranged in horizontal flow

4.2 Thumbnail Size Options
Regular (Default)

Standard thumbnail size
3-4 images per row on desktop

Large

Larger thumbnail display
2-3 images per row on desktop
More prominent photo presentation

4.3 Grid Spacing Options
Regular (Default)

Standard padding between images
Balanced spacing

Large

Increased padding between images
More breathing room
Gallery-style presentation

4.4 Navigation Style Options
Icon Only

Navigation arrows without text labels
Minimal interface

Icon & Text

Navigation arrows with text labels
More guidance for users

4.5 Grid Technical Requirements

Visual icon representation for each option
Radio button selection interface
Responsive grid adjustments for mobile
Maintain aspect ratios
Lazy loading for thumbnails
Smooth transitions between grid changes


5. DESIGN STUDIO ARCHITECTURE & NAVIGATION
5.1 The "Design Studio" View (Split Screen)
The application must distinguish between "Gallery Management" (Admin) and "Gallery Design" (Creative).
Accessing the "Design" tab must trigger the specialized Studio View.

*   **Route**: `/workspace/galleries/:id/design`
*   **Layout**: Full-screen "Studio Layout" (No global admin top bar if possible, or minimized).
    *   **Left Sidebar (360px)**: The "Control Panel". Scrollable, containing the accordions for Cover, Typography, Colors, Grid.
    *   **Right Canvas (Flex Grow)**: The "Live Stage". Renders the `GalleryPreview` component inside a container. This canvas must be responsive (allow toggling Mobile/Desktop viewport).

5.2 Edit Interaction Model (Hybrid Persistence)
1.  **Draft State**: The Left Sidebar manipulates a local `draftConfig` state object.
2.  **Instant Feedback**: The Right Canvas receives `draftConfig` as a prop and re-renders strictly via React state (no API calls for style tweaks).
3.  **Auto-Save to localStorage**: Draft changes are automatically persisted to browser localStorage every 3-5 seconds to prevent data loss from browser crashes or accidental navigation away.
4.  **Explicit Publish**: A prominent "Publish Changes" button in the Studio Top Bar commits the `draftConfig` from localStorage to the backend `gallery.design_config` field, making changes live on the client-facing gallery.
5.  **Draft Recovery**: On page load, if unpublished localStorage draft exists, prompt user to "Restore Draft" or "Discard Draft".

5.3 Design Menu Structure (Left Sidebar)
*   **Cover**: Style selection (Grid), Focal Point, Text placement.
*   **Typography**: Font Pairing selection (Cards).
*   **Theme**: Color Theme selection (Bento Grid) + Mode Toggle (Light/Dark/System).
*   **Grid**: Layout options.

5.4 Theme Mode Logic
The interface must offer a top-level **"Gallery Appearance"** control: [ Sunny | Moon | Auto ].
1.  **Light**: Forces the gallery into its Light variant tokens.
2.  **Dark**: Forces the gallery into its Dark variant tokens.
3.  **System**: Auto-detects visitor preference.

*Crucially*, the **Design Studio Interface itself** must also support these modes properly, ensuring the "Glassmorphism" layer looks correct (e.g., White Glass in Light Mode, Black Smoke Glass in Dark Mode) to maintain contrast against the user's photos.


6. TECHNICAL SPECIFICATIONS
6.1 Data Model (GalleryDesignConfig)
The design settings must be grouped into a single configuration object in the database and frontend types. DO NOT store these as loose fields on the Gallery entity.

```typescript
export type CoverStyleId = 'center' | 'left' | 'vintage' | 'novel' | 'frame' | 'stripe' | 'classic' | 'split' | 'hero' | 'cliff'; // etc
export type ThemeId = 'brand' | 'gold' | 'neutral' | 'cyan' | 'midnight' | 'rose' | 'terracotta' | 'olive' | 'sea';
export type FontPairingId = 'sans' | 'serif' | 'modern' | 'timeless' | 'bold' | 'subtle';

export interface GalleryDesignConfig {
  cover: {
    style: CoverStyleId;
    focalPoint: { x: number; y: number }; // 0-100% position
    titleVisible: boolean;
    overlayOpacity: number; // 0-1.0
  };
  typography: {
    pairingId: FontPairingId;
    customHeadingsFont?: string; // Optional override
  };
  theme: {
    id: ThemeId;
    mode: 'light' | 'dark' | 'system';
    accentColorOverride?: string; // Optional: One of the predefined accent hex values for selected theme
  };
  grid: {
    style: 'vertical' | 'horizontal';
    size: 'sm' | 'md' | 'lg';
    spacing: 'sm' | 'md' | 'lg';
  };
}
```

**6.1.1 Default Configuration (New Galleries):**

When a new gallery is created, initialize `design_config` with these brand-forward defaults that showcase RawDrive's design capabilities:

```typescript
const DEFAULT_GALLERY_DESIGN_CONFIG: GalleryDesignConfig = {
  cover: {
    style: 'classic',           // Traditional centered layout with subtitle support
    focalPoint: { x: 50, y: 50 }, // Centered focal point
    titleVisible: true,
    overlayOpacity: 0.3         // Subtle overlay for text readability
  },
  typography: {
    pairingId: 'modern',        // Outfit/DM Sans (Google Fonts - premium feel)
    customHeadingsFont: undefined
  },
  theme: {
    id: 'brand',                // RawDrive brand identity (Deep Blue + Cyan)
    mode: 'system',             // Auto-detect user's light/dark preference
    accentColorOverride: undefined // Use theme default (Cyan #06B6D4)
  },
  grid: {
    style: 'vertical',          // Traditional row-by-row layout
    size: 'md',                 // Standard thumbnail size (3-4 images/row)
    spacing: 'md'               // Balanced spacing
  }
};
```

**Rationale:**
- **Cover 'classic'**: Professional, timeless layout suitable for all photography types
- **Typography 'modern'**: Showcases premium Google Fonts capability (Outfit/DM Sans)
- **Theme 'brand'**: Reinforces RawDrive identity, builds brand recognition
- **Grid 'vertical/md/md'**: Familiar, accessible layout that works universally
- **Mode 'system'**: Respects user's OS-level light/dark preference automatically

**Implementation Notes:**
- Apply defaults on gallery creation (backend repository layer)
- Store as JSONB in `gallery.design_config` column
- Validate against `GalleryDesignConfig` schema on save
- Frontend should handle `null` config gracefully by falling back to these defaults

6.2 Frontend Implementation Strategy
1.  **Component Factory**: Create a `CoverRenderer` component that takes `style` as a prop and dynamically imports/renders the specific style sub-component (e.g., `<CoverStyleVintage />`).
2.  **CSS Variables**: The Theme Engine must rely on CSS Custom Properties (`var(--bg-primary)`) scoped to the Preview Container. This allows instant theme switching without React re-renders of the DOM structure, just CSS value updates.
3.  **Lazy Loading**: The 25+ cover styles should be lazy-loaded chunks to avoid bloating the main bundle.

6.3 Performance Requirements
*   **Preview Latency**: < 16ms (1 frame) for CSS-based changes (Colors).
*   **Layout Swaps**: < 100ms for Structure changes (Cover Style swap).

7. ENHANCED FEATURES (Future Considerations)
7.1 Advanced Customization

Custom color picker for all color themes
Upload custom fonts
Custom CSS editor for power users
Save custom style presets

7.2 Animation Options

Cover photo parallax effects
Fade-in animations for gallery items
Hover effects on thumbnails
Transition effects between photos

7.3 Advanced Cover Styles

Video cover support
Animated cover photos
Slideshow cover with multiple images
Text animation effects

7.4 Accessibility Features

High contrast mode
Keyboard navigation
Screen reader optimization
ARIA labels for all interactive elements


8. USER EXPERIENCE REQUIREMENTS (Interaction)
8.1 Interactions

All changes should update preview instantly (real-time React state updates)
Draft auto-saved to localStorage every 3-5 seconds (background persistence)
"Publish Changes" button required to commit live (explicit user action)
Undo/redo functionality (operates on localStorage draft history, max 20 steps)
Reset to default option for each section (revert individual controls to defaults)

8.2 Visual Feedback

Selected state clearly indicated (teal border)
Hover states on all interactive elements
Loading spinners for heavy operations
Success/error toast notifications

8.3 Responsive Behavior

Stacked layout on mobile (preview below settings)
Touch-friendly controls (minimum 44x44px tap targets)
Swipe gestures for style browsing on mobile


9. UX/UI AESTHETIC REQUIREMENTS (Visuals)

9.1 Aesthetic Direction: "Liquid Glass & iOS Depth"
The interface must compete with top-tier design tools (e.g., Framer, Linear, Apple settings). It must feel "expensive" and "crafted".

*   **Glassmorphism Level 3**: Surfaces should not be solid hex codes. Use `bg-white/70` (or black) with `backdrop-blur-xl`.
    *   *Sidebar*: Translucent frosted glass sitting *above* the canvas content.
    *   *Cards*: Subtle glass gradients with 1px glossy white/border borders.
*   **Shadows & Depth**:
    *   Avoid default CSS shadows. Use multi-layered, colored shadows to simulate ambient light.
    *   Active states should "lift" or "glow", not just change border color.
*   **Typography**:
    *   Use generous `tracking-wide` for labels.
    *   Use system fonts (`SF Pro` equivalents) for the UI controls to maintain that "native app" feel.

9.2 Motion & Interactivity (Fluidity)
*   **No Instant Jumps**: Every state change (even toggling a checkbox) must lerp/spring.
*   **Hover Physics**: Hovering a theme card should scale it up slightly (`scale-105`) with a spring bounce, and lift the shadow.
*   **Liquid Transitions**: When switching Cover Styles, the old cover should not just "disappear". It should morph or cross-fade elegantly into the new one.

9.3 Layout & Grids
*   **Bento Grids**: Use "Bento Box" style layouts for the Theme and Font selectors.
*   **Responsive Flow**: The sidebar must not just "collapse". It should slide away with a gesture-like animation.

9.4 Specific Visual Executions
*   **Theme Cards**: Don't just show 3 circles. Show a "mini UI mockup" inside the card that re-colors itself.
*   **Font Cards**: Display a large "Aa" using the actual font file, rendered with a subtle gradient texture.
