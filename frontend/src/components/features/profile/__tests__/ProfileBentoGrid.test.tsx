/**
 * Tests for ProfileBentoGrid responsive layout,
 * ProfileGridItem stagger variants + hover effects,
 * and useColorScheme hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock framer-motion so motion.div renders as plain div with props we can inspect
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, variants, initial, animate, whileHover, ...rest }: any, ref: any) => (
      <div
        ref={ref}
        data-variants={variants ? JSON.stringify(variants) : undefined}
        data-initial={typeof initial === 'string' ? initial : undefined}
        data-animate={typeof animate === 'string' ? animate : undefined}
        data-while-hover={whileHover ? JSON.stringify(whileHover) : undefined}
        {...rest}
      >
        {children}
      </div>
    )),
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('ProfileBentoGrid', () => {
  describe('Responsive Grid Classes', () => {
    it('renders with grid-cols-1 for mobile base', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const grid = container.firstChild as HTMLElement;
      expect(grid.className).toContain('grid-cols-1');
    });

    it('renders with sm:grid-cols-2 for tablet', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const grid = container.firstChild as HTMLElement;
      expect(grid.className).toContain('sm:grid-cols-2');
    });

    it('renders with lg:grid-cols-3 for desktop', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const grid = container.firstChild as HTMLElement;
      expect(grid.className).toContain('lg:grid-cols-3');
    });

    it('renders with xl:grid-cols-4 for wide screens', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const grid = container.firstChild as HTMLElement;
      expect(grid.className).toContain('xl:grid-cols-4');
    });

    it('applies responsive gap classes', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const grid = container.firstChild as HTMLElement;
      expect(grid.className).toContain('gap-3');
      expect(grid.className).toContain('sm:gap-4');
      expect(grid.className).toContain('lg:gap-5');
      expect(grid.className).toContain('xl:gap-6');
    });

    it('applies responsive padding', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const grid = container.firstChild as HTMLElement;
      expect(grid.className).toContain('p-3');
      expect(grid.className).toContain('sm:p-4');
      expect(grid.className).toContain('lg:p-6');
    });
  });

  describe('Stagger Animation Container', () => {
    it('uses motion.div with stagger container variants', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const motionDiv = container.querySelector('[data-variants]');
      expect(motionDiv).not.toBeNull();
      const variants = JSON.parse(motionDiv!.getAttribute('data-variants')!);
      expect(variants.visible.transition).toHaveProperty('staggerChildren');
    });

    it('container variants use hidden/visible states', async () => {
      const { ProfileBentoGrid } = await import('../ProfileBentoGrid');
      const { container } = render(
        <ProfileBentoGrid>
          <div>Item</div>
        </ProfileBentoGrid>
      );
      const motionDiv = container.querySelector('[data-variants]');
      const variants = JSON.parse(motionDiv!.getAttribute('data-variants')!);
      expect(variants).toHaveProperty('hidden');
      expect(variants).toHaveProperty('visible');
      expect(motionDiv!.getAttribute('data-initial')).toBe('hidden');
      expect(motionDiv!.getAttribute('data-animate')).toBe('visible');
    });
  });
});

describe('ProfileGridItem', () => {
  const mockTheme = {
    id: 'test',
    name: 'Test',
    colors: {
      background: 'bg-white',
      text: 'text-black',
      textSecondary: 'text-gray-500',
      accent: 'text-blue-500',
      surface: 'bg-gray-50',
      border: 'border-gray-200',
      primaryButton: 'bg-blue-500',
      primaryButtonText: 'text-white',
      secondaryButton: 'bg-gray-200',
      secondaryButtonText: 'text-gray-800',
    },
    colorValues: {},
    fonts: { heading: 'font-sans', body: 'font-sans' },
    effects: {
      radius: 'rounded-xl',
      shadow: 'shadow-md',
      glassmorphism: false,
      blur: '',
    },
  } as any;

  it('uses variants pattern for stagger animation', async () => {
    const { ProfileGridItem } = await import('../ProfileGridItem');
    const { container } = render(
      <ProfileGridItem theme={mockTheme}>
        <div>Content</div>
      </ProfileGridItem>
    );
    const motionDiv = container.querySelector('[data-variants]');
    expect(motionDiv).not.toBeNull();
    const variants = JSON.parse(motionDiv!.getAttribute('data-variants')!);
    expect(variants).toHaveProperty('hidden');
    expect(variants).toHaveProperty('visible');
  });

  it('applies hover scale and translate classes', async () => {
    const { ProfileGridItem } = await import('../ProfileGridItem');
    const { container } = render(
      <ProfileGridItem theme={mockTheme}>
        <div>Content</div>
      </ProfileGridItem>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('hover:scale-[1.02]');
    expect(el.className).toContain('hover:-translate-y-1');
  });

  it('has motion-reduce classes for accessibility', async () => {
    const { ProfileGridItem } = await import('../ProfileGridItem');
    const { container } = render(
      <ProfileGridItem theme={mockTheme}>
        <div>Content</div>
      </ProfileGridItem>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('motion-reduce:');
  });

  it('uses CSS custom properties for theme styling', async () => {
    const { ProfileGridItem } = await import('../ProfileGridItem');
    const { container } = render(
      <ProfileGridItem theme={mockTheme}>
        <div>Content</div>
      </ProfileGridItem>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBe('var(--theme-surface)');
    expect(el.style.borderRadius).toBe('var(--theme-radius)');
  });

  it('has glassmorphism backdrop blur classes', async () => {
    const { ProfileGridItem } = await import('../ProfileGridItem');
    const { container } = render(
      <ProfileGridItem theme={mockTheme}>
        <div>Content</div>
      </ProfileGridItem>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('backdrop-blur');
  });
});

describe('useColorScheme', () => {
  let matchMediaMock: any;

  beforeEach(() => {
    matchMediaMock = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  it('returns light by default', async () => {
    const { useColorScheme } = await import('../../../../hooks/useColorScheme');
    let result: string = '';
    const TestComponent = () => {
      result = useColorScheme();
      return null;
    };
    render(<TestComponent />);
    expect(result).toBe('light');
  });

  it('returns dark when matchMedia matches', async () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const { useColorScheme } = await import('../../../../hooks/useColorScheme');
    let result: string = '';
    const TestComponent = () => {
      result = useColorScheme();
      return null;
    };
    render(<TestComponent />);
    expect(result).toBe('dark');
  });

  it('queries prefers-color-scheme media', async () => {
    const { useColorScheme } = await import('../../../../hooks/useColorScheme');
    const TestComponent = () => {
      useColorScheme();
      return null;
    };
    render(<TestComponent />);
    expect(matchMediaMock).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });
});
