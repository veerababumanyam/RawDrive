/**
 * Tests for BrandedPasswordPage component.
 *
 * Verifies branded password entry page renders correctly with
 * photographer logo, accent color, welcome message, and password submission.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandedPasswordPage } from './BrandedPasswordPage';

describe('BrandedPasswordPage', () => {
  const defaultProps = {
    galleryTitle: 'Wedding Gallery 2026',
    onPasswordSubmit: vi.fn(),
  };

  it('renders gallery title', () => {
    render(<BrandedPasswordPage {...defaultProps} />);
    expect(screen.getByText('Wedding Gallery 2026')).toBeInTheDocument();
  });

  it('renders welcome message when provided', () => {
    render(
      <BrandedPasswordPage
        {...defaultProps}
        welcomeMessage="Welcome to our special day!"
      />
    );
    expect(screen.getByText('Welcome to our special day!')).toBeInTheDocument();
  });

  it('renders photographer logo when brandingLogoUrl provided', () => {
    render(
      <BrandedPasswordPage
        {...defaultProps}
        brandingLogoUrl="https://example.com/logo.png"
      />
    );
    const logo = screen.getByAltText('Photographer logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('renders default branding when no logo provided', () => {
    render(<BrandedPasswordPage {...defaultProps} />);
    // Should show a lock icon or default text instead of logo
    expect(screen.getByTestId('default-branding')).toBeInTheDocument();
  });

  it('renders password input field', () => {
    render(<BrandedPasswordPage {...defaultProps} />);
    const input = screen.getByPlaceholderText(/password/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
  });

  it('calls onPasswordSubmit with entered password', async () => {
    const onSubmit = vi.fn();
    render(<BrandedPasswordPage {...defaultProps} onPasswordSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText(/password/i);
    await userEvent.type(input, 'secret123');

    const submitBtn = screen.getByRole('button', { name: /enter|submit|unlock/i });
    await userEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith('secret123');
  });

  it('shows error message on empty submit', async () => {
    render(<BrandedPasswordPage {...defaultProps} />);

    const submitBtn = screen.getByRole('button', { name: /enter|submit|unlock/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText(/please enter/i)).toBeInTheDocument();
    expect(defaultProps.onPasswordSubmit).not.toHaveBeenCalled();
  });

  it('shows error message when error prop is set', () => {
    render(<BrandedPasswordPage {...defaultProps} error="Incorrect password" />);
    expect(screen.getByText('Incorrect password')).toBeInTheDocument();
  });

  it('applies accent color as CSS custom property', () => {
    const { container } = render(
      <BrandedPasswordPage {...defaultProps} brandingAccentColor="#FF5733" />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--brand-accent')).toBe('#FF5733');
  });

  it('uses default accent color when none provided', () => {
    const { container } = render(<BrandedPasswordPage {...defaultProps} />);
    const wrapper = container.firstElementChild as HTMLElement;
    // Should have a default accent color set
    expect(wrapper.style.getPropertyValue('--brand-accent')).toBeTruthy();
  });
});
