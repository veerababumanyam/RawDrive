/**
 * Tests for AnimatedBackgroundRenderer and its dispatch logic.
 *
 * Verifies that:
 * - Each animation type renders the correct component
 * - Reduced motion renders a static fallback
 * - 'none'/undefined renders GlassContainer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Track which animation component was rendered
const rendered: string[] = [];

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...rest }: any, ref: any) => (
      <div ref={ref} {...rest}>{children}</div>
    )),
  },
  useReducedMotion: vi.fn(() => false),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('../animations/GradientShiftBackground', () => ({
  GradientShiftBackground: ({ children }: any) => {
    rendered.push('gradient-shift');
    return <div data-testid="bg-gradient-shift">{children}</div>;
  },
}));

vi.mock('../animations/ParticleBackground', () => ({
  ParticleBackground: ({ children }: any) => {
    rendered.push('particles');
    return <div data-testid="bg-particles">{children}</div>;
  },
}));

vi.mock('../animations/WaveBackground', () => ({
  WaveBackground: ({ children }: any) => {
    rendered.push('wave');
    return <div data-testid="bg-wave">{children}</div>;
  },
}));

vi.mock('../animations/AuroraBackground', () => ({
  AuroraBackground: ({ children }: any) => {
    rendered.push('aurora');
    return <div data-testid="bg-aurora">{children}</div>;
  },
}));

vi.mock('../GlassContainer', () => ({
  GlassContainer: ({ children }: any) => {
    rendered.push('glass');
    return <div data-testid="bg-glass">{children}</div>;
  },
}));

const mockTokens = {
  '--theme-bg': '#fff',
  '--theme-surface': '#fafafa',
  '--theme-text': '#000',
  '--theme-text-secondary': '#666',
  '--theme-accent': '#3B82F6',
  '--theme-primary': '#1A1A1A',
  '--theme-border': '#E5E5E5',
  '--theme-font-heading': "'Inter', system-ui",
  '--theme-font-body': "'Inter', system-ui",
  '--theme-radius': '0.75rem',
  '--theme-shadow': '0 4px 6px rgba(0,0,0,0.1)',
  '--theme-gradient': 'linear-gradient(135deg, #3B82F6, #1A1A1A)',
  '--theme-animation-type': 'gradient-shift',
} as any;

describe('AnimatedBackgroundRenderer', () => {
  beforeEach(() => {
    rendered.length = 0;
    vi.resetModules();
  });

  it('renders GradientShiftBackground when animationType is gradient-shift', async () => {
    const { AnimatedBackgroundRenderer } = await import('../animations/AnimatedBackgroundRenderer');
    render(
      <AnimatedBackgroundRenderer animationType="gradient-shift" themeTokens={mockTokens}>
        <div data-testid="child">Content</div>
      </AnimatedBackgroundRenderer>
    );
    expect(screen.getByTestId('bg-gradient-shift')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders ParticleBackground when animationType is particles', async () => {
    const { AnimatedBackgroundRenderer } = await import('../animations/AnimatedBackgroundRenderer');
    render(
      <AnimatedBackgroundRenderer animationType="particles" themeTokens={mockTokens}>
        <div data-testid="child">Content</div>
      </AnimatedBackgroundRenderer>
    );
    expect(screen.getByTestId('bg-particles')).toBeInTheDocument();
  });

  it('renders WaveBackground when animationType is wave', async () => {
    const { AnimatedBackgroundRenderer } = await import('../animations/AnimatedBackgroundRenderer');
    render(
      <AnimatedBackgroundRenderer animationType="wave" themeTokens={mockTokens}>
        <div data-testid="child">Content</div>
      </AnimatedBackgroundRenderer>
    );
    expect(screen.getByTestId('bg-wave')).toBeInTheDocument();
  });

  it('renders AuroraBackground when animationType is aurora', async () => {
    const { AnimatedBackgroundRenderer } = await import('../animations/AnimatedBackgroundRenderer');
    render(
      <AnimatedBackgroundRenderer animationType="aurora" themeTokens={mockTokens}>
        <div data-testid="child">Content</div>
      </AnimatedBackgroundRenderer>
    );
    expect(screen.getByTestId('bg-aurora')).toBeInTheDocument();
  });

  it('renders GlassContainer when animationType is none', async () => {
    const { AnimatedBackgroundRenderer } = await import('../animations/AnimatedBackgroundRenderer');
    render(
      <AnimatedBackgroundRenderer animationType="none" themeTokens={mockTokens}>
        <div data-testid="child">Content</div>
      </AnimatedBackgroundRenderer>
    );
    expect(screen.getByTestId('bg-glass')).toBeInTheDocument();
  });

  it('renders GlassContainer when animationType is undefined', async () => {
    const { AnimatedBackgroundRenderer } = await import('../animations/AnimatedBackgroundRenderer');
    render(
      <AnimatedBackgroundRenderer themeTokens={mockTokens}>
        <div data-testid="child">Content</div>
      </AnimatedBackgroundRenderer>
    );
    expect(screen.getByTestId('bg-glass')).toBeInTheDocument();
  });

  it('renders static gradient fallback when prefers-reduced-motion', async () => {
    const fm = await import('framer-motion');
    (fm.useReducedMotion as any).mockReturnValue(true);

    const { AnimatedBackgroundRenderer } = await import('../animations/AnimatedBackgroundRenderer');
    const { container } = render(
      <AnimatedBackgroundRenderer animationType="gradient-shift" themeTokens={mockTokens}>
        <div data-testid="child">Content</div>
      </AnimatedBackgroundRenderer>
    );
    // Should render static fallback, not the animated component
    expect(screen.getByTestId('child')).toBeInTheDocument();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.background).toContain('linear-gradient');

    // Reset mock
    (fm.useReducedMotion as any).mockReturnValue(false);
  });
});
