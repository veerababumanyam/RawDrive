import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { GradientColorPicker } from './GradientColorPicker';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock react-best-gradient-color-picker
vi.mock('react-best-gradient-color-picker', () => ({
  default: ({ value, onChange, width, height }: any) => (
    <div
      data-testid="color-picker"
      data-value={value}
      data-width={width}
      data-height={height}
      onClick={() => onChange?.('rgba(255,0,0,1)')}
    >
      Mock ColorPicker
    </div>
  ),
}));

describe('GradientColorPicker', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the ColorPicker component', () => {
    render(
      <GradientColorPicker value="#ff0000" onChange={mockOnChange} />
    );

    expect(screen.getByTestId('color-picker')).toBeInTheDocument();
  });

  it('renders a label when provided', () => {
    render(
      <GradientColorPicker
        value="#ff0000"
        onChange={mockOnChange}
        label="Background Color"
      />
    );

    expect(screen.getByText('Background Color')).toBeInTheDocument();
  });

  it('shows current color as a preview swatch', () => {
    const { container } = render(
      <GradientColorPicker value="#ff0000" onChange={mockOnChange} />
    );

    const swatch = container.querySelector('[data-testid="color-swatch"]');
    expect(swatch).toBeInTheDocument();
    expect(swatch).toHaveStyle({ background: '#ff0000' });
  });

  it('calls onChange when color is picked', () => {
    render(
      <GradientColorPicker value="#ff0000" onChange={mockOnChange} />
    );

    const picker = screen.getByTestId('color-picker');
    picker.click();

    expect(mockOnChange).toHaveBeenCalledWith('rgba(255,0,0,1)');
  });
});
