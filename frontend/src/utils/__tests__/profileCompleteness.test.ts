/**
 * Tests for profileCompleteness utility
 */

import { describe, it, expect } from 'vitest';
import {
  getProfileCompleteness,
  getPersonalProfileCompleteness,
  getCompanyProfileCompleteness,
  getCompletenessStatusColor,
} from '../profileCompleteness';
import type { PersonalProfile } from '../../types/personalProfile';
import type { CompanyProfile } from '../../types/companyProfile';

describe('profileCompleteness', () => {
  describe('getPersonalProfileCompleteness', () => {
    it('returns 0% for empty profile', () => {
      const result = getPersonalProfileCompleteness(null);
      expect(result.percent).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.missingFields.length).toBe(result.totalCount);
    });

    it('returns 0% for profile with all empty strings', () => {
      const profile: Partial<PersonalProfile> = {
        display_name: '',
        email: '',
        phone: '',
        avatar_url: '',
        bio: '',
        website: '',
        location: '',
        profile_title: '',
      };
      const result = getPersonalProfileCompleteness(profile);
      expect(result.percent).toBe(0);
      expect(result.completedCount).toBe(0);
    });

    it('calculates correct percentage for partially filled profile', () => {
      const profile: Partial<PersonalProfile> = {
        display_name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        avatar_url: '',
        bio: '',
        website: '',
        location: '',
        profile_title: '',
      };
      const result = getPersonalProfileCompleteness(profile);
      expect(result.completedCount).toBe(3);
      expect(result.missingFields.length).toBe(result.totalCount - 3);
    });

    it('returns 100% for fully filled profile', () => {
      const profile: Partial<PersonalProfile> = {
        display_name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        avatar_url: 'https://example.com/avatar.jpg',
        bio: 'I am a photographer',
        website: 'https://example.com',
        location: 'New York',
        profile_title: 'Wedding Photographer',
      };
      const result = getPersonalProfileCompleteness(profile);
      expect(result.percent).toBe(100);
      expect(result.missingFields.length).toBe(0);
    });

    it('all missing fields have section "personal"', () => {
      const result = getPersonalProfileCompleteness(null);
      result.missingFields.forEach((field) => {
        expect(field.section).toBe('personal');
      });
    });
  });

  describe('getCompanyProfileCompleteness', () => {
    it('returns 0% for empty profile', () => {
      const result = getCompanyProfileCompleteness(null);
      expect(result.percent).toBe(0);
      expect(result.completedCount).toBe(0);
      expect(result.missingFields.length).toBe(result.totalCount);
    });

    it('calculates correct percentage for partially filled profile', () => {
      const profile: Partial<CompanyProfile> = {
        name: 'My Company',
        slug: 'my-company',
        email: 'info@company.com',
        phone: '',
        logo_url: '',
        tagline: '',
        website: '',
        address_structured: null,
      };
      const result = getCompanyProfileCompleteness(profile);
      expect(result.completedCount).toBe(3);
    });

    it('returns 100% for fully filled profile', () => {
      const profile: Partial<CompanyProfile> = {
        name: 'My Company',
        slug: 'my-company',
        email: 'info@company.com',
        phone: '+1234567890',
        logo_url: 'https://example.com/logo.png',
        tagline: 'The best company',
        website: 'https://company.com',
        address_structured: {
          city: 'New York',
          country: 'USA',
          state: 'NY',
          postal_code: '10001',
          line1: '123 Main St',
        },
      };
      const result = getCompanyProfileCompleteness(profile);
      expect(result.percent).toBe(100);
      expect(result.missingFields.length).toBe(0);
    });

    it('all missing fields have section "company"', () => {
      const result = getCompanyProfileCompleteness(null);
      result.missingFields.forEach((field) => {
        expect(field.section).toBe('company');
      });
    });
  });

  describe('getProfileCompleteness', () => {
    it('combines personal and company completeness', () => {
      const personal: Partial<PersonalProfile> = {
        display_name: 'John Doe',
        email: 'john@example.com',
      };
      const company: Partial<CompanyProfile> = {
        name: 'My Company',
        slug: 'my-company',
      };
      const result = getProfileCompleteness({ personal, company });

      // 2 personal + 2 company = 4 completed out of 17 total
      expect(result.completedCount).toBe(4);
      expect(result.totalCount).toBe(17); // 8 personal + 9 company
    });

    it('returns all missing fields from both sections', () => {
      const result = getProfileCompleteness({ personal: null, company: null });
      const personalFields = result.missingFields.filter((f) => f.section === 'personal');
      const companyFields = result.missingFields.filter((f) => f.section === 'company');

      expect(personalFields.length).toBeGreaterThan(0);
      expect(companyFields.length).toBeGreaterThan(0);
    });
  });

  describe('getCompletenessStatusColor', () => {
    it('returns success color for 100%', () => {
      const colors = getCompletenessStatusColor(100);
      expect(colors.text).toContain('success');
    });

    it('returns success color for >= 100%', () => {
      const colors = getCompletenessStatusColor(100);
      expect(colors.text).toContain('success');
      expect(colors.bg).toContain('success');
      expect(colors.border).toContain('success');
    });

    it('returns warning color for 50-99%', () => {
      const colors50 = getCompletenessStatusColor(50);
      expect(colors50.text).toContain('warning');

      const colors75 = getCompletenessStatusColor(75);
      expect(colors75.text).toContain('warning');

      const colors99 = getCompletenessStatusColor(99);
      expect(colors99.text).toContain('warning');
    });

    it('returns error color for < 50%', () => {
      const colors0 = getCompletenessStatusColor(0);
      expect(colors0.text).toContain('error');

      const colors49 = getCompletenessStatusColor(49);
      expect(colors49.text).toContain('error');
    });
  });
});
