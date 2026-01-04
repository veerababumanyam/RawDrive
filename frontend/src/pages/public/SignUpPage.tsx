import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Check } from 'lucide-react';
import { SEOHead } from '../../components/landing';
import { useAuth } from '../../contexts';
import useTheme from '../../hooks/useTheme';

/* =============================================================================
   SignUpPage Component

   Clean, centered, mobile-first registration page.
   Uses centralized auth glass utilities from index.css (Section 18.12.3)
   Requirements: 3.1, 22.1
   ============================================================================= */

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'Uppercase', test: (p) => /[A-Z]/.test(p) },
  { label: 'Lowercase', test: (p) => /[a-z]/.test(p) },
  { label: 'Number', test: (p) => /\d/.test(p) },
];

const SignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const { signup, googleOAuthUrl } = useAuth();
  const { resolvedTheme } = useTheme();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPasswordValid = passwordRequirements.every((req) => req.test(password));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptTerms) {
      setError('Please accept the Terms of Service and Privacy Policy');
      return;
    }

    if (!isPasswordValid) {
      setError('Please meet all password requirements');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signup({
        email,
        password,
        displayName: name,
      });

      if (result.success) {
        navigate('/workspace');
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    // Redirect to Google OAuth
    window.location.href = googleOAuthUrl(window.location.origin + '/workspace');
  };

  return (
    <>
      <SEOHead
        title="Sign Up"
        description="Create your RawDrive account and start delivering stunning photo galleries to your clients."
        canonicalUrl="/signup"
        noIndex
      />

      <div
        data-theme={resolvedTheme}
        className="min-h-screen bg-hero-gradient flex items-center justify-center px-4 py-8"
      >
        {/* Background subtle pattern */}
        <div className="absolute inset-0 hero-pattern-grid opacity-[0.02]" aria-hidden="true" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative w-full max-w-sm"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center justify-center gap-2 mb-8">
            <img
              src="/android-chrome-192x192.png"
              alt="RawDrive"
              className="w-10 h-10 rounded-xl"
            />
            <span className="font-bold text-xl text-white">
              Raw<span className="landing-text-gradient">Drive</span>
            </span>
          </Link>

          {/* Card - Using centralized auth-glass-card utility */}
          <div className="auth-glass-card p-6 sm:p-8">
            <div className="text-center mb-6">
              <h1 className="auth-heading">Create account</h1>
              <p className="auth-subheading">Start your 14-day free trial</p>
            </div>

            {/* Google Button - Using centralized auth-btn-google utility */}
            <button onClick={handleGoogleSignUp} className="auth-btn-google">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            {/* Divider - Using centralized auth-divider utilities */}
            <div className="auth-divider">
              <div className="flex justify-center">
                <span className="auth-divider-text">or</span>
              </div>
            </div>

            {/* Error - Using centralized auth-error utility */}
            {error && (
              <div className="auth-error mb-4" role="alert">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="auth-label">
                  Full Name
                </label>
                <div className="relative">
                  <User size={18} className="auth-input-icon" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    required
                    autoComplete="name"
                    className="auth-input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="auth-label">
                  Email
                </label>
                <div className="relative">
                  <Mail size={18} className="auth-input-icon" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="auth-input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="auth-label">
                  Password
                </label>
                <div className="relative">
                  <Lock size={18} className="auth-input-icon" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create password"
                    required
                    autoComplete="new-password"
                    className="auth-input pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="auth-input-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Password Requirements - Using centralized auth-requirement utilities */}
                {password.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {passwordRequirements.map((req, i) => {
                      const met = req.test(password);
                      return (
                        <span
                          key={i}
                          className={`auth-requirement ${
                            met ? 'auth-requirement-met' : 'auth-requirement-pending'
                          }`}
                        >
                          <Check size={10} className={met ? 'opacity-100' : 'opacity-30'} />
                          {req.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3">
                <input
                  id="terms"
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="auth-checkbox"
                />
                <label htmlFor="terms" className="text-sm auth-text-muted">
                  I agree to the{' '}
                  <Link to="/terms" className="auth-link">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="auth-link">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="auth-btn-primary"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Create Account
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center auth-text-muted text-sm">
              Already have an account?{' '}
              <Link to="/signin" className="auth-link">
                Sign in
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default SignUpPage;
