/**
 * SectionRegistry
 *
 * Dynamic section selection for public profile rendering.
 * Filters sections by profile type and available data, then sorts by order.
 */

import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileType = 'personal' | 'company';

export interface SectionProps {
  profileData: Record<string, unknown>;
  profileType: ProfileType;
}

export interface SectionRegistryEntry {
  id: string;
  component: ComponentType<SectionProps>;
  supportedTypes: ProfileType[];
  requiredData: string[];
  gridSpan?: { cols: number; rows: number };
  order: number;
}

// ---------------------------------------------------------------------------
// Lazy imports for section components (avoid circular deps)
// ---------------------------------------------------------------------------

// These are placeholder components that will be replaced by actual section wrappers.
// The registry is populated at module load from sections/index.ts.

import { HeaderSection } from './sections/HeaderSection';
import { BioSection } from './sections/BioSection';
import { ContactSection } from './sections/ContactSection';
import { SocialsSection } from './sections/SocialsSection';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SECTION_REGISTRY: SectionRegistryEntry[] = [
  {
    id: 'header',
    component: HeaderSection,
    supportedTypes: ['personal', 'company'],
    requiredData: ['display_name'],
    gridSpan: { cols: 4, rows: 1 },
    order: 0,
  },
  {
    id: 'bio',
    component: BioSection,
    supportedTypes: ['personal', 'company'],
    requiredData: ['bio'],
    gridSpan: { cols: 4, rows: 1 },
    order: 1,
  },
  {
    id: 'contact',
    component: ContactSection,
    supportedTypes: ['personal', 'company'],
    requiredData: [],
    gridSpan: { cols: 4, rows: 1 },
    order: 2,
  },
  {
    id: 'socials',
    component: SocialsSection,
    supportedTypes: ['personal', 'company'],
    requiredData: ['social_links'],
    gridSpan: { cols: 4, rows: 1 },
    order: 3,
  },
];

// ---------------------------------------------------------------------------
// Query function
// ---------------------------------------------------------------------------

/**
 * Get applicable sections for a given profile type and data.
 * Filters by supported type, checks required data keys exist and are truthy,
 * then sorts by order.
 */
export function getSectionsForProfile(
  type: ProfileType,
  profileData: Record<string, unknown>,
): SectionRegistryEntry[] {
  return SECTION_REGISTRY
    .filter((entry) => entry.supportedTypes.includes(type))
    .filter((entry) => {
      // All requiredData keys must be present and truthy
      return entry.requiredData.every((key) => {
        const value = profileData[key];
        if (value === undefined || value === null || value === '') return false;
        // For objects (like social_links), check they have at least one key
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return false;
        return true;
      });
    })
    .sort((a, b) => a.order - b.order);
}
