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
    featured_gallery: { gallery_id: 'g1', name: 'Wedding', cover_image_url: 'https://example.com/cover.jpg' },
    booking_url: 'https://calendly.com/john',
    testimonials: [
      { client_name: 'Alice', text: 'Amazing photos!', rating: 5 },
      { client_name: 'Bob', text: 'Highly recommended', rating: 4 },
    ],
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

    it('contains gallery-preview, booking-cta, and testimonials entries', () => {
      const ids = SECTION_REGISTRY.map((e) => e.id);
      expect(ids).toContain('gallery-preview');
      expect(ids).toContain('booking-cta');
      expect(ids).toContain('testimonials');
    });

    it('has 7 total entries', () => {
      expect(SECTION_REGISTRY).toHaveLength(7);
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

    it('includes gallery-preview when featured_gallery data is present', () => {
      const sections = getSectionsForProfile('personal', fullPersonalData);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain('gallery-preview');
    });

    it('includes booking-cta when booking_url is present', () => {
      const sections = getSectionsForProfile('personal', fullPersonalData);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain('booking-cta');
    });

    it('includes testimonials when testimonials data is present', () => {
      const sections = getSectionsForProfile('personal', fullPersonalData);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain('testimonials');
    });

    it('excludes gallery-preview for company profiles', () => {
      const dataWithGallery = { ...fullCompanyData, featured_gallery: { gallery_id: 'g1', name: 'Test' } };
      const sections = getSectionsForProfile('company', dataWithGallery);
      const ids = sections.map((s) => s.id);
      expect(ids).not.toContain('gallery-preview');
    });

    it('excludes new sections when required data is missing', () => {
      const sparseData: Record<string, unknown> = {
        display_name: 'Jane',
        // No gallery, no booking, no testimonials
      };
      const sections = getSectionsForProfile('personal', sparseData);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain('header');
      expect(ids).not.toContain('bio');
      expect(ids).not.toContain('socials');
      expect(ids).not.toContain('gallery-preview');
      expect(ids).not.toContain('booking-cta');
      expect(ids).not.toContain('testimonials');
    });

    it('excludes testimonials when testimonials array is empty', () => {
      const dataWithEmptyTestimonials = { ...fullPersonalData, testimonials: [] };
      const sections = getSectionsForProfile('personal', dataWithEmptyTestimonials);
      const ids = sections.map((s) => s.id);
      expect(ids).not.toContain('testimonials');
    });

    it('returns sections sorted by order field', () => {
      const sections = getSectionsForProfile('personal', fullPersonalData);
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i].order).toBeGreaterThanOrEqual(sections[i - 1].order);
      }
    });
  });
});
