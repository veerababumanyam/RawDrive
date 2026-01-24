import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ScopeIndicator } from '../ScopeIndicator';

/**
 * ScopeIndicator Component Tests
 *
 * Tests for scope indicator badge and switcher functionality
 */

describe('ScopeIndicator', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(<BrowserRouter>{component}</BrowserRouter>);
  };

  describe('personal scope', () => {
    it('should display Personal Settings badge', () => {
      renderWithRouter(<ScopeIndicator scope="personal" />);
      expect(screen.getByText('Personal Settings')).toBeInTheDocument();
    });

    it('should display user icon for personal scope', () => {
      renderWithRouter(<ScopeIndicator scope="personal" />);
      const badge = screen.getByText('Personal Settings').closest('div');
      expect(badge?.querySelector('svg')).toBeInTheDocument();
    });

    it('should not display switcher button by default', () => {
      renderWithRouter(<ScopeIndicator scope="personal" />);
      expect(screen.queryByText(/Switch to/)).not.toBeInTheDocument();
    });

    it('should display switcher button when showSwitcher is true', () => {
      renderWithRouter(<ScopeIndicator scope="personal" showSwitcher />);
      expect(screen.getByText(/Switch to Workspace Settings/)).toBeInTheDocument();
    });
  });

  describe('workspace scope', () => {
    it('should display Workspace Settings badge', () => {
      renderWithRouter(<ScopeIndicator scope="workspace" />);
      expect(screen.getByText('Workspace Settings')).toBeInTheDocument();
    });

    it('should display building icon for workspace scope', () => {
      renderWithRouter(<ScopeIndicator scope="workspace" />);
      const badge = screen.getByText('Workspace Settings').closest('div');
      expect(badge?.querySelector('svg')).toBeInTheDocument();
    });

    it('should display switcher button when showSwitcher is true', () => {
      renderWithRouter(<ScopeIndicator scope="workspace" showSwitcher />);
      expect(screen.getByText(/Switch to Personal Settings/)).toBeInTheDocument();
    });
  });

  describe('scope switcher', () => {
    it('should call onSwitchScope callback when provided', () => {
      const mockCallback = vi.fn();
      renderWithRouter(
        <ScopeIndicator scope="personal" showSwitcher onSwitchScope={mockCallback} />
      );

      const switchButton = screen.getByText(/Switch to/);
      fireEvent.click(switchButton);

      expect(mockCallback).toHaveBeenCalledOnce();
    });

    it('should display correct text for switching from personal', () => {
      renderWithRouter(<ScopeIndicator scope="personal" showSwitcher />);
      const switchButton = screen.getByText(/Switch to Workspace Settings/);
      expect(switchButton).toBeInTheDocument();
    });

    it('should display correct text for switching from workspace', () => {
      renderWithRouter(<ScopeIndicator scope="workspace" showSwitcher />);
      const switchButton = screen.getByText(/Switch to Personal Settings/);
      expect(switchButton).toBeInTheDocument();
    });
  });

  describe('responsive design', () => {
    it('should have responsive flex layout', () => {
      const { container } = renderWithRouter(<ScopeIndicator scope="personal" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper?.className).toContain('flex');
    });

    it('should have responsive classes for mobile and desktop', () => {
      const { container } = renderWithRouter(
        <ScopeIndicator scope="personal" showSwitcher />
      );
      const wrapper = container.querySelector('[class*="sm:"]');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', () => {
      renderWithRouter(<ScopeIndicator scope="personal" showSwitcher />);
      const switchButton = screen.getByText(/Switch to/);
      expect(switchButton).toHaveProperty('className');
    });

    it('should have proper semantic structure', () => {
      const { container } = renderWithRouter(
        <ScopeIndicator scope="personal" showSwitcher />
      );
      const button = container.querySelector('button');
      expect(button).toBeInTheDocument();
    });
  });
});
