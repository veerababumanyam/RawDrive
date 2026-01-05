/**
 * AI Feature Components
 *
 * Organized into logical groups:
 * 1. Core Infrastructure - Error handling, loading states
 * 2. AIToolsHub - Unified gallery AI panel with tabs
 * 3. Quality Analysis - Score cards, results grid, blur detection
 * 4. Content Generation - Story, captions, hashtags for single assets
 * 5. Smart Curation - Gallery-level curation panel
 */

// ---------------------------------------------------------------------------
// Core Infrastructure
// ---------------------------------------------------------------------------
export { AIErrorBoundary } from './AIErrorBoundary';
export {
  AIPulseIndicator,
  AIResultSkeleton,
  AIProgressBar,
  AISpinner,
  AISteppedLoader,
  AILoadingCard,
  AIButtonLoader,
} from './AILoadingStates';

// ---------------------------------------------------------------------------
// AIToolsHub - Unified Gallery AI Panel (024-ai-tools-hub)
// Primary entry point for gallery-level AI features
// ---------------------------------------------------------------------------
export { AIToolsHub } from './AIToolsHub';
export type { AIToolsTab, AIToolsHubProps } from './AIToolsHub';
export { AnalyzeTab } from './tabs/AnalyzeTab';
export { CurateTab } from './tabs/CurateTab';
export { CreateTab } from './tabs/CreateTab';

// ---------------------------------------------------------------------------
// Quality Analysis Components (023-enhanced-smart-curate)
// Used by AnalyzeTab and standalone quality displays
// ---------------------------------------------------------------------------
export { QualityScoreCard } from './QualityScoreCard';
export { QualityResultsGrid } from './QualityResultsGrid';
export { BlurIndicator, BlurBadge } from './BlurIndicator';

// ---------------------------------------------------------------------------
// Single-Asset Content Generation (010-ai-powered-features)
// For individual photo operations (e.g., lightbox, photo detail view)
// ---------------------------------------------------------------------------
export { StoryGenerator } from './StoryGenerator';
export { CaptionGenerator } from './CaptionGenerator';
export { HashtagGenerator } from './HashtagGenerator';

// ---------------------------------------------------------------------------
// Smart Curation Panel
// Legacy standalone panel - consider using AIToolsHub CurateTab instead
// ---------------------------------------------------------------------------
export { SmartCurationPanel } from './SmartCurationPanel';
