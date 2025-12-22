import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, ArrowRight, Mail, CheckCircle } from 'lucide-react';
import { AppButton } from '../ui/AppButton';

/* =============================================================================
   ExitIntentPopup Component

   Detects exit intent and displays offer with email capture.
   Features:
   - Exit intent detection (cursor moving to top of viewport)
   - 7-day cooldown with cookie
   - Email capture with validation
   - Success/error states
   ============================================================================= */

const COOKIE_NAME = 'rawdrive_exit_popup_shown';
const COOLDOWN_DAYS = 7;
const CONVERTED_COOKIE = 'rawdrive_converted';

interface ExitIntentPopupProps {
    /** Custom class name */
    className?: string;
    /** Offer headline */
    headline?: string;
    /** Offer description */
    description?: string;
    /** Discount code to display */
    discountCode?: string;
    /** Callback when email is submitted */
    onEmailSubmit?: (email: string) => Promise<void>;
    /** Disable the popup (for testing) */
    disabled?: boolean;
}

// Cookie utilities
const setCookie = (name: string, value: string, days: number) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

const getCookie = (name: string): string | null => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
};

// Email validation
const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

export const ExitIntentPopup: React.FC<ExitIntentPopupProps> = ({
    className = '',
    headline = "Wait! Don't miss out",
    description = 'Get 20% off your first year when you sign up today. Plus, get our exclusive photography workflow guide free!',
    discountCode = 'WELCOME20',
    onEmailSubmit,
    disabled = false,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check if popup should be shown
    const shouldShowPopup = useCallback((): boolean => {
        if (disabled) return false;
        if (typeof document === 'undefined') return false;

        // Don't show if user already converted
        if (getCookie(CONVERTED_COOKIE)) return false;

        // Don't show if within cooldown period
        if (getCookie(COOKIE_NAME)) return false;

        return true;
    }, [disabled]);

    // Handle exit intent detection
    useEffect(() => {
        if (typeof window === 'undefined' || disabled) return;

        const handleMouseLeave = (e: MouseEvent) => {
            // Only trigger when cursor moves to top of viewport (likely heading to close tab/back)
            if (e.clientY <= 5 && shouldShowPopup()) {
                setIsVisible(true);
                setCookie(COOKIE_NAME, 'true', COOLDOWN_DAYS);
            }
        };

        // Add listener after a short delay to avoid triggering immediately
        const timeout = setTimeout(() => {
            document.addEventListener('mouseleave', handleMouseLeave);
        }, 3000);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [disabled, shouldShowPopup]);

    // Handle close
    const handleClose = () => {
        setIsVisible(false);
    };

    // Handle email submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email.trim()) {
            setError('Please enter your email address');
            return;
        }

        if (!isValidEmail(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setIsSubmitting(true);

        try {
            if (onEmailSubmit) {
                await onEmailSubmit(email);
            }
            // Mark as converted
            setCookie(CONVERTED_COOKIE, 'true', 365);
            setIsSuccess(true);
        } catch (err) {
            setError('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle keyboard escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isVisible) {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isVisible]);

    return (
        <AnimatePresence>
            {isVisible && (
                <div
                    className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${className}`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="exit-popup-title"
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={handleClose}
                        aria-hidden="true"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Close button */}
                        <button
                            onClick={handleClose}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-neutral-100 transition-colors z-10 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label="Close popup"
                        >
                            <X className="w-5 h-5 text-neutral-500" />
                        </button>

                        {/* Content */}
                        <div className="p-8 pt-12">
                            {isSuccess ? (
                                /* Success State */
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-center"
                                >
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                                        <CheckCircle className="w-8 h-8 text-green-600" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-neutral-900 mb-2">
                                        You're all set!
                                    </h3>
                                    <p className="text-neutral-600 mb-4">
                                        Check your inbox for your discount code and free guide.
                                    </p>
                                    <div className="bg-neutral-100 rounded-lg p-4 mb-6">
                                        <div className="text-sm text-neutral-500 mb-1">Your discount code</div>
                                        <div className="text-2xl font-bold text-primary-600 font-mono">
                                            {discountCode}
                                        </div>
                                    </div>
                                    <AppButton
                                        variant="primary"
                                        onClick={handleClose}
                                        className="w-full"
                                    >
                                        Continue to RawDrive
                                    </AppButton>
                                </motion.div>
                            ) : (
                                /* Form State */
                                <>
                                    {/* Gift Icon */}
                                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/30">
                                        <Gift className="w-8 h-8 text-white" />
                                    </div>

                                    {/* Headline */}
                                    <h2
                                        id="exit-popup-title"
                                        className="text-2xl font-bold text-neutral-900 text-center mb-3"
                                    >
                                        {headline}
                                    </h2>

                                    {/* Description */}
                                    <p className="text-neutral-600 text-center mb-6">
                                        {description}
                                    </p>

                                    {/* Email Form */}
                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        <div>
                                            <label htmlFor="exit-email" className="sr-only">
                                                Email address
                                            </label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                                                <input
                                                    id="exit-email"
                                                    type="email"
                                                    placeholder="Enter your email"
                                                    value={email}
                                                    onChange={(e) => {
                                                        setEmail(e.target.value);
                                                        setError(null);
                                                    }}
                                                    className={`
                                                        w-full pl-10 pr-4 py-3 rounded-lg border
                                                        ${error ? 'border-red-500' : 'border-neutral-300'}
                                                        focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                                                        outline-none transition-colors
                                                    `}
                                                    aria-invalid={!!error}
                                                    aria-describedby={error ? 'email-error' : undefined}
                                                />
                                            </div>
                                            {error && (
                                                <p
                                                    id="email-error"
                                                    className="mt-1 text-sm text-red-600"
                                                    role="alert"
                                                >
                                                    {error}
                                                </p>
                                            )}
                                        </div>

                                        <AppButton
                                            type="submit"
                                            variant="primary"
                                            className="w-full"
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting ? (
                                                'Sending...'
                                            ) : (
                                                <>
                                                    Get My Discount <ArrowRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </AppButton>
                                    </form>

                                    {/* No thanks link */}
                                    <button
                                        onClick={handleClose}
                                        className="w-full mt-4 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                                    >
                                        No thanks, I'll pay full price
                                    </button>
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// Export utility for testing
export const exitIntentUtils = {
    setCookie,
    getCookie,
    isValidEmail,
    COOKIE_NAME,
    COOLDOWN_DAYS,
    CONVERTED_COOKIE,
};

export default ExitIntentPopup;
