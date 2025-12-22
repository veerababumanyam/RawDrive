/* =============================================================================
   Landing Page UI Components - Barrel Export
   ============================================================================= */

export * from './GlassCard';

export { AppButton, default as AppButtonDefault } from './AppButton';
export type { AppButtonProps, AppButtonVariant } from './AppButton';
export { AppBadge, default as AppBadgeDefault } from './AppBadge';
export type { AppBadgeProps, AppBadgeVariant } from './AppBadge';
export { AppCard, default as AppCardDefault } from './AppCard';
export type { AppCardProps } from './AppCard';

export { AnimatedCounter, default as AnimatedCounterDefault } from './AnimatedCounter';
export { FeatureCard, default as FeatureCardDefault } from './FeatureCard';
export { TestimonialCard, default as TestimonialCardDefault } from './TestimonialCard';
export { PricingCard, default as PricingCardDefault } from './PricingCard';
export { SkeletonCard, SkeletonGrid, SkeletonText, default as SkeletonCardDefault } from './SkeletonCard';

// Performance-optimized image component
export {
  OptimizedImage,
  generateSrcSet,
  generateSizes,
  isWebPSupported,
  preloadImage,
  preloadImages,
  default as OptimizedImageDefault
} from './OptimizedImage';
