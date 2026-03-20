import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressiveImage } from './ProgressiveImage';

// Mock the hook so we can control its return value
vi.mock('../../../../hooks/useProgressiveImage', () => ({
  useProgressiveImage: vi.fn(),
}));

import { useProgressiveImage } from '../../../../hooks/useProgressiveImage';
const mockUseProgressiveImage = vi.mocked(useProgressiveImage);

describe('ProgressiveImage', () => {
  const baseProps = {
    src: 'https://cdn.example.com/photo.jpg',
    lqip: 'data:image/jpeg;base64,abc',
    width: 1600,
    height: 1200,
    alt: 'Test photo',
  };

  it('renders an img element with the currentSrc from hook', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'data:image/jpeg;base64,abc',
      isLoaded: false,
      isError: false,
    });

    render(<ProgressiveImage {...baseProps} />);

    const img = screen.getByRole('img', { name: 'Test photo' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,abc');
  });

  it('applies blur(20px) filter when not loaded', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'data:lqip',
      isLoaded: false,
      isError: false,
    });

    render(<ProgressiveImage {...baseProps} />);

    const img = screen.getByRole('img');
    expect(img.style.filter).toBe('blur(20px)');
  });

  it('applies blur(0) filter when loaded', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'https://cdn.example.com/photo.jpg',
      isLoaded: true,
      isError: false,
    });

    render(<ProgressiveImage {...baseProps} />);

    const img = screen.getByRole('img');
    expect(img.style.filter).toBe('blur(0px)');
  });

  it('has 300ms transition on filter', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'data:lqip',
      isLoaded: false,
      isError: false,
    });

    render(<ProgressiveImage {...baseProps} />);

    const img = screen.getByRole('img');
    expect(img.style.transition).toContain('filter 300ms');
  });

  it('wrapper div has aspect-ratio CSS for CLS prevention', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'data:lqip',
      isLoaded: false,
      isError: false,
    });

    const { container } = render(<ProgressiveImage {...baseProps} />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.aspectRatio).toBe('1600 / 1200');
  });

  it('fires onClick callback when clicked', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'data:lqip',
      isLoaded: false,
      isError: false,
    });

    const onClick = vi.fn();
    const { container } = render(<ProgressiveImage {...baseProps} onClick={onClick} />);

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies scale(1.05) when not loaded to hide blur edges', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'data:lqip',
      isLoaded: false,
      isError: false,
    });

    render(<ProgressiveImage {...baseProps} />);

    const img = screen.getByRole('img');
    expect(img.style.transform).toBe('scale(1.05)');
  });

  it('applies scale(1) when loaded', () => {
    mockUseProgressiveImage.mockReturnValue({
      currentSrc: 'https://cdn.example.com/photo.jpg',
      isLoaded: true,
      isError: false,
    });

    render(<ProgressiveImage {...baseProps} />);

    const img = screen.getByRole('img');
    expect(img.style.transform).toBe('scale(1)');
  });
});
