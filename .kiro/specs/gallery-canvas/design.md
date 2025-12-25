# Design Document: Gallery Canvas

## Overview

The Gallery Canvas is the core visual rendering system in RawDrive that displays photos and videos in the gallery view. This design document outlines the architecture, components, data models, and implementation strategy for building a high-performance, accessible, and feature-rich gallery canvas that integrates with the existing RawDrive platform.

The Gallery Canvas will be implemented as a React component system using TypeScript, leveraging the existing frontend architecture with Vite, Tailwind CSS, and the established design system. It will integrate with the existing backend services for asset management, signed URLs, and gallery operations.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GalleryDetailPage                                  │
│  (Parent container - orchestrates state and API calls)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        GalleryToolbar                                │   │
│  │  [View Toggle] [Search] [Filters] [Select All] [Stats]              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        GalleryCanvas                                 │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │                    LayoutRenderer                            │   │   │
│  │  │  (Grid or Masonry based on viewMode)                        │   │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │   │   │
│  │  │  │PhotoCard│ │PhotoCard│ │PhotoCard│ │PhotoCard│           │   │   │
│  │  │  │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │           │   │   │
│  │  │  │ │Image│ │ │ │Image│ │ │ │Image│ │ │ │Image│ │           │   │   │
│  │  │  │ │Hover│ │ │ │Hover│ │ │ │Hover│ │ │ │Hover│ │           │   │   │
│  │  │  │ │Ovlay│ │ │ │Ovlay│ │ │ │Ovlay│ │ │ │Ovlay│ │           │   │   │
│  │  │  │ └─────┘ │ │ └─────┘ │ │ └─────┘ │ │ └─────┘ │           │   │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      BulkActionBar (conditional)                     │   │
│  │  [X selected] [Move] [Delete] [Download] [Clear]                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Lightbox (modal)                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
GalleryDetailPage
├── GalleryHeader
├── SubGalleryTabs
├── GalleryStats
├── GalleryActionBar
├── GalleryToolbar
│   ├── ViewModeToggle
│   ├── SearchInput
│   ├── FilterDropdown
│   └── SelectAllCheckbox
├── GalleryCanvas (NEW - unified canvas component)
│   ├── GridLayout
│   │   └── PhotoCard[]
│   └── MasonryLayout
│       └── PhotoCard[]
├── PhotoCard
│   ├── ImageRenderer
│   ├── SelectionCheckbox
│   ├── HoverOverlay
│   │   ├── ActionButton (Favorite)
│   │   ├── ActionButton (Download)
│   │   ├── ActionButton (Delete)
│   │   └── ActionButton (More)
│   ├── FaceDetectionOverlay (conditional)
│   ├── WatermarkOverlay (conditional)
│   └── StatusBadges
├── BulkActionBar (conditional)
├── InlineEditForm (conditional)
└── Lightbox (modal)
```

## Components and Interfaces

### GalleryCanvas Component

The main canvas component that orchestrates layout rendering and manages canvas-level state.

```typescript
interface GalleryCanvasProps {
  // Data
  assets: GalleryAssetItem[];
  
  // Layout
  viewMode: 'grid' | 'masonry';
  columns?: ResponsiveColumns;
  gap?: 'sm' | 'md' | 'lg';
  
  // Selection
  selectedAssetIds: Set<string>;
  selectable?: boolean;
  onSelectionChange: (ids: Set<string>) => void;
  
  // Actions
  onAssetClick: (asset: GalleryAssetItem, index: number) => void;
  onAssetFavorite: (assetId: string, favorited: boolean) => void;
  onAssetDownload: (assetId: string) => void;
  onAssetDelete: (assetId: string) => void;
  onAssetEdit: (assetId: string, updates: AssetUpdatePayload) => void;
  onSetCover: (assetId: string) => void;
  
  // Drag and Drop
  sortable?: boolean;
  onSortOrderChange?: (assetIds: string[]) => void;
  onMoveToSubGallery?: (assetId: string, subGalleryId: string | null) => void;
  
  // Display Options
  coverAssetId?: string | null;
  showWatermark?: boolean;
  watermarkSettings?: WatermarkSettings;
  showFaceDetection?: boolean;
  isClientView?: boolean;
  downloadPolicy?: DownloadPolicy;
  
  // State
  isLoading?: boolean;
  error?: Error | null;
}

interface ResponsiveColumns {
  sm?: number;  // < 640px
  md?: number;  // < 1024px
  lg?: number;  // < 1536px
  xl?: number;  // >= 1536px
}
```

### PhotoCard Component

Individual photo/video card with all interactive features.

```typescript
interface PhotoCardProps {
  asset: GalleryAssetItem;
  index: number;
  
  // Selection
  isSelected: boolean;
  selectable: boolean;
  onSelect: (assetId: string) => void;
  
  // Actions
  onClick: (asset: GalleryAssetItem, index: number) => void;
  onFavorite: (assetId: string, favorited: boolean) => void;
  onDownload: (assetId: string) => void;
  onDelete: (assetId: string) => void;
  onEdit: (assetId: string) => void;
  onSetCover: (assetId: string) => void;
  
  // Display
  isCover?: boolean;
  showActions?: boolean;
  showWatermark?: boolean;
  watermarkSettings?: WatermarkSettings;
  showFaceDetection?: boolean;
  faceData?: FaceDetectionData[];
  isClientView?: boolean;
  
  // Layout
  aspectRatio?: 'square' | 'auto';
}

interface PhotoCardState {
  imageLoaded: boolean;
  imageError: boolean;
  isHovered: boolean;
  isEditing: boolean;
}
```

### Selection State Management

```typescript
interface SelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  selectionMode: 'single' | 'multi' | 'range';
}

interface SelectionActions {
  select: (assetId: string) => void;
  deselect: (assetId: string) => void;
  toggle: (assetId: string) => void;
  selectRange: (fromId: string, toId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isSelected: (assetId: string) => boolean;
}

// Custom hook for selection management
function useSelection(assets: GalleryAssetItem[]): [SelectionState, SelectionActions] {
  const [state, setState] = useState<SelectionState>({
    selectedIds: new Set(),
    lastSelectedId: null,
    selectionMode: 'single',
  });
  
  // Implementation handles Ctrl/Cmd+click, Shift+click, and regular click
  // Returns memoized actions for performance
}
```

### HoverOverlay Component

```typescript
interface HoverOverlayProps {
  asset: GalleryAssetItem;
  isVisible: boolean;
  onFavorite: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSetCover: () => void;
  onMoreOptions: () => void;
  isClientView?: boolean;
  downloadPolicy?: DownloadPolicy;
}
```

### WatermarkOverlay Component

```typescript
interface WatermarkOverlayProps {
  settings: WatermarkSettings;
  containerWidth: number;
  containerHeight: number;
}

interface WatermarkSettings {
  enabled: boolean;
  imageUrl?: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tiled';
  opacity: number; // 0.1 to 1.0
  scale?: number;  // For tiled mode
}
```

### FaceDetectionOverlay Component

```typescript
interface FaceDetectionOverlayProps {
  faces: FaceDetectionData[];
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  onFaceClick?: (faceId: string) => void;
  showConfidence?: boolean;
}

interface FaceDetectionData {
  faceId: string;
  boundingBox: {
    x: number;      // Percentage 0-100
    y: number;      // Percentage 0-100
    width: number;  // Percentage 0-100
    height: number; // Percentage 0-100
  };
  personName?: string;
  personId?: string;
  confidence?: number;
}
```

### BulkActionBar Component

```typescript
interface BulkActionBarProps {
  selectedCount: number;
  selectedAssetIds: Set<string>;
  assets: GalleryAssetItem[];
  subGalleries: SubGalleryItem[];
  onMove: (assetIds: string[], subGalleryId: string | null) => void;
  onDelete: (assetIds: string[]) => void;
  onDownload: (assetIds: string[]) => void;
  onClearSelection: () => void;
}
```

### InlineEditForm Component

```typescript
interface InlineEditFormProps {
  asset: GalleryAssetItem;
  onSave: (updates: AssetUpdatePayload) => Promise<void>;
  onCancel: () => void;
}

interface AssetUpdatePayload {
  title?: string;
  description?: string;
  tags?: string[];
  isPrivate?: boolean;
}
```

## Data Models

### Canvas State

```typescript
interface CanvasState {
  // View
  viewMode: 'grid' | 'masonry';
  
  // Selection
  selectedAssetIds: Set<string>;
  lastSelectedAssetId: string | null;
  
  // Editing
  editingAssetId: string | null;
  
  // UI State
  hoveredAssetId: string | null;
  focusedAssetId: string | null;
  
  // Loading
  loadingAssetIds: Set<string>;
  visibleAssetIds: Set<string>;
  
  // Scroll
  scrollPosition: number;
  virtualScrollOffset: number;
}
```

### Asset Display State

```typescript
interface AssetDisplayState {
  assetId: string;
  imageLoaded: boolean;
  imageError: boolean;
  signedUrl: string | null;
  signedUrlExpiry: number | null;
}
```

### Layout Configuration

```typescript
interface GridLayoutConfig {
  columns: ResponsiveColumns;
  gap: number;
  aspectRatio: 'square' | '4/3' | '3/2' | '16/9';
}

interface MasonryLayoutConfig {
  columnWidth: number;
  gap: number;
  minColumns: number;
  maxColumns: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*



### Property 1: Grid Layout Uniform Cells

*For any* set of photos rendered in grid layout, all cells SHALL have equal width and height (1:1 aspect ratio), and the column count SHALL match the responsive breakpoint rules for the current viewport width.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

### Property 2: Masonry Layout Aspect Ratio Preservation

*For any* set of photos with known dimensions rendered in masonry layout, each cell's height-to-width ratio SHALL match the original photo's aspect ratio, and column heights SHALL be balanced (maximum difference < 20% of average column height).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: View Mode Toggle Preserves Selection

*For any* selection state and view mode, switching between grid and masonry layouts SHALL preserve the exact set of selected asset IDs.

**Validates: Requirements 3.2, 3.3**

### Property 4: Photo Card Loading States

*For any* photo card, the component SHALL display exactly one of: skeleton placeholder (loading), error placeholder (failed), or image (loaded), based on the current loading state.

**Validates: Requirements 4.1, 4.2, 4.5, 4.6**

### Property 5: Lazy Loading Triggers on Visibility

*For any* photo that enters the viewport (with 200px margin), the Gallery Canvas SHALL initiate image loading within one render cycle.

**Validates: Requirements 5.2, 5.3**

### Property 6: Selection Toggle Idempotence

*For any* photo, clicking it twice (without modifier keys) SHALL return the selection state to its original value (toggle is its own inverse).

**Validates: Requirements 6.1, 6.5**

### Property 7: Multi-Select with Modifier Keys

*For any* set of photos and selection state, Ctrl/Cmd+click SHALL add or remove exactly one photo from selection without affecting others, and Shift+click SHALL select all photos in the range between last selected and clicked photo (inclusive).

**Validates: Requirements 7.1, 7.2, 7.4, 7.5**

### Property 8: Select All Completeness

*For any* gallery with N visible photos, clicking "Select All" SHALL result in exactly N photos being selected, and clicking "Deselect All" SHALL result in 0 photos being selected.

**Validates: Requirements 8.2, 8.4, 8.5**

### Property 9: Hover Overlay Visibility

*For any* photo card, the hover overlay SHALL be visible if and only if the card is currently hovered.

**Validates: Requirements 9.1, 9.4**

### Property 10: Favorite Toggle Round Trip

*For any* photo, toggling favorite status and then toggling again SHALL return to the original favorite state, and the API SHALL be called exactly twice.

**Validates: Requirements 10.1, 10.3, 10.4**

### Property 11: Download Policy Enforcement

*For any* download attempt, the download SHALL succeed if and only if the gallery's download policy permits it, and the downloaded variant SHALL match the policy (view_only → blocked, web_only → web variant, original_allowed → original).

**Validates: Requirements 11.1, 11.2, 11.3, 11.4**

### Property 12: Delete with Undo Restoration

*For any* deleted photo, clicking undo within 8 seconds SHALL restore the photo to its original position in the gallery.

**Validates: Requirements 12.2, 12.4, 12.5**

### Property 13: Inline Edit Save and Cancel

*For any* inline edit session, pressing Escape SHALL discard all changes and restore original values, while pressing Enter or clicking outside SHALL persist changes via API.

**Validates: Requirements 13.3, 13.4, 13.5**

### Property 14: Bulk Action Bar Selection Count

*For any* selection state with N > 0 selected photos, the Bulk Action Bar SHALL display exactly N as the selected count.

**Validates: Requirements 14.1, 14.2**

### Property 15: Bulk Delete Atomicity

*For any* bulk delete operation on N photos, exactly one API request SHALL be made, and all N photos SHALL be removed from the UI atomically.

**Validates: Requirements 15.2, 15.3, 15.5**

### Property 16: Bulk Move Destination

*For any* bulk move operation, all selected photos SHALL be moved to the specified sub-gallery, and the UI SHALL reflect the new location.

**Validates: Requirements 16.3, 16.4, 16.5**

### Property 17: Drag and Drop Sort Order

*For any* drag and drop reorder operation, the new sort order SHALL be persisted via API, and the UI SHALL reflect the new order immediately.

**Validates: Requirements 17.3, 17.4, 17.5**

### Property 18: Drag to Sub-Gallery Tab

*For any* photo dragged to a sub-gallery tab, the photo SHALL be moved to that sub-gallery and removed from its current location.

**Validates: Requirements 18.2, 18.3, 18.5**

### Property 19: Virtual Scrolling DOM Efficiency

*For any* gallery with more than 100 photos, the number of rendered DOM nodes SHALL be less than 2x the number of visible items plus buffer.

**Validates: Requirements 19.1, 19.2**

### Property 20: Lightbox Navigation

*For any* lightbox session, pressing left/right arrow keys SHALL navigate to adjacent photos, and pressing Escape SHALL close the lightbox and restore focus.

**Validates: Requirements 20.1, 20.2, 20.5**

### Property 21: Face Detection Overlay Positioning

*For any* detected face with bounding box coordinates, the overlay SHALL be positioned at the correct percentage coordinates relative to the image dimensions.

**Validates: Requirements 21.1, 21.2, 21.4**

### Property 22: Watermark Overlay Configuration

*For any* watermark configuration, the overlay SHALL be positioned according to the position setting, have the specified opacity, and use pointer-events: none.

**Validates: Requirements 22.1, 22.2, 22.3, 22.5**

### Property 23: Cover Photo Badge

*For any* gallery, exactly one photo (the cover) SHALL display the "Cover" badge, and setting a new cover SHALL move the badge to the new photo.

**Validates: Requirements 23.2, 23.3, 23.4**

### Property 24: Search Filter Results

*For any* search query, the displayed photos SHALL be exactly those whose filenames contain the query string (case-insensitive).

**Validates: Requirements 24.2, 24.4, 24.5**

### Property 25: Keyboard Navigation

*For any* focused photo card, pressing Enter SHALL open the lightbox, pressing Space SHALL toggle selection, and arrow keys SHALL move focus to adjacent photos.

**Validates: Requirements 25.1, 25.3, 25.4, 25.5**

### Property 26: Accessibility Attributes

*For any* photo card and action button, the element SHALL have a non-empty aria-label that describes its content or function.

**Validates: Requirements 26.2, 26.4**

### Property 27: Client View Control Visibility

*For any* client view session, editing and deletion controls SHALL be hidden, and favoriting/selecting/downloading controls SHALL be visible if and only if enabled in gallery settings.

**Validates: Requirements 27.1, 27.2, 27.3, 27.4**

### Property 28: Responsive Column Count

*For any* viewport width, the column count SHALL match the responsive breakpoint rules: 2 columns < 640px, 3 columns < 1024px, 4 columns < 1536px, 5 columns >= 1536px.

**Validates: Requirements 28.1, 28.5**

### Property 29: Loading and Empty States

*For any* gallery state, exactly one of loading skeleton, empty state, error state, or photo grid SHALL be displayed based on the current loading/error/data state.

**Validates: Requirements 29.1, 29.3, 29.5**

### Property 30: API Request Batching

*For any* set of visible photos requiring signed URLs, the Gallery Canvas SHALL make at most ceil(N/20) API requests (batch size 20).

**Validates: Requirements 5.3, 30.5**

## Error Handling

### Image Loading Errors

```typescript
interface ImageLoadingErrorHandler {
  onError: (assetId: string, error: Error) => void;
  retryCount: number;
  maxRetries: number;
}

// Error handling strategy:
// 1. Display error placeholder immediately
// 2. Retry loading up to 3 times with exponential backoff
// 3. Log error for monitoring
// 4. Allow manual retry via user action
```

### API Error Handling

```typescript
interface APIErrorHandler {
  // Optimistic update rollback
  onFavoriteError: (assetId: string, previousState: boolean) => void;
  onDeleteError: (assetId: string) => void;
  onMoveError: (assetIds: string[], previousSubGalleryId: string | null) => void;
  
  // User feedback
  showErrorToast: (message: string) => void;
  showRetryOption: (action: () => Promise<void>) => void;
}

// Error handling patterns:
// 1. Optimistic updates with rollback on failure
// 2. Toast notifications for user feedback
// 3. Retry options for transient failures
// 4. Graceful degradation for non-critical features
```

### Selection State Errors

```typescript
// Handle edge cases in selection:
// 1. Asset removed while selected → remove from selection
// 2. Range selection with deleted assets → skip deleted
// 3. Select all with filter → only select filtered items
```

### Signed URL Expiration

```typescript
interface SignedUrlManager {
  // Proactive refresh before expiration
  refreshThreshold: number; // 5 minutes before expiry
  
  // Handle expired URLs
  onUrlExpired: (assetId: string) => Promise<string>;
  
  // Batch refresh for visible items
  refreshVisibleUrls: () => Promise<void>;
}
```

## Testing Strategy

### Unit Tests

Unit tests will verify individual component behavior and edge cases:

1. **PhotoCard Component**
   - Renders correct loading/error/loaded states
   - Displays correct badges (favorite, cover, video)
   - Handles click events correctly
   - Applies correct styles for selection state

2. **Selection Logic**
   - Single selection toggle
   - Multi-select with Ctrl/Cmd
   - Range selection with Shift
   - Select all / deselect all
   - Edge cases (empty gallery, single item)

3. **Layout Calculations**
   - Grid column count at breakpoints
   - Masonry column distribution
   - Gap spacing calculations

4. **Overlay Components**
   - Watermark positioning
   - Face detection bounding boxes
   - Hover overlay visibility

### Property-Based Tests

Property-based tests will verify universal properties using Hypothesis (Python) or fast-check (TypeScript):

1. **Selection Properties**
   - Toggle idempotence
   - Multi-select preserves other selections
   - Range selection includes endpoints
   - Select all completeness

2. **Layout Properties**
   - Grid cells are uniform
   - Masonry preserves aspect ratios
   - Column count matches breakpoints

3. **State Consistency**
   - View mode toggle preserves selection
   - Filter changes preserve selection
   - Scroll position preservation

4. **API Integration**
   - Favorite toggle round trip
   - Delete with undo restoration
   - Bulk operations atomicity

### Integration Tests

Integration tests will verify component interactions:

1. **Canvas with Toolbar**
   - View mode toggle updates canvas
   - Search filters canvas content
   - Filter toggles update display

2. **Canvas with Lightbox**
   - Click opens lightbox
   - Navigation updates lightbox
   - Close restores focus

3. **Canvas with Bulk Actions**
   - Selection shows bulk bar
   - Bulk actions affect all selected
   - Clear selection hides bar

### Accessibility Tests

Accessibility tests using axe-core and manual testing:

1. **Keyboard Navigation**
   - Tab order is logical
   - Arrow keys navigate grid
   - Enter/Space activate items

2. **Screen Reader**
   - All images have alt text
   - Actions have aria-labels
   - State changes are announced

3. **Color Contrast**
   - Selection indicators visible
   - Focus indicators visible
   - Text meets WCAG AA

### Performance Tests

Performance benchmarks:

1. **Rendering Performance**
   - Initial render < 1.5s
   - 60fps scrolling with 1000 items
   - Memory < 100MB with 1000 items

2. **Network Performance**
   - Batch API requests
   - Lazy loading efficiency
   - Signed URL caching

## Implementation Notes

### Existing Code Integration

The Gallery Canvas will integrate with existing components:

1. **PhotoGrid** (`frontend/src/components/features/gallery/PhotoGrid.tsx`)
   - Extend existing PhotoGrid with new features
   - Maintain backward compatibility with current props
   - Add new overlay and selection features

2. **PhotoCard** (`frontend/src/components/features/gallery/PhotoCard.tsx`)
   - Enhance with face detection overlay
   - Add watermark overlay support
   - Improve accessibility attributes

3. **GalleryDetailPage** (`frontend/src/pages/workspace/GalleryDetailPage.tsx`)
   - Already orchestrates gallery state
   - Add new canvas configuration options
   - Integrate enhanced selection management

4. **Signed URL Service** (`frontend/src/services/signedUrlService.ts`)
   - Leverage existing batch URL fetching
   - Add proactive URL refresh
   - Improve caching strategy

### New Components to Create

1. **GalleryCanvas** - Unified canvas wrapper component
2. **WatermarkOverlay** - Configurable watermark display
3. **FaceDetectionOverlay** - Face bounding boxes and tags
4. **InlineEditForm** - Quick metadata editing
5. **useSelection** - Custom hook for selection management
6. **useVirtualScroll** - Custom hook for virtual scrolling

### Dependencies

- **@dnd-kit/core** - Already used for drag and drop
- **react-window** or **@tanstack/virtual** - For virtual scrolling
- **Intersection Observer API** - Native browser API for lazy loading

### Migration Strategy

1. **Phase 1**: Enhance existing PhotoGrid with new overlays
2. **Phase 2**: Add unified GalleryCanvas wrapper
3. **Phase 3**: Implement virtual scrolling for large galleries
4. **Phase 4**: Add face detection and watermark overlays
5. **Phase 5**: Accessibility improvements and testing

