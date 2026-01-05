export type FeatureFlagKey = 'aiFilterSimplify';

export interface FeatureFlags {
  aiFilterSimplify: boolean;
}

const defaultFlags: FeatureFlags = {
  aiFilterSimplify: false,
};

export const featureFlags: FeatureFlags = {
  aiFilterSimplify: import.meta.env.VITE_FEATURE_AI_FILTER_SIMPLIFY === 'true' || defaultFlags.aiFilterSimplify,
};
