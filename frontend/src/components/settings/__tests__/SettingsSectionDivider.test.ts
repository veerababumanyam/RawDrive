import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SettingsSectionDivider } from '../SettingsSectionDivider';

/**
 * SettingsSectionDivider Component Tests
 *
 * Tests for section divider styling and labels
 */

describe('SettingsSectionDivider', () => {
  describe('without label', () => {
    it('should render as simple divider', () => {
      const { container } = render(<SettingsSectionDivider />);
      const divider = container.querySelector('div');
      expect(divider).toBeInTheDocument();
    });

    it('should have border styling', () => {
      const { container } = render(<SettingsSectionDivider />);
      const divider = container.querySelector('div');
      expect(divider?.className).toContain('border-t');
    });

    it('should have margin spacing', () => {
      const { container } = render(<SettingsSectionDivider />);
      const divider = container.querySelector('div');
      expect(divider?.className).toContain('my-');
    });

    it('should not display label', () => {
      const { container } = render(<SettingsSectionDivider />);
      const label = container.querySelector('span');
      expect(label).not.toBeInTheDocument();
    });
  });

  describe('with label', () => {
    it('should render label', () => {
      const { container } = render(<SettingsSectionDivider label="Related Settings" />);
      const label = container.querySelector('span');
      expect(label?.textContent).toBe('Related Settings');
    });

    it('should display label as uppercase', () => {
      const { container } = render(<SettingsSectionDivider label="related settings" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('uppercase');
    });

    it('should have glass-light styling on label', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('glass-light');
    });

    it('should have tracking-wider for letter spacing', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('tracking-wider');
    });

    it('should have rounded-full styling', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('rounded-full');
    });

    it('should center label over border line', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper?.className).toContain('relative');
    });
  });

  describe('styling consistency', () => {
    it('should use tertiary text color', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('text-text-tertiary');
    });

    it('should use white/10 border color', () => {
      const { container } = render(<SettingsSectionDivider />);
      const divider = container.querySelector('div');
      expect(divider?.className).toContain('border-white/10');
    });

    it('should use small font size for label', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('text-xs');
    });

    it('should use medium font weight for label', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('font-medium');
    });
  });

  describe('with different label lengths', () => {
    it('should handle short labels', () => {
      const { container } = render(<SettingsSectionDivider label="A" />);
      const label = container.querySelector('span');
      expect(label?.textContent).toBe('A');
    });

    it('should handle long labels', () => {
      const longLabel = 'This is a very long section label';
      const { container } = render(<SettingsSectionDivider label={longLabel} />);
      const label = container.querySelector('span');
      expect(label?.textContent).toBe(longLabel);
    });

    it('should maintain centering with various label lengths', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper?.className).toContain('flex');
      expect(wrapper?.className).toContain('justify-center');
    });
  });

  describe('layout structure', () => {
    it('should have proper flex layout', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper?.className).toContain('relative');
      expect(wrapper?.className).toContain('my-');
    });

    it('should have absolute positioned line', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const line = container.querySelector('.absolute');
      expect(line?.className).toContain('inset-0');
    });

    it('should have padding on label', () => {
      const { container } = render(<SettingsSectionDivider label="Section" />);
      const label = container.querySelector('span');
      expect(label?.className).toContain('px-');
      expect(label?.className).toContain('py-');
    });
  });
});
