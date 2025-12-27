import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { LandingLayout, SEOHead } from '../../components/landing';
import { GlassCard } from '../../components/landing/ui/GlassCard';
import { fadeInUp } from '../../components/landing/animations/presets';

/* =============================================================================
   ForgotPasswordPage Component

   Password reset request page.
   Uses centralized auth utilities from index.css (Section 18.12.3)
   ============================================================================= */

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // TODO: Replace with actual password reset API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsSubmitted(true);
    } catch (err) {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <SEOHead
        title="Forgot Password"
        description="Reset your RawDrive account password."
        canonicalUrl="/forgot-password"
        noIndex
      />

      <LandingLayout showOrbs={false}>
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            className="w-full max-w-md"
          >
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center justify-center gap-2 text-white mb-8"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                <span className="text-white font-bold text-lg">R</span>
              </div>
              <span className="font-bold text-2xl tracking-tight">
                Raw<span className="text-gradient">Drive</span>
              </span>
            </Link>

            <GlassCard variant="lg" padding="xl">
              {isSubmitted ? (
                // Success State
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle size={32} className="text-green-400" />
                  </div>
                  <h1 className="auth-heading mb-2">Check your email</h1>
                  <p className="auth-text-muted mb-6">
                    We've sent a password reset link to{' '}
                    <span className="text-white">{email}</span>
                  </p>
                  <p className="text-sm auth-text-muted mb-6">
                    Didn't receive the email? Check your spam folder or{' '}
                    <button
                      onClick={() => setIsSubmitted(false)}
                      className="auth-link"
                    >
                      try again
                    </button>
                  </p>
                  <Link
                    to="/signin"
                    className="auth-btn-google inline-flex w-auto px-6"
                  >
                    <ArrowLeft size={18} />
                    Back to Sign In
                  </Link>
                </div>
              ) : (
                // Form State
                <>
                  <div className="text-center mb-8">
                    <h1 className="auth-heading mb-2">Forgot your password?</h1>
                    <p className="auth-subheading">
                      No worries, we'll send you reset instructions.
                    </p>
                  </div>

                  {/* Error Message - Using centralized auth-error utility */}
                  {error && (
                    <div className="auth-error mb-4" role="alert">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
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
                          className="auth-input"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="auth-btn-primary"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Send Reset Link'
                      )}
                    </button>
                  </form>

                  <Link
                    to="/signin"
                    className="mt-6 flex items-center justify-center gap-2 auth-text-muted hover:text-white transition-colors"
                  >
                    <ArrowLeft size={16} />
                    Back to Sign In
                  </Link>
                </>
              )}
            </GlassCard>
          </motion.div>
        </div>
      </LandingLayout>
    </>
  );
};

export default ForgotPasswordPage;
