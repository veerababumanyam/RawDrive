/**
 * Profile Completeness Utility
 *
 * Calculates profile completeness for Personal and Company profiles.
 * Pure logic - no UI dependencies.
 */

import type { PersonalProfile } from '../types/personalProfile';
import type { CompanyProfile } from '../types/companyProfile';

/**
 * Section types for categorizing missing fields
 */
export type ProfileSection = 'personal' | 'company';

/**
 * Represents a missing field with metadata
 */
export interface MissingField {
  section: ProfileSection;
  key: string;
  label: string;
}

/**
 * Result of profile completeness calculation
 */
export interface ProfileCompletenessResult {
  percent: number;
  completedCount: number;
  totalCount: number;
  missingFields: MissingField[];
}

/**
 * Field definition for tracking
 */
interface FieldDefinition {
  key: string;
  label: string;
  section: ProfileSection;
  /** Function to check if field is filled */
  check: (profile: CombinedProfile) => boolean;
}

/**
 * Combined profile type for completeness calculation
 */
export interface CombinedProfile {
  personal?: Partial<PersonalProfile> | null;
  company?: Partial<CompanyProfile> | null;
}

/**
 * Check if a value is considered "filled"
 */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    // For objects, check if any property has a value
    return Object.values(value).some((v) => isFilled(v));
  }
  return true;
}

/**
 * Personal profile fields to track
 */
const PERSONAL_FIELDS: FieldDefinition[] = [
  {
    key: 'display_name',
    label: 'Display Name',
    section: 'personal',
    check: (p) => isFilled(p.personal?.display_name),
  },
  {
    key: 'profile_title',
    label: 'Professional Title',
    section: 'personal',
    check: (p) => isFilled(p.personal?.profile_title),
  },
  {
    key: 'email',
    label: 'Email',
    section: 'personal',
    check: (p) => isFilled(p.personal?.email),
  },
  {
    key: 'phone',
    label: 'Phone',
    section: 'personal',
    check: (p) => isFilled(p.personal?.phone),
  },
  {
    key: 'avatar_url',
    label: 'Profile Photo',
    section: 'personal',
    check: (p) => isFilled(p.personal?.avatar_url),
  },
  {
    key: 'bio',
    label: 'Bio',
    section: 'personal',
    check: (p) => isFilled(p.personal?.bio),
  },
  {
    key: 'website',
    label: 'Website',
    section: 'personal',
    check: (p) => isFilled(p.personal?.website),
  },
  {
    key: 'location',
    label: 'Location',
    section: 'personal',
    check: (p) => isFilled(p.personal?.location),
  },
];

/**
 * Company profile fields to track
 */
const COMPANY_FIELDS: FieldDefinition[] = [
  {
    key: 'name',
    label: 'Company Name',
    section: 'company',
    check: (p) => isFilled(p.company?.name),
  },
  {
    key: 'slug',
    label: 'Profile URL',
    section: 'company',
    check: (p) => isFilled(p.company?.slug),
  },
  {
    key: 'email',
    label: 'Email',
    section: 'company',
    check: (p) => isFilled(p.company?.email),
  },
  {
    key: 'phone',
    label: 'Phone',
    section: 'company',
    check: (p) => isFilled(p.company?.phone),
  },
  {
    key: 'logo_url',
    label: 'Logo',
    section: 'company',
    check: (p) => isFilled(p.company?.logo_url),
  },
  {
    key: 'tagline',
    label: 'Tagline',
    section: 'company',
    check: (p) => isFilled(p.company?.tagline),
  },
  {
    key: 'website',
    label: 'Website',
    section: 'company',
    check: (p) => isFilled(p.company?.website),
  },
  {
    key: 'address_city',
    label: 'City',
    section: 'company',
    check: (p) => isFilled(p.company?.address_structured?.city),
  },
  {
    key: 'address_country',
    label: 'Country',
    section: 'company',
    check: (p) => isFilled(p.company?.address_structured?.country),
  },
];

/**
 * All tracked fields
 */
const ALL_FIELDS = [...PERSONAL_FIELDS, ...COMPANY_FIELDS];

/**
 * Calculate profile completeness for combined personal and company profiles
 */
export function getProfileCompleteness(
  profile: CombinedProfile
): ProfileCompletenessResult {
  const missingFields: MissingField[] = [];
  let completedCount = 0;

  for (const field of ALL_FIELDS) {
    const isComplete = field.check(profile);
    if (isComplete) {
      completedCount++;
    } else {
      missingFields.push({
        section: field.section,
        key: field.key,
        label: field.label,
      });
    }
  }

  const totalCount = ALL_FIELDS.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    percent,
    completedCount,
    totalCount,
    missingFields,
  };
}

/**
 * Calculate completeness for personal profile only
 */
export function getPersonalProfileCompleteness(
  personal: Partial<PersonalProfile> | null | undefined
): ProfileCompletenessResult {
  const profile: CombinedProfile = { personal, company: null };
  const missingFields: MissingField[] = [];
  let completedCount = 0;

  for (const field of PERSONAL_FIELDS) {
    const isComplete = field.check(profile);
    if (isComplete) {
      completedCount++;
    } else {
      missingFields.push({
        section: field.section,
        key: field.key,
        label: field.label,
      });
    }
  }

  const totalCount = PERSONAL_FIELDS.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    percent,
    completedCount,
    totalCount,
    missingFields,
  };
}

/**
 * Calculate completeness for company profile only
 */
export function getCompanyProfileCompleteness(
  company: Partial<CompanyProfile> | null | undefined
): ProfileCompletenessResult {
  const profile: CombinedProfile = { personal: null, company };
  const missingFields: MissingField[] = [];
  let completedCount = 0;

  for (const field of COMPANY_FIELDS) {
    const isComplete = field.check(profile);
    if (isComplete) {
      completedCount++;
    } else {
      missingFields.push({
        section: field.section,
        key: field.key,
        label: field.label,
      });
    }
  }

  const totalCount = COMPANY_FIELDS.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    percent,
    completedCount,
    totalCount,
    missingFields,
  };
}

/**
 * Get status color based on completeness percentage
 */
export function getCompletenessStatusColor(percent: number): {
  text: string;
  bg: string;
  border: string;
} {
  if (percent >= 100) {
    return {
      text: 'text-success',
      bg: 'bg-success/10',
      border: 'border-success/20',
    };
  }
  if (percent >= 50) {
    return {
      text: 'text-warning',
      bg: 'bg-warning/10',
      border: 'border-warning/20',
    };
  }
  return {
    text: 'text-error',
    bg: 'bg-error/10',
    border: 'border-error/20',
  };
}
