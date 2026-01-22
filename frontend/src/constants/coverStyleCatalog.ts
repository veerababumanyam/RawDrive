/**
 * Gallery Design Studio - Cover Style Catalog
 *
 * 25+ professional cover style templates with metadata.
 * Each style defines a unique layout pattern for gallery cover photos.
 *
 * Aligns with backend CoverStyleEnum in:
 * - services/gallery-service/src/schemas/gallery_design.py
 */

import { CoverStyleId } from '../types/gallery-design';

export interface CoverStyleMetadata {
  id: CoverStyleId;
  name: string;
  description: string;
  category: 'basic' | 'text' | 'advanced' | 'premium';
  thumbnail: string;
  premium: boolean;
}

/**
 * Basic Cover Styles (3)
 * Fundamental layouts - simple and direct
 */

const CENTER_STYLE: CoverStyleMetadata = {
  id: 'center',
  name: 'Center',
  description: 'Title centered on cover image with overlay',
  category: 'basic',
  thumbnail: '/assets/cover-previews/center.svg',
  premium: false,
};

const LEFT_STYLE: CoverStyleMetadata = {
  id: 'left',
  name: 'Left',
  description: 'Title aligned to left side with accent overlay',
  category: 'basic',
  thumbnail: '/assets/cover-previews/left.svg',
  premium: false,
};

const NONE_STYLE: CoverStyleMetadata = {
  id: 'none',
  name: 'None',
  description: 'Full-bleed image with no text overlay',
  category: 'basic',
  thumbnail: '/assets/cover-previews/none.svg',
  premium: false,
};

/**
 * Text Placement Variations (8)
 * Creative text positioning and backgrounds
 */

const VINTAGE_STYLE: CoverStyleMetadata = {
  id: 'vintage',
  name: 'Vintage',
  description: 'Retro banner style with aged texture overlay',
  category: 'text',
  thumbnail: '/assets/cover-previews/vintage.svg',
  premium: false,
};

const NOVEL_STYLE: CoverStyleMetadata = {
  id: 'novel',
  name: 'Novel',
  description: 'Book-cover inspired with serif typography',
  category: 'text',
  thumbnail: '/assets/cover-previews/novel.svg',
  premium: false,
};

const FRAME_STYLE: CoverStyleMetadata = {
  id: 'frame',
  name: 'Frame',
  description: 'Title in ornate frame border',
  category: 'text',
  thumbnail: '/assets/cover-previews/frame.svg',
  premium: false,
};

const STRIPE_STYLE: CoverStyleMetadata = {
  id: 'stripe',
  name: 'Stripe',
  description: 'Horizontal stripe accent with title text',
  category: 'text',
  thumbnail: '/assets/cover-previews/stripe.svg',
  premium: false,
};

const DIVIDER_STYLE: CoverStyleMetadata = {
  id: 'divider',
  name: 'Divider',
  description: 'Title divided into top and bottom sections',
  category: 'text',
  thumbnail: '/assets/cover-previews/divider.svg',
  premium: false,
};

const JOURNAL_STYLE: CoverStyleMetadata = {
  id: 'journal',
  name: 'Journal',
  description: 'Minimalist text with subtle sidebar accent',
  category: 'text',
  thumbnail: '/assets/cover-previews/journal.svg',
  premium: false,
};

const STAMP_STYLE: CoverStyleMetadata = {
  id: 'stamp',
  name: 'Stamp',
  description: 'Embossed stamp design with rotated text',
  category: 'text',
  thumbnail: '/assets/cover-previews/stamp.svg',
  premium: false,
};

const OUTLINE_STYLE: CoverStyleMetadata = {
  id: 'outline',
  name: 'Outline',
  description: 'Text with thick outline border effect',
  category: 'text',
  thumbnail: '/assets/cover-previews/outline.svg',
  premium: false,
};

/**
 * Advanced Styles (5)
 * Complex layouts with multiple elements
 */

const CLASSIC_STYLE: CoverStyleMetadata = {
  id: 'classic',
  name: 'Classic',
  description: 'Elegant centered design with gradient overlay',
  category: 'advanced',
  thumbnail: '/assets/cover-previews/classic.svg',
  premium: false,
};

const SPLIT_STYLE: CoverStyleMetadata = {
  id: 'split',
  name: 'Split',
  description: 'Image split with text on contrasting side',
  category: 'advanced',
  thumbnail: '/assets/cover-previews/split.svg',
  premium: false,
};

const LABEL_STYLE: CoverStyleMetadata = {
  id: 'label',
  name: 'Label',
  description: 'Sticker-style label with shadow effect',
  category: 'advanced',
  thumbnail: '/assets/cover-previews/label.svg',
  premium: false,
};

const BORDER_STYLE: CoverStyleMetadata = {
  id: 'border',
  name: 'Border',
  description: 'Image with decorative frame border',
  category: 'advanced',
  thumbnail: '/assets/cover-previews/border.svg',
  premium: false,
};

const ALBUM_STYLE: CoverStyleMetadata = {
  id: 'album',
  name: 'Album',
  description: 'Album-cover style with spine-like accent',
  category: 'advanced',
  thumbnail: '/assets/cover-previews/album.svg',
  premium: false,
};

/**
 * Premium Styles (12)
 * Sophisticated, high-design templates
 */

const CLIFF_STYLE: CoverStyleMetadata = {
  id: 'cliff',
  name: 'Cliff',
  description: 'Bold asymmetric design with angled typography',
  category: 'premium',
  thumbnail: '/assets/cover-previews/cliff.svg',
  premium: true,
};

const CEDAR_STYLE: CoverStyleMetadata = {
  id: 'cedar',
  name: 'Cedar',
  description: 'Warm earth tones with organic shapes',
  category: 'premium',
  thumbnail: '/assets/cover-previews/cedar.svg',
  premium: true,
};

const BREEZE_STYLE: CoverStyleMetadata = {
  id: 'breeze',
  name: 'Breeze',
  description: 'Light, airy design with floating text elements',
  category: 'premium',
  thumbnail: '/assets/cover-previews/breeze.svg',
  premium: true,
};

const AERO_STYLE: CoverStyleMetadata = {
  id: 'aero',
  name: 'Aero',
  description: 'Dynamic motion lines with sleek typography',
  category: 'premium',
  thumbnail: '/assets/cover-previews/aero.svg',
  premium: true,
};

const SURF_STYLE: CoverStyleMetadata = {
  id: 'surf',
  name: 'Surf',
  description: 'Fluid wave patterns with layered text',
  category: 'premium',
  thumbnail: '/assets/cover-previews/surf.svg',
  premium: true,
};

const COSMOS_STYLE: CoverStyleMetadata = {
  id: 'cosmos',
  name: 'Cosmos',
  description: 'Celestial gradient with constellation-style accents',
  category: 'premium',
  thumbnail: '/assets/cover-previews/cosmos.svg',
  premium: true,
};

const REEF_STYLE: CoverStyleMetadata = {
  id: 'reef',
  name: 'Reef',
  description: 'Coral-inspired layered design with vibrant colors',
  category: 'premium',
  thumbnail: '/assets/cover-previews/reef.svg',
  premium: true,
};

const BONDI_STYLE: CoverStyleMetadata = {
  id: 'bondi',
  name: 'Bondi',
  description: 'Beach-inspired with sunburst accent pattern',
  category: 'premium',
  thumbnail: '/assets/cover-previews/bondi.svg',
  premium: true,
};

const WEST_STYLE: CoverStyleMetadata = {
  id: 'west',
  name: 'West',
  description: 'Western aesthetic with geometric patterns',
  category: 'premium',
  thumbnail: '/assets/cover-previews/west.svg',
  premium: true,
};

const OAKWOOD_STYLE: CoverStyleMetadata = {
  id: 'oakwood',
  name: 'Oakwood',
  description: 'Rustic wood texture with carved text effect',
  category: 'premium',
  thumbnail: '/assets/cover-previews/oakwood.svg',
  premium: true,
};

const EDGE_STYLE: CoverStyleMetadata = {
  id: 'edge',
  name: 'Edge',
  description: 'Sharp, angular design with bold contrasts',
  category: 'premium',
  thumbnail: '/assets/cover-previews/edge.svg',
  premium: true,
};

const ANCHOR_STYLE: CoverStyleMetadata = {
  id: 'anchor',
  name: 'Anchor',
  description: 'Maritime-inspired with nautical elements',
  category: 'premium',
  thumbnail: '/assets/cover-previews/anchor.svg',
  premium: true,
};

const JOY_STYLE: CoverStyleMetadata = {
  id: 'joy',
  name: 'Joy',
  description: 'Celebratory design with playful, colorful accents',
  category: 'premium',
  thumbnail: '/assets/cover-previews/joy.svg',
  premium: true,
};

/**
 * Complete catalog of all cover styles
 * Ordered by category, then by premium status
 */
export const COVER_STYLES: CoverStyleMetadata[] = [
  // Basic (3)
  CENTER_STYLE,
  LEFT_STYLE,
  NONE_STYLE,
  // Text (8)
  VINTAGE_STYLE,
  NOVEL_STYLE,
  FRAME_STYLE,
  STRIPE_STYLE,
  DIVIDER_STYLE,
  JOURNAL_STYLE,
  STAMP_STYLE,
  OUTLINE_STYLE,
  // Advanced (5)
  CLASSIC_STYLE,
  SPLIT_STYLE,
  LABEL_STYLE,
  BORDER_STYLE,
  ALBUM_STYLE,
  // Premium (12)
  CLIFF_STYLE,
  CEDAR_STYLE,
  BREEZE_STYLE,
  AERO_STYLE,
  SURF_STYLE,
  COSMOS_STYLE,
  REEF_STYLE,
  BONDI_STYLE,
  WEST_STYLE,
  OAKWOOD_STYLE,
  EDGE_STYLE,
  ANCHOR_STYLE,
  JOY_STYLE,
];

/**
 * Get a specific cover style by ID
 */
export const getCoverStyle = (id: CoverStyleId): CoverStyleMetadata | undefined => {
  return COVER_STYLES.find((style) => style.id === id);
};

/**
 * Get all cover style IDs
 */
export const getAllCoverStyleIds = (): CoverStyleId[] => {
  return COVER_STYLES.map((style) => style.id);
};

/**
 * Get all cover styles in a specific category
 */
export const getCoverStylesByCategory = (
  category: 'basic' | 'text' | 'advanced' | 'premium'
): CoverStyleMetadata[] => {
  return COVER_STYLES.filter((style) => style.category === category);
};

/**
 * Get all basic cover styles (3)
 */
export const getBasicCoverStyles = (): CoverStyleMetadata[] => {
  return getCoverStylesByCategory('basic');
};

/**
 * Get all text placement styles (8)
 */
export const getTextCoverStyles = (): CoverStyleMetadata[] => {
  return getCoverStylesByCategory('text');
};

/**
 * Get all advanced styles (5)
 */
export const getAdvancedCoverStyles = (): CoverStyleMetadata[] => {
  return getCoverStylesByCategory('advanced');
};

/**
 * Get all premium styles (12)
 */
export const getPremiumCoverStyles = (): CoverStyleMetadata[] => {
  return getCoverStylesByCategory('premium');
};

/**
 * Get non-premium styles only
 */
export const getFreeCoverStyles = (): CoverStyleMetadata[] => {
  return COVER_STYLES.filter((style) => !style.premium);
};

/**
 * Check if a cover style ID is valid
 */
export const isValidCoverStyleId = (id: unknown): id is CoverStyleId => {
  return typeof id === 'string' && COVER_STYLES.some((style) => style.id === id);
};

/**
 * Check if a cover style is premium
 */
export const isCoverStylePremium = (id: CoverStyleId): boolean => {
  const style = getCoverStyle(id);
  return style?.premium ?? false;
};

/**
 * Get statistics about the cover style catalog
 */
export const getCoverStyleStats = () => {
  const premium = COVER_STYLES.filter((s) => s.premium).length;
  const free = COVER_STYLES.length - premium;

  return {
    total: COVER_STYLES.length,
    free,
    premium,
    byCategory: {
      basic: getCoverStylesByCategory('basic').length,
      text: getCoverStylesByCategory('text').length,
      advanced: getCoverStylesByCategory('advanced').length,
      premium: getPremiumCoverStyles().length,
    },
  };
};
