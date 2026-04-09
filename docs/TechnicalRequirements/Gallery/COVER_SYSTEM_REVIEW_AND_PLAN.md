# Cover & Design System - Review and Implementation Plan

## 1. Executive Summary

**Status:** 🚧 **Early Infrastructure / Partial Implementation**

The current codebase contains the foundational elements for a gallery system (Galleries, Assets, Basic Settings), but the **Advanced Design System** described in `CoverPhotoSystem.md` is **largely unimplemented**.

The current implementation relies on a "Settings Modal" (`GallerySettingsPanel`) with basic options for Title, simple Font selection, and Gradient/Color selection. It **lacks** the sophisticated "Design Studio" experience (Real-time split-screen preview, curated themes, and the 25+ specific cover styles) required by the specification.

## 2. Implementation Audit

| Feature Area | Spec Requirement | Current Status | Verdict |
|--------------|------------------|----------------|---------|
| **1. Cover System** | **25+ Cover Styles** (Vintage, Frame, etc.) | **None**. Only a single default gradient/image overlap exists. | ❌ MISSING |
| | **Focal Point** Adjustment | **None**. Images are just `object-cover`. | ❌ MISSING |
| | **Upload/Select** Workflow | Standard upload exists. "Select from Collection" logic needs refinement. | ⚠️ PARTIAL |
| **2. Typography** | **6 Curated Pairings** (Sans, Serif, etc.) | Single dropdown with ~9 flat font options. No pairings logic. | ❌ MISSING |
| | Font Preview UI | Simple select box. No visual preview. | ❌ MISSING |
| **3. Color System** | **9 Curated Themes** (Light, Gold, Rose...) | Light/Dark mode + Custom Gradient Picker. No semantic palette system. | ⚠️ UNSATISFACTORY |
| | Palette Logic (Primary/Secondary/Bg) | Uses broad `primary_color`. Missing nuanced palette mapping. | ❌ MISSING |
| **4. Grid System** | Vertical/Horizontal Layouts | Only vertical grid exists. | ❌ MISSING |
| | Thumb Size/Spacing Options | Fixed responsive values. Not user-configurable. | ❌ MISSING |
| **5. Interface** | **Real-Time Split Preview** (60% width) | **Modal-based Settings**. Preview is a separate page `GalleryPreviewPage`. | ❌ WRONG ARCHITECTURE |
| | "Design" Tab in Sidebar | Settings are buried in a modal, not a primary sidebar tab. | ❌ WRONG ARCHITECTURE |

## 3. Architecture Recommendations

To implement the `CoverPhotoSystem.md` spec, we need to move away from the current `GallerySettingsPanel` (Modal) and build a dedicated **Design Studio** view.

### A. Data Model Updates (Frontend Types & Backend Schema)

The current `GalleryDetailData` needs to be expanded. We should group design settings into a coherent `design_config` object to avoid polluting the root namespace.

**Recommended TypeScript Interface:**

```typescript
// types/gallery-design.ts

export type CoverStyle = 
  | 'center' | 'left' | 'none' // Basic
  | 'vintage' | 'novel' | 'frame' | 'stripe' // Text Placement
  | 'classic' | 'split' | 'label' // Advanced
  | 'cliff' | 'cedar' | 'breeze' // Premium
  // ... add all 25+ styles
;

export type TypographyPairing = 'sans' | 'serif' | 'modern' | 'timeless' | 'bold' | 'subtle';

export type ColorThemeId = 'light' | 'gold' | 'rose' | 'terracotta' | 'sand' | 'olive' | 'agave' | 'sea' | 'dark';

export interface FocalPoint {
  x: number; // 0-100%
  y: number; // 0-100%
}

export interface GridConfig {
  layout: 'vertical' | 'horizontal';
  thumbnailSize: 'regular' | 'large';
  spacing: 'regular' | 'large';
  navigationStyle?: 'icon' | 'icon_text'; // For horizontal
}

// Add this to GalleryDetailData
export interface GalleryDesignConfig {
  cover: {
    style: CoverStyle;
    focalPoint?: FocalPoint;
    opacity?: number; // For overlays
  };
  typography: {
    pairing: TypographyPairing;
    // Allow overrides?
  };
  color: {
    themeId: ColorThemeId;
    customPrimary?: string; // Allow override
  };
  grid: GridConfig;
}
```

### B. UI Architecture Update

**Current Flow:** Gallery Detail -> Click "Settings" Button -> Modal Opens.
**Required Flow:** Gallery Detail -> Click "Design" Tab -> **Split Screen Mode**.

**Structure:**
*   **Left Panel (Editor)**: 4 Accordions/Tabs (Cover, Fonts, Colors, Grid).
*   **Right Panel (Preview)**: Embeds `GalleryPreviewPage` (or a `GalleryPreview` component) in an iframe or isolated container to render the *exact* user view.
*   **State**: The Editor modifies a local draft state. The Preview consumes this draft state instantly.

## 4. Implementation Plan

### Phase 1: Foundation & Types
1.  **Define Types**: Create `types/gallery-design.ts` with all Enums.
2.  **Mock Data**: Create constants for the "Curated Pairings" (mapping Font A + Font B) and "Color Themes" (mapping exact hex codes for Primary/Secondary/Bg).
3.  **Migration Script**: Plan existing galleries to map to `default` styles (Basic Center, Sans, Light).

### Phase 2: The Component Library (The "Hard" Part)
This requires building distinct React components for the Cover Styles.
1.  **Cover Renderer Component**: A switch case component that takes `style="vintage"` and renders the appropriate layout.
2.  **Implement Styles**:
    *   *Batch 1 (Basics)*: Center, Left, Split.
    *   *Batch 2 (Text)*: Vintage, Frame, Stripe.
    *   *Batch 3 (Premium)*: Complex layouts like "Cliff" (overlapping).
3.  **Focal Point Component**: A UI widget for the editor (image with draggable dot) + CSS `object-position` logic for the renderer.

### Phase 3: The Design Studio Page
1.  Refactor `GalleryDetailPage` to support the "Split View" layout when the "Design" tab is active.
2.  Move `VisualIdentitySettings` logic into the new Left Sidebar.
3.  Create the `RealTimePreview` container (handling the logic to pass draft state to the preview component).

### Phase 4: Integration
1.  Connect "Select from Collection" to the existing Gallery Asset Picker.
2.  Implement the Focal Point save logic.

## 5. Specific Enhancements to "Impliment" Now

If you want to start *now*, here is the recommended First Step (MVP):

**Step 1: Create the Types and Config**
Define the `GalleryDesignConfig` interface and update the `GalleryEntity` type.

**Step 2: Build the "Design Studio" Scaffold**
Create a new page/view `GalleryDesignPage.tsx`. Use a resizable split-pane.
*   **Left**: Placeholder controls.
*   **Right**: Reuse `GalleryPreviewPage` logic components.

**Step 3: Implement 3 Core Cover Styles**
Start with just 3 distinct styles (e.g., `Standard`, `Split`, `FullFrame`) to prove the architecture before building all 25.

**Step 4: Focal Point**
This is a high-impact, low-effort feature. Add `object-position` support to the cover image immediately.
