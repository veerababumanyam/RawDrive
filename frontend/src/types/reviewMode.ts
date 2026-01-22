/**
 * Review Mode Types
 * Pro Review Mode for professional photo culling workflow
 * Feature: 029-pro-review-xmp-sync
 */

// Asset flag values (matches Lightroom/XMP)
export type AssetFlag = 'pick' | 'unflagged' | 'reject';

// Asset color label (matches Lightroom/XMP)
export type ColorLabel = 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple';

// Rating is 0-5 (0 means unrated, 1-5 are star ratings)
export type AssetRating = 0 | 1 | 2 | 3 | 4 | 5;

// Asset metadata for Review Mode
export interface AssetMetadata {
  rating: AssetRating | null;
  flag: AssetFlag;
  color_label: ColorLabel;
}

// Request to update asset metadata
export interface AssetMetadataUpdateRequest {
  rating?: AssetRating | null;
  flag?: AssetFlag;
  color_label?: ColorLabel;
}

// Single item in batch update
export interface BatchAssetMetadataItem {
  asset_id: string;
  rating?: AssetRating | null;
  flag?: AssetFlag;
  color_label?: ColorLabel;
}

// Batch update request
export interface BatchAssetMetadataUpdateRequest {
  items: BatchAssetMetadataItem[];
}

// Response from metadata update
export interface AssetMetadataResponse {
  asset_id: string;
  rating: AssetRating | null;
  flag: AssetFlag;
  color_label: ColorLabel;
  updated_at: string;
}

// Response from batch update
export interface BatchAssetMetadataUpdateResponse {
  success_count: number;
  failed_count: number;
  results: Array<{
    asset_id: string;
    success: boolean;
    error?: string;
  }>;
}

// Filter parameters for assets
export interface AssetFilterParams {
  rating?: AssetRating;
  rating_min?: AssetRating;
  rating_max?: AssetRating;
  flag?: AssetFlag;
  color_label?: ColorLabel;
  color_labels?: ColorLabel[];
  unrated?: boolean;
  has_rating?: boolean;
  sub_gallery_id?: string;
  sort_by?: 'sort_order' | 'rating' | 'filename' | 'date_taken';
  sort_direction?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// Filtered assets response
export interface FilteredAssetsResponse {
  assets: FilteredAsset[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// EXIF data embedded in asset
export interface AssetExifData {
  camera_make?: string;
  camera_model?: string;
  lens?: string;
  aperture?: number | string;
  shutter_speed?: number | string;
  iso?: number;
  focal_length?: number;
  flash?: string;
  white_balance?: string;
  metering_mode?: string;
}

// Filtered asset item (includes all metadata for Review Mode)
export interface FilteredAsset {
  asset_id: string;
  gallery_asset_id: string;
  filename: string;
  file_type?: string;
  file_size?: number;
  thumbnail_url?: string;
  preview_url?: string;
  rating: AssetRating | null;
  flag: AssetFlag;
  color_label: ColorLabel;
  sort_order: number;
  sub_gallery_id?: string;
  width?: number;
  height?: number;
  captured_at?: string;
  created_at?: string;
  date_taken?: string;
  exif_data?: AssetExifData;
}

// Review stats for a gallery
export interface ReviewStats {
  total: number;
  total_assets: number;
  byRating: Record<string, number>;
  by_rating: Record<string, number>;
  byFlag: {
    pick: number;
    unflagged: number;
    reject: number;
  };
  by_flag: {
    pick: number;
    unflagged: number;
    reject: number;
  };
  byColorLabel: Record<ColorLabel, number>;
  by_color_label: Record<ColorLabel, number>;
  unrated: number;
  unrated_count: number;
}

// Keyboard shortcut action types
export type ReviewAction =
  | { type: 'SET_RATING'; rating: AssetRating }
  | { type: 'SET_FLAG'; flag: AssetFlag }
  | { type: 'SET_COLOR_LABEL'; colorLabel: ColorLabel }
  | { type: 'NAVIGATE'; direction: 'prev' | 'next' }
  | { type: 'TOGGLE_COMPARE' }
  | { type: 'TOGGLE_HELP' }
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' }
  | { type: 'ZOOM_FIT' };

// Color label display config
export const COLOR_LABEL_CONFIG: Record<ColorLabel, { label: string; color: string; bgColor: string }> = {
  none: { label: 'None', color: 'text-text-tertiary', bgColor: 'bg-transparent' },
  red: { label: 'Red', color: 'text-red-500', bgColor: 'bg-red-500' },
  yellow: { label: 'Yellow', color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  green: { label: 'Green', color: 'text-green-500', bgColor: 'bg-green-500' },
  blue: { label: 'Blue', color: 'text-blue-500', bgColor: 'bg-blue-500' },
  purple: { label: 'Purple', color: 'text-purple-500', bgColor: 'bg-purple-500' },
};

// Flag display config
export const FLAG_CONFIG: Record<AssetFlag, { label: string; icon: string; color: string }> = {
  pick: { label: 'Pick', icon: 'Flag', color: 'text-white bg-primary' },
  unflagged: { label: 'Unflagged', icon: 'Minus', color: 'text-text-tertiary' },
  reject: { label: 'Reject', icon: 'X', color: 'text-white bg-red-600' },
};

// Keyboard shortcuts config
export const KEYBOARD_SHORTCUTS = {
  // Ratings (0-5)
  RATING_0: { key: '0', description: 'Remove rating' },
  RATING_1: { key: '1', description: 'Set 1 star' },
  RATING_2: { key: '2', description: 'Set 2 stars' },
  RATING_3: { key: '3', description: 'Set 3 stars' },
  RATING_4: { key: '4', description: 'Set 4 stars' },
  RATING_5: { key: '5', description: 'Set 5 stars' },
  // Flags
  FLAG_PICK: { key: 'p', description: 'Flag as pick' },
  FLAG_UNFLAG: { key: 'u', description: 'Unflag' },
  FLAG_REJECT: { key: 'x', description: 'Reject' },
  // Color labels (6-9)
  LABEL_RED: { key: '6', description: 'Red label' },
  LABEL_YELLOW: { key: '7', description: 'Yellow label' },
  LABEL_GREEN: { key: '8', description: 'Green label' },
  LABEL_BLUE: { key: '9', description: 'Blue label' },
  // Navigation
  NAV_PREV: { key: 'ArrowLeft', description: 'Previous photo' },
  NAV_NEXT: { key: 'ArrowRight', description: 'Next photo' },
  NAV_PREV_ALT: { key: ',', description: 'Previous photo' },
  NAV_NEXT_ALT: { key: '.', description: 'Next photo' },
  NAV_FIRST: { key: 'Home', description: 'Go to first photo' },
  NAV_LAST: { key: 'End', description: 'Go to last photo' },
  // View actions
  FULLSCREEN: { key: 'f', description: 'Toggle fullscreen' },
  ZOOM: { key: 'z', description: 'Toggle zoom' },
  COMPARE: { key: 'c', description: 'Toggle compare view' },
  HELP: { key: '?', description: 'Show keyboard shortcuts' },
  ZOOM_IN: { key: '+', description: 'Zoom in' },
  ZOOM_OUT: { key: '-', description: 'Zoom out' },
  ZOOM_FIT: { key: 'f', description: 'Fit to screen' },
  ESCAPE: { key: 'Escape', description: 'Exit Review Mode' },
} as const;

// Filter options for Review Mode UI (simplified alias for UI components)
export interface ReviewFilterOptions {
  minRating?: AssetRating;
  maxRating?: AssetRating;
  flags?: AssetFlag[];
  colorLabels?: ColorLabel[];
  unrated?: boolean;
}
