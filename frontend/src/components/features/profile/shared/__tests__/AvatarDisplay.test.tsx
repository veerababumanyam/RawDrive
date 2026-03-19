import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AvatarDisplay } from '../AvatarDisplay';

describe('AvatarDisplay', () => {
  it('renders img tag when avatarUrl is provided', () => {
    render(<AvatarDisplay avatarUrl="https://example.com/avatar.webp" displayName="John Doe" />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.webp');
    expect(img).toHaveAttribute('alt', 'John Doe');
  });

  it('shows initials badge when avatarUrl is undefined', () => {
    render(<AvatarDisplay displayName="John Doe" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('shows initials badge when img fires onError (broken image)', () => {
    render(<AvatarDisplay avatarUrl="https://example.com/broken.webp" displayName="Jane Smith" />);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('generates initials from first letters of each word, max 2, uppercased', () => {
    render(<AvatarDisplay displayName="John Michael Doe" />);
    expect(screen.getByText('JM')).toBeInTheDocument();
  });

  it('produces single initial for single-word name', () => {
    render(<AvatarDisplay displayName="Madonna" />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('handles empty displayName gracefully without crashing', () => {
    render(<AvatarDisplay displayName="" />);
    // Should render without crash - initials div exists but empty
    const container = document.querySelector('[data-testid="avatar-initials"]');
    expect(container).toBeInTheDocument();
  });

  it('size prop controls dimensions: sm=32px, md=64px, lg=128px', () => {
    const { rerender } = render(<AvatarDisplay displayName="AB" size="sm" />);
    let el = screen.getByText('AB');
    expect(el.className).toContain('w-8');
    expect(el.className).toContain('h-8');

    rerender(<AvatarDisplay displayName="AB" size="md" />);
    el = screen.getByText('AB');
    expect(el.className).toContain('w-16');
    expect(el.className).toContain('h-16');

    rerender(<AvatarDisplay displayName="AB" size="lg" />);
    el = screen.getByText('AB');
    expect(el.className).toContain('w-32');
    expect(el.className).toContain('h-32');
  });
});
