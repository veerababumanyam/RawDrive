/**
 * Component Tests for GlassContainer
 *
 * Tests for the glass container background including:
 * - Rendering with children
 * - Dark mode class application
 * - Background orb animations
 * - Reduced motion support
 * - Custom className application
 *
 * Feature: 021-public-profile-mobile-responsive-theme
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassContainer } from '../GlassContainer';

describe('GlassContainer', () => {
  describe('Rendering', () => {
    it('renders children content', () => {
      render(
        <GlassContainer>
          <div data-testid="child">Child Content</div>
        </GlassContainer>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('renders multiple children', () => {
      render(
        <GlassContainer>
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </GlassContainer>
      );

      expect(screen.getByTestId('child1')).toBeInTheDocument();
      expect(screen.getByTestId('child2')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <GlassContainer className="custom-test-class">
          <div>Content</div>
        </GlassContainer>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('custom-test-class');
    });
  });

  describe('Background Styling', () => {
    it('has full viewport height', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('min-h-screen');
    });

    it('has gradient background classes', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('bg-gradient-to-br');
    });

    it('has light mode gradient colors', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('from-slate-50');
    });

    it('has dark mode gradient colors', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('dark:from-gray-950');
    });
  });

  describe('Background Orbs', () => {
    it('renders decorative orbs container', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      // Find fixed positioned orbs container
      const orbsContainer = container.querySelector('[aria-hidden="true"]');
      expect(orbsContainer).toBeInTheDocument();
    });

    it('orbs container has aria-hidden for accessibility', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const orbsContainer = container.querySelector('.fixed.inset-0');
      expect(orbsContainer).toHaveAttribute('aria-hidden', 'true');
    });

    it('orbs have blur effects', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      // Check for blur classes on orb elements
      const blurElements = container.querySelectorAll('[class*="blur-"]');
      expect(blurElements.length).toBeGreaterThan(0);
    });

    it('orbs have animation classes', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const animatedElements = container.querySelectorAll('.animate-blob');
      expect(animatedElements.length).toBeGreaterThan(0);
    });
  });

  describe('Reduced Motion Support', () => {
    it('has motion-reduce classes on animated elements', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const elements = container.querySelectorAll('[class*="motion-reduce:"]');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design', () => {
    it('has responsive blur values', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      // Check for responsive blur classes (sm: and lg: prefixes)
      const html = container.innerHTML;
      expect(html).toContain('sm:blur-');
      expect(html).toContain('lg:blur-');
    });

    it('has responsive orb sizes', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      // Check for responsive width classes
      const html = container.innerHTML;
      expect(html).toContain('sm:w-');
      expect(html).toContain('lg:w-');
    });
  });

  describe('Dark Mode', () => {
    it('has dark mode mix-blend-screen for orbs', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const html = container.innerHTML;
      expect(html).toContain('dark:mix-blend-screen');
    });

    it('has dark mode opacity for orbs', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const html = container.innerHTML;
      expect(html).toContain('dark:opacity-');
    });
  });

  describe('Theme Gradient Override', () => {
    it('applies themeGradient as inline style when provided', () => {
      const customGradient = 'linear-gradient(90deg, red, blue)';
      const { container } = render(
        <GlassContainer themeGradient={customGradient}>
          <div>Content</div>
        </GlassContainer>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.style.background).toBe(customGradient);
    });

    it('does not apply inline background when themeGradient is not provided', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const root = container.firstChild as HTMLElement;
      expect(root.style.background).toBe('');
    });
  });

  describe('Z-Index Layering', () => {
    it('orbs container has z-0', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const orbsContainer = container.querySelector('.z-0');
      expect(orbsContainer).toBeInTheDocument();
    });

    it('content layer has z-10', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const contentLayer = container.querySelector('.z-10');
      expect(contentLayer).toBeInTheDocument();
    });
  });

  describe('Performance Optimization', () => {
    it('has will-change-transform for GPU acceleration', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const elements = container.querySelectorAll('.will-change-transform');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('orbs have pointer-events-none', () => {
      const { container } = render(
        <GlassContainer>
          <div>Content</div>
        </GlassContainer>
      );

      const orbsContainer = container.querySelector('.pointer-events-none');
      expect(orbsContainer).toBeInTheDocument();
    });
  });
});
