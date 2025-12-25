# Gallery Canvas

## Overview

The Gallery Canvas is the core visual rendering system in RawDrive that displays photos and videos in the gallery view. It provides photographers and clients with an interactive, responsive interface for browsing, organizing, and interacting with media content. The canvas handles multiple layout modes, media rendering, selection states, and interactive overlays.

## Purpose

The Gallery Canvas serves as the central hub for:
- **Media Display**: Render photos and videos in responsive grid or masonry layouts
- **User Interaction**: Enable selection, favoriting, downloading, and quick editing
- **Visual Feedback**: Show selection states, privacy badges, face tags, and watermarks
- **Performance**: Efficiently render large galleries with hundreds or thousands of photos
- **Accessibility**: Provide keyboard navigation and screen reader support

## Architecture

### Core Components

#### PhotoGrid (`components/ui/PhotoGrid.tsx`)
The primary canvas component responsible for rendering media items.

**Responsibilities:**
- Render photos and videos in grid or masonry layout
- Handle responsive column calculations based on screen width
- Manage selection state for individual items
- Display inline editing overlays
- Render face detection bounding boxes and tags
- Apply watermarks to images
- Handle hover states and interactive elements

**Props:**
```typescript
interface PhotoGridProps {
  photos: Photo[];
  viewMode: 'grid' | 'masonry';
  selectedPhotos: string[];
  onPhotoSelect: (photoId: string, multiSelect: boolean) => void;
  onPhotoDeselect: (photoId: string) => void;
  onPhotoClick: (photo: Photo) => void;
  onEditPhoto: (photo: Photo) => void;
  onDeletePhoto: (photoId: string) => void;
  onDownloadPhoto: (photoId: string) => void;
  onToggleFavorite: (photoId: string) => void;
  onTogglePick: (photoId: string) => void;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  watermarkSettings?: WatermarkSettings;
  showMetadata?: boolean;
  allowDownload?: boolean;
  isClientView?: boolean;
}
```

**Key Features:**
- **Grid Layout**: Uniform square cells with consistent sizing
- **Masonry Layout**: Pinterest-style waterfall layout that adapts to image aspect ratios
- **Responsive Design**: Automatically adjusts column count based on viewport width
- **Virtual Scrolling**: Renders only visible items for performance with large galleries
- **Lazy Loading**: Images load as they enter the viewport

#### Photo Card (Internal to PhotoGrid)
Individual photo/video item renderer within the canvas.

**Responsibilities:**
- Render media thumbnail or full image
- Display selection checkbox
- Show privacy badges and status indicators
- Render face detection overlays
- Handle hover actions (edit, delete, download, favorite, pick)
- Apply watermark overlay
- Show metadata (filename, dimensions, EXIF data)

**Visual States:**
- **Default**: Normal display with subtle hover effects
- **Selected**: Highlighted with checkmark and accent color
- **Hovered**: Shows action buttons and metadata
- **Loading**: Skeleton or spinner while image loads
- **Error**: Placeholder with error message
- **Private**: Lock badge indicating restricted access
- **Favorite**: Heart icon indicating photographer favorite
- **Picked**: Checkmark icon indicating client selection

#### AdminToolbar (`components/ui/AdminToolbar.tsx`)
Control panel above the canvas for photographers.

**Responsibilities:**
- Provide search/filter inputs
- Display view mode toggle (Grid/Masonry)
- Show filter options (Picks Only, Favorites Only)
- Render bulk action buttons (Select All, Delete, Download, Move)
- Display gallery statistics (total items, favorites, picks)

**Controls:**
```typescript
interface AdminToolbarProps {
  viewMode: 'grid' | 'masonry';
  onViewModeChange: (mode: 'grid' | 'masonry') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterMode: 'all' | 'picks' | 'favorites';
  onFilterChange: (mode: 'all' | 'picks' | 'favorites') => void;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkDelete: () => void;
  onBulkDownload: () => void;
  stats: GalleryStats;
}
```

#### BrandingHeader & BrandingFooter (`components/Branding.tsx`)
Canvas frame elements that display branding and navigation.

**Header Responsibilities:**
- Display studio logo and name
- Show gallery title
- Render sub-gallery navigation tabs
- Display social media links
- Provide access to gallery settings (photographer view)

**Footer Responsibilities:**
- Display contact information (email, phone, address)
- Show copyright and branding
- Render social media links
- Display custom menu links

### Layout Modes

#### Grid Layout
Uniform square cells arranged in responsive columns.

**Characteristics:**
- Fixed aspect ratio (1:1 square)
- Consistent sizing across all items
- Predictable column count based on viewport
- Best for uniform photo collections
- Faster rendering performance

**Responsive Breakpoints:**
```typescript
const getGridColumns = (width: number): number => {
  if (width < 640) return 2;      // Mobile: 2 columns
  if (width < 1024) return 3;     // Tablet: 3 columns
  if (width < 1536) return 4;     // Desktop: 4 columns
  return 5;                        // Large desktop: 5 columns
};
```

#### Masonry Layout
Pinterest-style waterfall layout that preserves image aspect ratios.

**Characteristics:**
- Variable height cells based on image aspect ratio
- Natural-looking arrangement
- Better visual representation of photos
- Slightly slower rendering with many items
- More engaging for diverse photo collections

**Implementation:**
- Uses CSS columns or JavaScript-based layout algorithm
- Calculates optimal column count based on viewport
- Distributes items to balance column heights
- Handles responsive resizing

### Media Rendering

#### Image Rendering
```typescript
interface ImageRenderProps {
  photo: Photo;
  thumbnail?: boolean;
  watermark?: WatermarkSettings;
  showMetadata?: boolean;
}

// Rendering strategy:
// 1. Show placeholder/skeleton while loading
// 2. Load thumbnail first (fast, low-res)
// 3. Load full resolution on demand (hover or click)
// 4. Apply watermark overlay if configured
// 5. Display metadata overlay on hover
```

**Optimization Techniques:**
- **Lazy Loading**: `loading="lazy"` attribute on img tags
- **Responsive Images**: Use `srcset` for different screen sizes
- **Progressive Loading**: Thumbnail → Full resolution
- **Caching**: Browser cache and CDN caching
- **Format Optimization**: WebP for modern browsers, JPG fallback

#### Video Rendering
```typescript
interface VideoRenderProps {
  photo: Photo; // Contains video URL
  thumbnail?: string; // Video poster/thumbnail
  controls?: boolean;
  autoplay?: boolean;
  muted?: boolean;
}

// Video features:
// - Play/pause controls
// - Volume control
// - Playback speed adjustment
// - Trim start/end times (photographer view)
// - Full-screen support
```

### Selection System

#### Single Selection
Clicking a photo item toggles its selection state.

```typescript
const handlePhotoClick = (photoId: string, event: React.MouseEvent) => {
  if (event.ctrlKey || event.metaKey) {
    // Multi-select with Ctrl/Cmd
    toggleMultiSelect(photoId);
  } else if (event.shiftKey) {
    // Range select with Shift
    selectRange(photoId);
  } else {
    // Single select
    setSelectedPhotos([photoId]);
  }
};
```

#### Multi-Select
- **Ctrl/Cmd + Click**: Add/remove individual items
- **Shift + Click**: Select range between last selected and clicked item
- **Select All**: Bulk select all visible items
- **Deselect All**: Clear all selections

#### Selection State Management
```typescript
interface SelectionState {
  selectedPhotos: Set<string>;
  lastSelectedId?: string;
  isSelectingRange: boolean;
}

// Selection persists across:
// - View mode changes (Grid ↔ Masonry)
// - Filter changes (All → Picks → Favorites)
// - Pagination/scrolling
// - Sub-gallery navigation
```

### Interactive Overlays

#### Hover Actions
Actions revealed on hover (photographer view):
- **Edit**: Quick inline editing of title, description, tags
- **Delete**: Remove photo from gallery
- **Download**: Download individual photo
- **Favorite**: Mark as photographer favorite
- **Pick**: Mark for client selection
- **Privacy**: Toggle private/public status
- **More**: Additional actions menu

#### Face Detection Overlay
When face detection is enabled:
- Render bounding boxes around detected faces
- Display person name tags
- Allow clicking to tag/untag people
- Show confidence scores (optional)

#### Watermark Overlay
Applied based on gallery settings:
- **Position**: Center, corners (TL/TR/BL/BR), or tiled
- **Opacity**: 10-100% adjustable
- **Logo**: Custom watermark image or brand logo
- **Tiling**: Repeat pattern across image

#### Metadata Overlay
Displayed on hover or in dedicated panel:
- Filename and file size
- Dimensions (width × height)
- EXIF data (camera, ISO, aperture, shutter speed, focal length)
- Upload date
- AI-generated tags and captions

### Inline Editing

#### Quick Edit Form
Overlay form for editing photo metadata without leaving the canvas.

**Editable Fields:**
```typescript
interface PhotoEditForm {
  title: string;
  description: string;
  tags: string[];
  isPrivate: boolean;
  accessCode?: string;
}
```

**Behavior:**
- Appears on hover or click "Edit" button
- Saves on blur or Enter key
- Cancels on Escape key
- Shows loading state while saving
- Displays error messages if save fails
- Reverts to previous state on error

### Bulk Actions

#### Bulk Selection Actions
Available when one or more photos are selected:

**Delete**
- Confirm dialog before deletion
- Remove from gallery
- Update UI immediately (optimistic update)
- Show undo option for brief period

**Download**
- Open download modal
- Allow format selection (Original/Web Optimized)
- Generate zip file for multiple items
- Show download progress

**Move**
- Select destination sub-gallery
- Move selected items
- Update UI immediately
- Show success notification

**Tag**
- Apply tags to all selected items
- Add or remove tags in bulk
- Show tag suggestions

**Privacy**
- Toggle private/public for selected items
- Set access codes for private items
- Update permissions in bulk

### Performance Optimization

#### Virtual Scrolling
Render only visible items to handle large galleries efficiently.

```typescript
// Example with react-window
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={800}
  itemCount={photos.length}
  itemSize={200}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <PhotoCard photo={photos[index]} />
    </div>
  )}
</FixedSizeList>
```

**Benefits:**
- Handles 1000+ photos smoothly
- Reduces DOM nodes significantly
- Improves scroll performance
- Maintains smooth 60fps scrolling

#### Image Optimization
- **Lazy Loading**: Load images as they enter viewport
- **Responsive Images**: Serve appropriate resolution for device
- **Format Selection**: WebP for modern browsers, JPG fallback
- **Compression**: Optimize file sizes without quality loss
- **CDN Caching**: Leverage CDN for fast delivery

#### Memoization
Prevent unnecessary re-renders of photo cards.

```typescript
const PhotoCard = memo(({ photo, isSelected, onSelect }: PhotoCardProps) => {
  return (
    // Card content
  );
}, (prevProps, nextProps) => {
  // Custom comparison for deep equality
  return (
    prevProps.photo.id === nextProps.photo.id &&
    prevProps.isSelected === nextProps.isSelected
  );
});
```

### Accessibility

#### Keyboard Navigation
- **Tab**: Navigate between photos and controls
- **Enter/Space**: Select/deselect photo
- **Ctrl/Cmd + A**: Select all
- **Delete**: Delete selected photos
- **Arrow Keys**: Navigate between photos in grid
- **Escape**: Deselect all or close overlays

#### Screen Reader Support
- Semantic HTML structure with proper heading hierarchy
- ARIA labels for icon buttons
- Live regions for status updates
- Descriptive alt text for images
- Form labels for inline editing

#### Focus Management
- Visible focus indicators on all interactive elements
- Focus trap in modals and overlays
- Return focus to trigger element when closing overlays
- Logical tab order following visual layout

#### Color Contrast
- Minimum 4.5:1 contrast ratio for text
- 3:1 contrast ratio for UI components
- Selection indicators visible in both light and dark themes
- Status badges have sufficient contrast

## Data Flow

### State Management
```typescript
interface GalleryCanvasState {
  photos: Photo[];
  selectedPhotos: Set<string>;
  viewMode: 'grid' | 'masonry';
  filterMode: 'all' | 'picks' | 'favorites';
  searchQuery: string;
  editingPhotoId?: string;
  isLoading: boolean;
  error?: string;
}
```

### Update Flow
1. User interacts with canvas (click, select, edit)
2. Event handler updates local state
3. Optimistic UI update (immediate visual feedback)
4. API call to backend
5. Confirm or revert based on response
6. Update parent component state if needed

### Props Flow
```
AlbumDetailView (Parent)
  ├── AdminToolbar (Controls)
  ├── PhotoGrid (Canvas)
  │   ├── PhotoCard (Item)
  │   ├── PhotoCard (Item)
  │   └── PhotoCard (Item)
  ├── BrandingHeader (Frame)
  └── BrandingFooter (Frame)
```

## Integration Points

### With AlbumDetailView
- Receives photo data and gallery settings
- Sends selection and action events
- Receives view mode and filter changes
- Communicates with modals (edit, delete, download)

### With Services
- **geminiService**: AI analysis, face detection, story generation
- **API Service**: Fetch photos, update metadata, delete items
- **Storage Service**: Handle downloads and uploads

### With Modals
- **AccessCodeModal**: Unlock private photos
- **ClientDownloadModal**: Download selected photos
- **EditPhotoModal**: Detailed photo editing
- **DeleteConfirmModal**: Confirm photo deletion

## Client View vs Admin View

### Admin View (Photographer)
- Full editing capabilities
- Bulk actions (delete, move, tag)
- View mode toggle (Grid/Masonry)
- Filter options (Picks, Favorites)
- Inline editing
- Face detection controls
- Watermark preview
- Statistics dashboard

### Client View (End User)
- Read-only browsing
- Selection for proofing (if enabled)
- Download capability (if enabled)
- Favorites marking (if enabled)
- Slideshow mode
- Deep zoom
- No editing or deletion
- Simplified toolbar

## Configuration

### Gallery Settings Affecting Canvas
```typescript
interface GalleryCanvasConfig {
  // Layout
  defaultViewMode: 'grid' | 'masonry';
  
  // Display
  showMetadata: boolean;
  showWatermark: boolean;
  watermarkSettings: WatermarkSettings;
  
  // Interaction
  allowDownload: boolean;
  allowFavorites: boolean;
  allowPicks: boolean;
  allowSelection: boolean;
  
  // Performance
  itemsPerPage: number;
  enableVirtualScrolling: boolean;
  lazyLoadImages: boolean;
  
  // Branding
  brandingSettings: BrandingSettings;
}
```

## Related Files

- `/components/ui/PhotoGrid.tsx` - Main canvas component
- `/components/AlbumDetailView.tsx` - Parent container
- `/components/Branding.tsx` - Header and footer
- `/components/ui/AdminToolbar.tsx` - Control toolbar
- `/services/geminiService.ts` - AI features
- `/types.ts` - Type definitions (Photo, Album, GallerySettings)
- `/docs/GALLERY_FEATURES.md` - Gallery feature overview
- `/docs/PHOTO_MANAGEMENT.md` - Photo operations

## Last Updated

2025-12-17
