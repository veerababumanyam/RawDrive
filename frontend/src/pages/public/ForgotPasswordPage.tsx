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
                  <h1 className="text-2xl font-bold text-white mb-2">
                    Check your email
                  </h1>
                  <p className="text-slate-400 mb-6">
                    We've sent a password reset link to{' '}
                    <span className="text-white">{email}</span>
                  </p>
                  <p className="text-sm text-slate-500 mb-6">
                    Didn't receive the email? Check your spam folder or{' '}
                    <button
                      onClick={() => setIsSubmitted(false)}
                      className="text-primary-400 hover:text-primary-300"
                    >
                      try again
                    </button>
                  </p>
                  <Link
                    to="/signin"
                    className="
                      inline-flex items-center justify-center gap-2
                      px-6 py-3
                      bg-white/5 hover:bg-white/10
                      border border-white/10 hover:border-white/20
                      text-white font-medium
                      rounded-xl transition-all duration-200
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                      min-h-[48px]
                    "
                  >
                    <ArrowLeft size={18} />
                    Back to Sign In
                  </Link>
                </div>
              ) : (
                // Form State
                <>
                  <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-white mb-2">
                      Forgot your password?
                    </h1>
                    <p className="text-slate-400">
                      No worries, we'll send you reset instructions.
                    </p>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div
                      className="mb-4 p-3 rounded-lg bg-error-500/10 border border-error-500/20 text-error-400 text-sm"
                      role="alert"
                    >
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-white mb-2"
                      >
                        Email
                      </label>
                      <div className="relative">
                        <Mail
                          size={18}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          className="
                            w-full pl-10 pr-4 py-3
                            bg-white/5 border border-white/10
                            rounded-xl text-white placeholder:text-slate-500
                            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                            min-h-[48px]
                          "
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="
                        w-full py-3 px-4
                        flex items-center justify-center gap-2
                        bg-gradient-to-r from-primary-600 to-primary-700
                        hover:from-primary-500 hover:to-primary-600
                        text-white font-semibold
                        rounded-xl shadow-lg shadow-primary-500/25
                        transition-all duration-200
                        disabled:opacity-50 disabled:cursor-not-allowed
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
                        min-h-[48px]
                      "
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
                    className="
                      mt-6 flex items-center justify-center gap-2
                      text-slate-400 hover:text-white
                      transition-colors
                    "
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
