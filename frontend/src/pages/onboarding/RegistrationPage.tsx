/**
 * Registration Page
 * User registration step in the onboarding flow
 * Feature: Automated Onboarding System
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check, X, Mail, Lock, User, Building, Phone } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';

// ============================================================================
// Password Strength Indicator
// ============================================================================

interface PasswordStrength {
  score: number;
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

function checkPasswordStrength(password: string): PasswordStrength {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };

  const score = Object.values(requirements).filter(Boolean).length;

  return { score, requirements };
}

const PasswordStrengthIndicator: React.FC<{ password: string }> = ({ password }) => {
  const { score, requirements } = checkPasswordStrength(password);

  const getStrengthLabel = () => {
    if (score <= 2) return { text: 'Weak', color: 'text-red-500' };
    if (score <= 3) return { text: 'Fair', color: 'text-yellow-500' };
    if (score <= 4) return { text: 'Good', color: 'text-green-500' };
    return { text: 'Strong', color: 'text-green-600' };
  };

  const strength = getStrengthLabel();

  if (!password) return null;

  return (
    <div className="mt-2">
      {/* Progress bar */}
      <div className="flex gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={`
              h-1 flex-1 rounded-full transition-all
              ${
                score >= level
                  ? score <= 2
                    ? 'bg-red-500'
                    : score <= 3
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                  : 'bg-surface-hover'
              }
            `}
          />
        ))}
      </div>

      {/* Strength label */}
      <p className={`text-xs font-medium ${strength.color}`}>
        Password strength: {strength.text}
      </p>

      {/* Requirements checklist */}
      <ul className="mt-2 space-y-1">
        {[
          { key: 'length', text: 'At least 8 characters' },
          { key: 'uppercase', text: 'One uppercase letter' },
          { key: 'lowercase', text: 'One lowercase letter' },
          { key: 'number', text: 'One number' },
          { key: 'special', text: 'One special character' },
        ].map(({ key, text }) => (
          <li
            key={key}
            className={`flex items-center gap-2 text-xs ${
              requirements[key as keyof typeof requirements]
                ? 'text-green-600'
                : 'text-text-tertiary'
            }`}
          >
            {requirements[key as keyof typeof requirements] ? (
              <Check className="w-3 h-3" />
            ) : (
              <X className="w-3 h-3" />
            )}
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

export const RegistrationPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, register, isLoading, error } = useOnboarding();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    business_name: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Redirect if no session or plan not selected
  useEffect(() => {
    if (!session || !session.plan_id) {
      navigate('/onboarding/plans');
    }
  }, [session, navigate]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Email validation
    if (!formData.email) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Password validation
    const { score } = checkPasswordStrength(formData.password);
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (score < 3) {
      errors.password = 'Please choose a stronger password';
    }

    // Name validation
    if (!formData.full_name.trim()) {
      errors.full_name = 'Full name is required';
    }

    // Terms acceptance
    if (!acceptTerms) {
      errors.terms = 'You must accept the Terms of Service';
    }
    if (!acceptPrivacy) {
      errors.privacy = 'You must accept the Privacy Policy';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      await register({
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        full_name: formData.full_name.trim(),
        business_name: formData.business_name.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        accept_terms: acceptTerms,
        accept_privacy: acceptPrivacy,
        marketing_consent: marketingConsent,
      });
      navigate('/onboarding/verify-email');
    } catch {
      // Error handled by context
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Create your account
        </h1>
        <p className="text-text-secondary">
          Set up your RawDrive account to get started
        </p>
      </div>

      {/* Registration form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1.5">
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={`
                w-full pl-11 pr-4 py-3 rounded-xl border bg-surface text-text-primary
                placeholder:text-text-tertiary transition-colors
                ${validationErrors.email ? 'border-red-500' : 'border-border focus:border-primary'}
              `}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          {validationErrors.email && (
            <p className="mt-1 text-xs text-red-500">{validationErrors.email}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className={`
                w-full pl-11 pr-12 py-3 rounded-xl border bg-surface text-text-primary
                placeholder:text-text-tertiary transition-colors
                ${validationErrors.password ? 'border-red-500' : 'border-border focus:border-primary'}
              `}
              placeholder="Create a strong password"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {validationErrors.password && (
            <p className="mt-1 text-xs text-red-500">{validationErrors.password}</p>
          )}
          <PasswordStrengthIndicator password={formData.password} />
        </div>

        {/* Full name */}
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-text-primary mb-1.5">
            Full name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              id="full_name"
              type="text"
              value={formData.full_name}
              onChange={(e) => handleInputChange('full_name', e.target.value)}
              className={`
                w-full pl-11 pr-4 py-3 rounded-xl border bg-surface text-text-primary
                placeholder:text-text-tertiary transition-colors
                ${validationErrors.full_name ? 'border-red-500' : 'border-border focus:border-primary'}
              `}
              placeholder="John Doe"
              autoComplete="name"
            />
          </div>
          {validationErrors.full_name && (
            <p className="mt-1 text-xs text-red-500">{validationErrors.full_name}</p>
          )}
        </div>

        {/* Business name (optional) */}
        <div>
          <label htmlFor="business_name" className="block text-sm font-medium text-text-primary mb-1.5">
            Business name <span className="text-text-tertiary">(optional)</span>
          </label>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              id="business_name"
              type="text"
              value={formData.business_name}
              onChange={(e) => handleInputChange('business_name', e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:border-primary transition-colors"
              placeholder="Your Photography Studio"
              autoComplete="organization"
            />
          </div>
        </div>

        {/* Phone (optional) */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-text-primary mb-1.5">
            Phone number <span className="text-text-tertiary">(optional)</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:border-primary transition-colors"
              placeholder="+91 98765 43210"
              autoComplete="tel"
            />
          </div>
        </div>

        {/* Consent checkboxes */}
        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-text-secondary">
              I agree to the{' '}
              <a href="/legal/terms" className="text-primary hover:underline" target="_blank">
                Terms of Service
              </a>
            </span>
          </label>
          {validationErrors.terms && (
            <p className="text-xs text-red-500 ml-7">{validationErrors.terms}</p>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptPrivacy}
              onChange={(e) => setAcceptPrivacy(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-text-secondary">
              I agree to the{' '}
              <a href="/legal/privacy" className="text-primary hover:underline" target="_blank">
                Privacy Policy
              </a>
            </span>
          </label>
          {validationErrors.privacy && (
            <p className="text-xs text-red-500 ml-7">{validationErrors.privacy}</p>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-text-secondary">
              Send me product updates and photography tips
            </span>
          </label>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading}
          className={`
            w-full py-3 rounded-xl font-semibold text-white
            transition-all duration-200
            ${
              isLoading
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-primary hover:bg-primary-hover shadow-lg hover:shadow-xl'
            }
          `}
        >
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-background text-text-tertiary">or continue with</span>
          </div>
        </div>

        {/* Google sign-in */}
        <button
          type="button"
          className="w-full py-3 px-4 rounded-xl border border-border bg-surface hover:bg-surface-hover text-text-primary font-medium transition-colors flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>
      </form>

      {/* Back link */}
      <p className="text-center mt-6 text-sm text-text-secondary">
        <button
          onClick={() => navigate('/onboarding/plans')}
          className="text-primary hover:underline"
        >
          &larr; Back to plan selection
        </button>
      </p>
    </div>
  );
};

export default RegistrationPage;
