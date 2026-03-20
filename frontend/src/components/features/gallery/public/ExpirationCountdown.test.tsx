import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ExpirationCountdown } from './ExpirationCountdown';

describe('ExpirationCountdown', () => {
  it('renders nothing when daysUntilExpiry is null', () => {
    const { container } = render(
      <ExpirationCountdown daysUntilExpiry={null} expiresAt={null} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows "X days remaining" when days > 7', () => {
    render(
      <ExpirationCountdown
        daysUntilExpiry={14}
        expiresAt="2026-04-03T00:00:00Z"
      />,
    );
    expect(screen.getByText(/Expires/)).toBeTruthy();
  });

  it('shows amber/warning styling when days_until_expiry is between 3 and 7', () => {
    const { container } = render(
      <ExpirationCountdown
        daysUntilExpiry={5}
        expiresAt="2026-03-25T00:00:00Z"
      />,
    );
    expect(screen.getByText(/5 days/i)).toBeTruthy();
    // Should contain amber/warning styling
    const pill = container.querySelector('[data-testid="expiration-pill"]');
    expect(pill?.className).toContain('amber');
  });

  it('shows urgent red styling when days_until_expiry <= 3', () => {
    const { container } = render(
      <ExpirationCountdown
        daysUntilExpiry={2}
        expiresAt="2026-03-22T00:00:00Z"
      />,
    );
    expect(screen.getByText(/2 days/i)).toBeTruthy();
    const pill = container.querySelector('[data-testid="expiration-pill"]');
    expect(pill?.className).toContain('red');
  });

  it('shows "Expires today!" when days is 0', () => {
    render(
      <ExpirationCountdown
        daysUntilExpiry={0}
        expiresAt="2026-03-20T00:00:00Z"
      />,
    );
    expect(screen.getByText(/Expires today/i)).toBeTruthy();
  });

  it('shows "Expires tomorrow!" when days is 1', () => {
    render(
      <ExpirationCountdown
        daysUntilExpiry={1}
        expiresAt="2026-03-21T00:00:00Z"
      />,
    );
    expect(screen.getByText(/Expires tomorrow/i)).toBeTruthy();
  });
});
