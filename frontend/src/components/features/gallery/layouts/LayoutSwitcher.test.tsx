import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutSwitcher } from './LayoutSwitcher';

describe('LayoutSwitcher', () => {
  const defaultProps = {
    activeLayout: 'grid' as const,
    onLayoutChange: vi.fn(),
  };

  it('renders correct number of layout buttons for default availableLayouts', () => {
    render(<LayoutSwitcher {...defaultProps} />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(4);
  });

  it('renders only the specified availableLayouts', () => {
    render(
      <LayoutSwitcher
        {...defaultProps}
        availableLayouts={['grid', 'masonry']}
      />,
    );
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(2);
  });

  it('marks the active layout button as checked', () => {
    render(<LayoutSwitcher {...defaultProps} activeLayout="masonry" />);
    const masonry = screen.getByRole('radio', { name: /masonry/i });
    expect(masonry).toHaveAttribute('aria-checked', 'true');

    const grid = screen.getByRole('radio', { name: /grid/i });
    expect(grid).toHaveAttribute('aria-checked', 'false');
  });

  it('active layout button has primary styling class', () => {
    render(<LayoutSwitcher {...defaultProps} activeLayout="justified" />);
    const justified = screen.getByRole('radio', { name: /justified/i });
    expect(justified.className).toContain('bg-primary');
  });

  it('calls onLayoutChange when a non-active button is clicked', () => {
    const onChange = vi.fn();
    render(<LayoutSwitcher activeLayout="grid" onLayoutChange={onChange} />);
    const masonry = screen.getByRole('radio', { name: /masonry/i });
    fireEvent.click(masonry);
    expect(onChange).toHaveBeenCalledWith('masonry');
  });

  it('does not call onLayoutChange when the active button is clicked', () => {
    const onChange = vi.fn();
    render(<LayoutSwitcher activeLayout="grid" onLayoutChange={onChange} />);
    const grid = screen.getByRole('radio', { name: /grid/i });
    fireEvent.click(grid);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('buttons have correct aria-label attributes', () => {
    render(<LayoutSwitcher {...defaultProps} />);
    expect(screen.getByLabelText('Switch to Grid layout')).toBeDefined();
    expect(screen.getByLabelText('Switch to Masonry layout')).toBeDefined();
    expect(screen.getByLabelText('Switch to Justified layout')).toBeDefined();
    expect(screen.getByLabelText('Switch to Mosaic layout')).toBeDefined();
  });

  it('container has radiogroup role', () => {
    render(<LayoutSwitcher {...defaultProps} />);
    expect(screen.getByRole('radiogroup')).toBeDefined();
  });
});
