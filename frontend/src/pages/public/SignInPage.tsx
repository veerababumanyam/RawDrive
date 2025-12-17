import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import { SEOHead } from '../../components/landing';
import { useAuth } from '../../contexts';

/* =============================================================================
   SignInPage Component

   Clean, centered, mobile-first authentication page.
   Requirements: 3.2, 4.1
   ============================================================================= */

const SignInPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/workspace';
  const { login, googleOAuthUrl } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await login({ email, password });
      if (result.success) {
        navigate(redirectTo);
      } else {
        setError(result.error || 'Invalid email or password. Please try again.');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    // Redirect to Google OAuth
    window.location.href = googleOAuthUrl(window.location.origin + redirectTo);
  };

  return (
    <>
      <SEOHead
        title="Sign In"
        description="Sign in to your RawDrive account to manage your photography galleries and clients."
        canonicalUrl="/signin"
        noIndex
      />

      <div className="min-h-screen bg-hero-gradient flex items-center justify-center px-4 py-8">
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

          {/* Card */}
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
              <p className="text-slate-400 text-sm">Sign in to your account</p>
            </div>

            {/* Google Button */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full py-3 px-4 bg-white text-gray-900 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-3 min-h-[48px]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 text-xs text-slate-500 bg-[#0a1628]">or</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[48px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    autoComplete="current-password"
                    className="w-full pl-10 pr-12 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[48px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-slate-400">Remember me</span>
                </label>
                <Link to="/forgot-password" className="text-primary-400 hover:text-primary-300">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-slate-400 text-sm">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary-400 hover:text-primary-300 font-medium">
                Sign up
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </>
  );
};

export default SignInPage;
