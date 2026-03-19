import { describe, it, expect, vi } from 'vitest';
import {
  resolveThemeId,
  resolveThemeTokens,
  applyThemeToContainer,
  removeThemeFromContainer,
  LEGACY_TO_PREBUILT_MAP,
  type ThemeTokens,
} from '../UnifiedThemeEngine';

describe('UnifiedThemeEngine', () => {
  describe('LEGACY_TO_PREBUILT_MAP', () => {
    it('contains entries for all 5 legacy themes', () => {
      const legacyIds = ['minimal', 'dark', 'pastel', 'bold', 'cinematic'];
      for (const id of legacyIds) {
        expect(LEGACY_TO_PREBUILT_MAP).toHaveProperty(id);
        expect(typeof LEGACY_TO_PREBUILT_MAP[id]).toBe('string');
      }
    });
  });

  describe('resolveThemeId', () => {
    it('returns PREBUILT ID for known legacy theme', () => {
      const result = resolveThemeId('minimal');
      expect(result).toBe(LEGACY_TO_PREBUILT_MAP['minimal']);
      // Should be a theme-* prefixed ID
      expect(result).toMatch(/^theme-/);
    });

    it('returns input unchanged for valid PREBUILT theme ID', () => {
      const result = resolveThemeId('theme-vivid-impact');
      expect(result).toBe('theme-vivid-impact');
    });

    it('returns theme-clean-slate for undefined input', () => {
      expect(resolveThemeId(undefined)).toBe('theme-clean-slate');
    });

    it('returns theme-clean-slate for null input', () => {
      expect(resolveThemeId(null)).toBe('theme-clean-slate');
    });

    it('returns theme-clean-slate for empty string input', () => {
      expect(resolveThemeId('')).toBe('theme-clean-slate');
    });
  });

  describe('resolveThemeTokens', () => {
    it('returns ThemeTokens object with all required CSS variable keys', () => {
      const tokens = resolveThemeTokens('theme-clean-slate', false);
      const requiredKeys = [
        '--theme-bg',
        '--theme-surface',
        '--theme-text',
        '--theme-text-secondary',
        '--theme-accent',
        '--theme-primary',
        '--theme-border',
        '--theme-font-heading',
        '--theme-font-body',
        '--theme-radius',
        '--theme-shadow',
        '--theme-gradient',
      ];
      for (const key of requiredKeys) {
        expect(tokens).toHaveProperty(key);
        expect(typeof tokens[key as keyof ThemeTokens]).toBe('string');
      }
    });

    it('selects dark variant colors when prefersDark=true', () => {
      const lightTokens = resolveThemeTokens('theme-clean-slate', false);
      const darkTokens = resolveThemeTokens('theme-clean-slate', true);
      // Dark variant should have different background than light
      expect(darkTokens['--theme-bg']).not.toBe(lightTokens['--theme-bg']);
    });

    it('selects light variant colors when prefersDark=false', () => {
      const tokens = resolveThemeTokens('theme-clean-slate', false);
      // Clean Slate light background is #FFFFFF
      expect(tokens['--theme-bg']).toBe('#FFFFFF');
    });

    it('falls back to default theme for unknown theme ID', () => {
      const tokens = resolveThemeTokens('nonexistent-theme-id', false);
      // Should still return valid tokens (from default theme)
      expect(tokens['--theme-bg']).toBeTruthy();
      expect(tokens['--theme-text']).toBeTruthy();
    });
  });

  describe('applyThemeToContainer', () => {
    it('sets CSS custom properties on provided element', () => {
      const mockElement = {
        style: {
          setProperty: vi.fn(),
        },
      } as unknown as HTMLElement;

      const tokens = resolveThemeTokens('theme-clean-slate', false);
      applyThemeToContainer(tokens, mockElement);

      // Should have called setProperty for each token
      const callCount = mockElement.style.setProperty.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(12);

      // Check that specific properties were set
      const calledProps = (mockElement.style.setProperty as ReturnType<typeof vi.fn>).mock.calls.map(
        (call: unknown[]) => call[0]
      );
      expect(calledProps).toContain('--theme-bg');
      expect(calledProps).toContain('--theme-text');
      expect(calledProps).toContain('--theme-font-heading');
    });
  });

  describe('removeThemeFromContainer', () => {
    it('removes all --theme-* properties from element', () => {
      const mockElement = {
        style: {
          removeProperty: vi.fn(),
        },
      } as unknown as HTMLElement;

      removeThemeFromContainer(mockElement);

      const calledProps = (mockElement.style.removeProperty as ReturnType<typeof vi.fn>).mock.calls.map(
        (call: unknown[]) => call[0]
      );
      expect(calledProps).toContain('--theme-bg');
      expect(calledProps).toContain('--theme-text');
      expect(calledProps).toContain('--theme-font-heading');
      expect(calledProps.length).toBeGreaterThanOrEqual(12);
    });
  });
});
