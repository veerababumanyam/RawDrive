import { describe, it, expect } from 'vitest';
import {
  getSectionsForProfile,
  SECTION_REGISTRY,
  type ProfileType,
} from '../SectionRegistry';

describe('SectionRegistry', () => {
  const fullPersonalData: Record<string, unknown> = {
    display_name: 'John Doe',
    bio: 'A passionate photographer',
    email: 'john@example.com',
    social_links: { instagram: 'https://instagram.com/john' },
  };

  const fullCompanyData: Record<string, unknown> = {
    display_name: 'Doe Photography',
    company_name: 'Doe Photography LLC',
    bio: 'Professional photography studio',
    email: 'info@doe.com',
    social_links: { instagram: 'https://instagram.com/doe' },
  };

  describe('SECTION_REGISTRY', () => {
    it('contains at least header, bio, contact, and socials entries', () => {
      const ids = SECTION_REGISTRY.map((e) => e.id);
      expect(ids).toContain('header');
      expect(ids).toContain('bio');
      expect(ids).toContain('contact');
      expect(ids).toContain('socials');
    });
  });

  describe('getSectionsForProfile', () => {
    it('returns header, bio, contact, socials for personal with full data', () => {
      const sections = getSectionsForProfile('personal', fullPersonalData);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain('header');
      expect(ids).toContain('bio');
      expect(ids).toContain('contact');
      expect(ids).toContain('socials');
    });

    it('returns header, bio, contact, socials for company with full data', () => {
      const sections = getSectionsForProfile('company', fullCompanyData);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain('header');
      expect(ids).toContain('bio');
      expect(ids).toContain('contact');
      expect(ids).toContain('socials');
    });

    it('filters out sections when requiredData is missing', () => {
      const sparseData: Record<string, unknown> = {
        display_name: 'Jane',
        // No bio, no social_links
      };
      const sections = getSectionsForProfile('personal', sparseData);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain('header');
      expect(ids).not.toContain('bio');
      expect(ids).not.toContain('socials');
    });

    it('returns sections sorted by order field', () => {
      const sections = getSectionsForProfile('personal', fullPersonalData);
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i].order).toBeGreaterThanOrEqual(sections[i - 1].order);
      }
    });
  });
});
