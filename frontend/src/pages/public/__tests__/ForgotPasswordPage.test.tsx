import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '../ForgotPasswordPage';

// Mock dependencies
vi.mock('../../../components/landing', () => ({
  LandingLayout: ({ children }: any) => <div>{children}</div>,
  SEOHead: () => null,
}));

vi.mock('../../../components/landing/ui/GlassCard', () => ({
  GlassCard: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../../../components/landing/animations/presets', () => ({
  fadeInUp: { hidden: {}, visible: {} },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );
  }

  it('renders the forgot password heading and instructions', () => {
    renderPage();

    expect(screen.getByText('Forgot your password?')).toBeInTheDocument();
    expect(
      screen.getByText("No worries, we'll send you reset instructions.")
    ).toBeInTheDocument();
  });

  it('renders email input field', () => {
    renderPage();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders Send Reset Link submit button', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('renders Back to Sign In link', () => {
    renderPage();

    const backLink = screen.getByText('Back to Sign In');
    expect(backLink.closest('a')).toHaveAttribute('href', '/signin');
  });

  it('shows success message after form submission', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
      expect(
        screen.getByText(/We've sent a password reset link to/)
      ).toBeInTheDocument();
    });
  });

  it('shows try again button in success state', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText('try again')).toBeInTheDocument();
    });
  });
});
