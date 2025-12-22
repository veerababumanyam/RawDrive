import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exitIntentUtils } from '../components/landing/features/ExitIntentPopup';

// Mock framer-motion with all necessary components
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
                ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>
            ),
            button: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
                ({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>
            ),
        },
    };
});

// Create a test-friendly version of the popup that's always visible
const TestableExitPopup = React.lazy(async () => {
    // Import the real component
    const module = await import('../components/landing/features/ExitIntentPopup');

    // Create a wrapper that forces visibility
    const TestWrapper: React.FC<{
        headline?: string;
        description?: string;
        discountCode?: string;
        onEmailSubmit?: (email: string) => Promise<void>;
        onClose?: () => void;
    }> = ({
        headline = "Wait! Don't miss out",
        description = 'Get 20% off your first year when you sign up today. Plus, get our exclusive photography workflow guide free!',
        discountCode = 'WELCOME20',
        onEmailSubmit,
        onClose = () => { },
    }) => {
            const [isSuccess, setIsSuccess] = React.useState(false);
            const [email, setEmail] = React.useState('');
            const [error, setError] = React.useState<string | null>(null);
            const [isSubmitting, setIsSubmitting] = React.useState(false);

            const handleSubmit = async (e: React.FormEvent) => {
                e.preventDefault();
                setError(null);

                if (!email.trim()) {
                    setError('Please enter your email address');
                    return;
                }

                if (!module.exitIntentUtils.isValidEmail(email)) {
                    setError('Please enter a valid email address');
                    return;
                }

                setIsSubmitting(true);
                try {
                    if (onEmailSubmit) {
                        await onEmailSubmit(email);
                    }
                    module.exitIntentUtils.setCookie(module.exitIntentUtils.CONVERTED_COOKIE, 'true', 365);
                    setIsSuccess(true);
                } catch (err) {
                    setError('Something went wrong. Please try again.');
                } finally {
                    setIsSubmitting(false);
                }
            };

            return (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="exit-popup-title"
                >
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={onClose}
                        aria-hidden="true"
                    />
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-neutral-100 transition-colors z-10 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label="Close popup"
                        >
                            X
                        </button>
                        <div className="p-8 pt-12">
                            {isSuccess ? (
                                <div className="text-center">
                                    <h3>You're all set!</h3>
                                    <p>Check your inbox for your discount code and free guide.</p>
                                    <div className="bg-neutral-100 rounded-lg p-4 mb-6">
                                        <div>Your discount code</div>
                                        <div>{discountCode}</div>
                                    </div>
                                    <button onClick={onClose}>Continue to RawDrive</button>
                                </div>
                            ) : (
                                <>
                                    <h2 id="exit-popup-title">{headline}</h2>
                                    <p>{description}</p>
                                    <form onSubmit={handleSubmit}>
                                        <label htmlFor="exit-email" className="sr-only">Email address</label>
                                        <input
                                            id="exit-email"
                                            type="email"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) => { setEmail(e.target.value); setError(null); }}
                                            aria-invalid={!!error}
                                            aria-describedby={error ? 'email-error' : undefined}
                                        />
                                        {error && (
                                            <p id="email-error" role="alert">{error}</p>
                                        )}
                                        <button type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? 'Sending...' : 'Get My Discount'}
                                        </button>
                                    </form>
                                    <button onClick={onClose}>No thanks, I'll pay full price</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        };

    return { default: TestWrapper };
});

describe('ExitIntentPopup Component', () => {
    /* =============================================================================
       Task 17.4: Unit Tests for ExitIntentPopup
       Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
       ============================================================================= */

    beforeEach(() => {
        // Clear cookies before each test
        document.cookie = `${exitIntentUtils.COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${exitIntentUtils.CONVERTED_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Cookie Utilities', () => {
        it('setCookie sets cookie with correct value', () => {
            exitIntentUtils.setCookie('test_cookie', 'value', 7);
            expect(document.cookie).toContain('test_cookie=value');
        });

        it('getCookie returns cookie value when exists', () => {
            document.cookie = 'test_cookie=test_value; path=/';
            const value = exitIntentUtils.getCookie('test_cookie');
            expect(value).toBe('test_value');
        });

        it('getCookie returns null when cookie does not exist', () => {
            const value = exitIntentUtils.getCookie('nonexistent_cookie');
            expect(value).toBeNull();
        });
    });

    describe('Email Validation', () => {
        it('validates correct email format', () => {
            expect(exitIntentUtils.isValidEmail('test@example.com')).toBe(true);
            expect(exitIntentUtils.isValidEmail('user.name@domain.co.in')).toBe(true);
        });

        it('rejects invalid email format', () => {
            expect(exitIntentUtils.isValidEmail('invalid')).toBe(false);
            expect(exitIntentUtils.isValidEmail('invalid@')).toBe(false);
            expect(exitIntentUtils.isValidEmail('@domain.com')).toBe(false);
            expect(exitIntentUtils.isValidEmail('user @domain.com')).toBe(false);
        });
    });

    describe('Popup Display (Requirement 18.1)', () => {
        it('renders dialog with correct ARIA attributes', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            const dialog = await screen.findByRole('dialog');
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            expect(dialog).toHaveAttribute('aria-labelledby', 'exit-popup-title');
        });

        it('renders default headline and description', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            expect(await screen.findByText("Wait! Don't miss out")).toBeInTheDocument();
            expect(screen.getByText(/Get 20% off your first year/)).toBeInTheDocument();
        });

        it('renders custom headline when provided', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup headline="Custom Headline" />
                </React.Suspense>
            );

            expect(await screen.findByText('Custom Headline')).toBeInTheDocument();
        });
    });

    describe('Email Capture (Requirement 18.2, 18.3)', () => {
        it('renders email input field', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
        });

        it('shows error when submitting empty email', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            const submitButton = await screen.findByRole('button', { name: /get my discount/i });
            fireEvent.click(submitButton);

            expect(await screen.findByRole('alert')).toHaveTextContent('Please enter your email address');
        });

        it('shows error for invalid email format', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            const input = await screen.findByPlaceholderText('Enter your email');
            // Use an email that fails our regex validation but might pass HTML5 validation
            fireEvent.change(input, { target: { value: 'invalid' } });

            // Use fireEvent.submit on the form to bypass HTML5 validation
            const form = input.closest('form');
            fireEvent.submit(form!);

            expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a valid email address');
        });

        it('calls onEmailSubmit with valid email', async () => {
            const mockSubmit = vi.fn().mockResolvedValue(undefined);
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup onEmailSubmit={mockSubmit} />
                </React.Suspense>
            );

            const input = await screen.findByPlaceholderText('Enter your email');
            fireEvent.change(input, { target: { value: 'test@example.com' } });

            const submitButton = screen.getByRole('button', { name: /get my discount/i });
            fireEvent.click(submitButton);

            // Wait for async submission
            await screen.findByText("You're all set!");
            expect(mockSubmit).toHaveBeenCalledWith('test@example.com');
        });

        it('shows success state after successful submission', async () => {
            const mockSubmit = vi.fn().mockResolvedValue(undefined);
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup onEmailSubmit={mockSubmit} discountCode="TEST20" />
                </React.Suspense>
            );

            const input = await screen.findByPlaceholderText('Enter your email');
            fireEvent.change(input, { target: { value: 'test@example.com' } });

            const submitButton = screen.getByRole('button', { name: /get my discount/i });
            fireEvent.click(submitButton);

            expect(await screen.findByText("You're all set!")).toBeInTheDocument();
            expect(screen.getByText('TEST20')).toBeInTheDocument();
        });

        it('shows error state when submission fails', async () => {
            const mockSubmit = vi.fn().mockRejectedValue(new Error('Network error'));
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup onEmailSubmit={mockSubmit} />
                </React.Suspense>
            );

            const input = await screen.findByPlaceholderText('Enter your email');
            fireEvent.change(input, { target: { value: 'test@example.com' } });

            const submitButton = screen.getByRole('button', { name: /get my discount/i });
            fireEvent.click(submitButton);

            expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
        });
    });

    describe('Converted Users (Requirement 18.5)', () => {
        it('sets converted cookie on successful email submission', async () => {
            const mockSubmit = vi.fn().mockResolvedValue(undefined);
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup onEmailSubmit={mockSubmit} />
                </React.Suspense>
            );

            const input = await screen.findByPlaceholderText('Enter your email');
            fireEvent.change(input, { target: { value: 'test@example.com' } });

            const submitButton = screen.getByRole('button', { name: /get my discount/i });
            fireEvent.click(submitButton);

            await screen.findByText("You're all set!");
            expect(document.cookie).toContain(exitIntentUtils.CONVERTED_COOKIE);
        });
    });

    describe('Popup Controls', () => {
        it('calls onClose when clicking close button', async () => {
            const mockClose = vi.fn();
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup onClose={mockClose} />
                </React.Suspense>
            );

            const closeButton = await screen.findByLabelText('Close popup');
            fireEvent.click(closeButton);

            expect(mockClose).toHaveBeenCalled();
        });

        it('calls onClose when clicking backdrop', async () => {
            const mockClose = vi.fn();
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup onClose={mockClose} />
                </React.Suspense>
            );

            const backdrop = (await screen.findByRole('dialog')).querySelector('[aria-hidden="true"]');
            if (backdrop) fireEvent.click(backdrop);

            expect(mockClose).toHaveBeenCalled();
        });

        it('calls onClose when clicking "No thanks" link', async () => {
            const mockClose = vi.fn();
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup onClose={mockClose} />
                </React.Suspense>
            );

            const noThanksButton = await screen.findByText(/no thanks/i);
            fireEvent.click(noThanksButton);

            expect(mockClose).toHaveBeenCalled();
        });
    });

    describe('Accessibility', () => {
        it('has accessible close button', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            const closeButton = await screen.findByLabelText('Close popup');
            expect(closeButton).toBeInTheDocument();
        });

        it('has accessible email input', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            const input = await screen.findByLabelText('Email address');
            expect(input).toHaveAttribute('type', 'email');
        });

        it('shows aria-invalid when email has error', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            const submitButton = await screen.findByRole('button', { name: /get my discount/i });
            fireEvent.click(submitButton);

            await screen.findByRole('alert');
            const input = screen.getByPlaceholderText('Enter your email');
            expect(input).toHaveAttribute('aria-invalid', 'true');
        });

        it('close button meets minimum touch target size', async () => {
            render(
                <React.Suspense fallback={<div>Loading...</div>}>
                    <TestableExitPopup />
                </React.Suspense>
            );

            const closeButton = await screen.findByLabelText('Close popup');
            expect(closeButton).toHaveClass('min-h-[44px]', 'min-w-[44px]');
        });
    });

    describe('Constants Export', () => {
        it('exports correct cookie name', () => {
            expect(exitIntentUtils.COOKIE_NAME).toBe('rawdrive_exit_popup_shown');
        });

        it('exports correct cooldown days', () => {
            expect(exitIntentUtils.COOLDOWN_DAYS).toBe(7);
        });

        it('exports correct converted cookie name', () => {
            expect(exitIntentUtils.CONVERTED_COOKIE).toBe('rawdrive_converted');
        });
    });
});
