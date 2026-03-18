import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '../SignUpPage';

// Mock dependencies
const mockSignup = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../contexts', () => ({
  useAuth: () => ({
    signup: mockSignup,
    googleOAuthUrl: vi.fn(() => 'https://accounts.google.com/oauth'),
  }),
}));

vi.mock('../../../hooks/useTheme', () => ({
  default: () => ({ resolvedTheme: 'dark' }),
}));

vi.mock('../../../components/landing', () => ({
  SEOHead: () => null,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('SignUpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
  }

  it('renders Full Name, Email, and Password fields', () => {
    renderPage();

    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders Create Account submit button', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders Create account heading and trial info', () => {
    renderPage();

    expect(screen.getByText('Create account')).toBeInTheDocument();
    expect(screen.getByText('Start your 14-day free trial')).toBeInTheDocument();
  });

  it('renders link to sign in page', () => {
    renderPage();

    const signInLink = screen.getByText('Sign in');
    expect(signInLink).toBeInTheDocument();
    expect(signInLink.closest('a')).toHaveAttribute('href', '/signin');
  });

  it('shows password requirements when typing password', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Password'), 'a');

    expect(screen.getByText('8+ characters')).toBeInTheDocument();
    expect(screen.getByText('Uppercase')).toBeInTheDocument();
    expect(screen.getByText('Lowercase')).toBeInTheDocument();
    expect(screen.getByText('Number')).toBeInTheDocument();
  });

  it('shows error when terms not accepted on submit', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Full Name'), 'John Doe');
    await user.type(screen.getByLabelText('Email'), 'john@example.com');
    await user.type(screen.getByLabelText('Password'), 'StrongPass1');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /accept the Terms/i
      );
    });
  });

  it('shows error on failed signup', async () => {
    mockSignup.mockResolvedValue({ success: false, error: 'Email already exists' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Full Name'), 'John Doe');
    await user.type(screen.getByLabelText('Email'), 'john@example.com');
    await user.type(screen.getByLabelText('Password'), 'StrongPass1');
    // Accept terms checkbox
    await user.click(screen.getByLabelText(/I agree to the/i));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email already exists');
    });
  });

  it('renders Google sign-up button', () => {
    renderPage();

    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });
});
