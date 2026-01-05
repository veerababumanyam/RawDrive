import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QualityFilterSection } from '../../../../src/components/features/ai/QualityFilterSection';

describe('QualityFilterSection', () => {
  it('renders tiers and calls onChange when selecting tier', () => {
    const onChange = vi.fn();
    render(
      <QualityFilterSection qualityTier="all" onChange={onChange} />
    );

    // Button has aria-label set to description, so find by text content
    const excellentBtn = screen.getByText(/Excellent \(90\+\)/i).closest('button')!;
    fireEvent.click(excellentBtn);
    expect(onChange).toHaveBeenCalledWith({ qualityTier: 'excellent' });
  });

  it('updates minimum score input', () => {
    const onChange = vi.fn();
    render(
      <QualityFilterSection qualityTier="all" qualityMin={50} onChange={onChange} />
    );

    const input = screen.getByLabelText(/minimum score/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith({ qualityMin: 75 });
  });
});
