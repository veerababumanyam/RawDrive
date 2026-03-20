/**
 * Public Profile Performance Budget Tests
 *
 * Target: LCP < 2000ms on throttled 4G
 * Strategy:
 *   - LazyMotion with domAnimation (code-split framer-motion, ~15KB vs ~50KB full)
 *   - LQIP blur-up placeholders (perceived load improvement)
 *   - Lazy-loaded embeds via IntersectionObserver (deferred heavy iframes)
 *   - Native loading="lazy" + decoding="async" on images
 *   - m.* components instead of motion.* for tree-shaking
 *
 * Note: Full Lighthouse CI integration deferred to CI pipeline setup;
 * these unit tests verify the performance patterns are in place.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const COMPONENTS_DIR = path.resolve(__dirname, '../..');
const SECTIONS_DIR = path.resolve(__dirname, '../sections');

function readComponent(relativePath: string): string {
  return fs.readFileSync(path.resolve(COMPONENTS_DIR, relativePath), 'utf-8');
}

function readSection(fileName: string): string {
  return fs.readFileSync(path.resolve(SECTIONS_DIR, fileName), 'utf-8');
}

describe('Public Profile Performance Budget', () => {
  describe('LazyMotion code-splitting', () => {
    it('PublicProfileRenderer wraps content in LazyMotion provider', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../PublicProfileRenderer.tsx'),
        'utf-8',
      );
      expect(source).toContain('LazyMotion');
      expect(source).toContain('domAnimation');
      // Should use strict mode to catch accidental motion.* usage
      expect(source).toMatch(/LazyMotion.*strict/s);
    });

    it('no direct "import { motion }" in content block components', () => {
      const files = [
        { name: 'ProfileSocials.tsx', content: readComponent('ProfileSocials.tsx') },
        { name: 'ProfileMediaEmbed.tsx', content: readComponent('ProfileMediaEmbed.tsx') },
        { name: 'ProfileGalleryPreview.tsx', content: readComponent('ProfileGalleryPreview.tsx') },
        { name: 'TestimonialsSection.tsx', content: readSection('TestimonialsSection.tsx') },
        { name: 'BookingCTASection.tsx', content: readSection('BookingCTASection.tsx') },
      ];

      for (const file of files) {
        const hasFullMotionImport = /import\s*\{[^}]*\bmotion\b[^}]*\}\s*from\s*['"]framer-motion['"]/.test(file.content);
        expect(
          hasFullMotionImport,
          `${file.name} should not import { motion } from 'framer-motion' — use { m } instead`,
        ).toBe(false);
      }
    });

    it('content block components use m.* instead of motion.*', () => {
      const files = [
        { name: 'ProfileSocials.tsx', content: readComponent('ProfileSocials.tsx') },
        { name: 'ProfileMediaEmbed.tsx', content: readComponent('ProfileMediaEmbed.tsx') },
        { name: 'ProfileGalleryPreview.tsx', content: readComponent('ProfileGalleryPreview.tsx') },
        { name: 'TestimonialsSection.tsx', content: readSection('TestimonialsSection.tsx') },
        { name: 'BookingCTASection.tsx', content: readSection('BookingCTASection.tsx') },
      ];

      for (const file of files) {
        const usesMotionDot = /\bmotion\.\w+/.test(file.content);
        expect(
          usesMotionDot,
          `${file.name} should use m.div/m.a instead of motion.div/motion.a`,
        ).toBe(false);
      }
    });
  });

  describe('Lazy embed loading', () => {
    it('ProfileMediaEmbed uses IntersectionObserver for deferred loading', () => {
      const source = readComponent('ProfileMediaEmbed.tsx');
      expect(source).toContain('IntersectionObserver');
    });

    it('ProfileMediaEmbed does not eagerly render embeds', () => {
      const source = readComponent('ProfileMediaEmbed.tsx');
      // The embed components should be conditionally rendered based on inView state
      expect(source).toMatch(/inView|isInView|isVisible/);
    });
  });

  describe('Image optimization', () => {
    it('ProfileGalleryPreview images use loading="lazy"', () => {
      const source = readComponent('ProfileGalleryPreview.tsx');
      expect(source).toMatch(/loading\s*=\s*["']lazy["']/);
    });

    it('ProfileGalleryPreview images use decoding="async"', () => {
      const source = readComponent('ProfileGalleryPreview.tsx');
      expect(source).toMatch(/decoding\s*=\s*["']async["']/);
    });

    it('ProfileGalleryPreview implements LQIP blur-up pattern', () => {
      const source = readComponent('ProfileGalleryPreview.tsx');
      // Should have blur placeholder styling
      expect(source).toMatch(/blur|lqip|placeholder/i);
    });
  });
});
