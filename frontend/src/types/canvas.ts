import { GalleryAssetItem, DownloadPolicy } from './gallery';

export interface ResponsiveColumns {
  sm?: number;  // < 640px
  md?: number;  // < 1024px
  lg?: number;  // < 1536px
  xl?: number;  // >= 1536px
}

export interface WatermarkSettings {
  enabled: boolean;
  imageUrl?: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tiled';
  opacity: number; // 0.1 to 1.0
  scale?: number;  // For tiled mode
}

/**
 * Summary of face detection data for an asset
 * Used in PhotoCard to display face count badge
 */
export interface FaceSummary {
  /** Number of faces detected in the asset */
  faceCount: number;
  /** Names of identified people (from face groups) */
  personNames: string[];
  /** IDs of detected faces for linking to detail view */
  faceIds: string[];
}

export interface AssetUpdatePayload {
  title?: string;
  description?: string;
  tags?: string[];
  is_private?: boolean;
}

export interface GalleryCanvasProps {
  // Data
  assets: GalleryAssetItem[];
  /** Gallery ID - required for face detection feature */
  galleryId?: string;
  
  // Layout
  viewMode: 'grid' | 'masonry';
  columns?: ResponsiveColumns;
  gap?: 'sm' | 'md' | 'lg';
  
  // Management Selection (local UI for CRUD bulk operations)
  selectedAssetIds: Set<string>;
  lastSelectedId?: string | null;
  /** Enable management selection mode for CRUD operations */
  managementSelectable?: boolean;
  /** Show customer selection toggle for delivery workflow */
  showCustomerSelection?: boolean;
  /** Callback when management selection changes */
  onSelectionChange: (ids: Set<string>) => void;
  /** Callback when customer selection toggles (persisted) */
  onCustomerSelectionToggle?: (assetId: string, selected: boolean) => void;
  
  // Actions
  onAssetClick: (asset: GalleryAssetItem, index: number) => void;
  onAssetFavorite?: (assetId: string, favorited: boolean) => void;
  onAssetDownload?: (assetId: string) => void;
  onAssetShare?: (assetId: string) => void;
  onAssetLock?: (assetId: string, isPrivate: boolean) => void;
  onAssetDelete?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: AssetUpdatePayload) => void;
  onSetCover?: (assetId: string) => void;
  
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

  // Virtualization (for large galleries)
  /** Enable virtual scrolling - auto-disabled when sortable */
  enableVirtualization?: boolean;
  /** Row height in pixels for virtualization */
  rowHeight?: number;
  
  // State
  isLoading?: boolean;
  error?: Error | null;
  // Protected Content
  isPrivateUnlocked?: boolean;
  onUnlockPrivate?: () => void;

  className?: string;
}

export interface CanvasState {
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

export interface AssetDisplayState {
  assetId: string;
  imageLoaded: boolean;
  imageError: boolean;
  signedUrl: string | null;
  signedUrlExpiry: number | null;
}

export interface GridLayoutConfig {
  columns: ResponsiveColumns;
  gap: number;
  aspectRatio: 'square' | '4/3' | '3/2' | '16/9';
}

export interface MasonryLayoutConfig {
  columnWidth: number;
  gap: number;
  minColumns: number;
  maxColumns: number;
}

export interface SelectionState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  selectionMode: 'single' | 'multi' | 'range';
}

export interface SelectionActions {
  select: (assetId: string) => void;
  deselect: (assetId: string) => void;
  toggle: (assetId: string) => void;
  selectRange: (fromId: string, toId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isSelected: (assetId: string) => boolean;
  handleSelection: (assetId: string, event: React.MouseEvent | React.KeyboardEvent) => void;
}
