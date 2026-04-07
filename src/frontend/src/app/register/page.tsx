'use client'

import React from 'react'

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex">
      {/* Left: Hero Image */}
      <div className="hidden lg:flex lg:w-1/2 relative items-end p-12"
        style={{ background: 'linear-gradient(135deg, #1a172d 0%, #0e0c1e 100%)' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-64 h-64 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #a3a6ff, transparent)' }} />
        </div>
        <div className="relative z-10">
          <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ background: 'rgba(163,166,255,0.2)', color: '#a3a6ff' }}>RawDrive</span>
          <h2 className="mt-4 text-3xl font-bold" style={{ color: '#e8e2fc', fontFamily: 'Manrope, sans-serif' }}>
            Show your best work to the world
          </h2>
          <p className="mt-2 text-sm" style={{ color: '#ada8c1' }}>
            Join thousands of Indian photographers managing their studios on RawDrive.
          </p>
        </div>
      </div>

      {/* Right: Registration Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12" style={{ background: '#fafafa' }}>
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#2d3435', fontFamily: 'Manrope, sans-serif' }}>Create your account</h1>
          <p className="text-sm mb-8" style={{ color: '#6b7280' }}>Start your 14-day free trial</p>

          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: '#374151', fontFamily: 'Inter, sans-serif' }}>Email</label>
              <input id="email" name="email" type="email" aria-label="Email" placeholder="you@studio.com"
                className="w-full px-4 py-3 rounded-xl text-sm min-h-[48px]"
                style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#1f2937' }} />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium mb-1" style={{ color: '#374151' }}>Phone (optional)</label>
              <div className="flex gap-2">
                <span className="px-3 py-3 rounded-xl text-sm" style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280' }}>+91</span>
                <input id="phone" name="phone" type="tel" placeholder="98765 43210"
                  className="flex-1 px-4 py-3 rounded-xl text-sm min-h-[48px]"
                  style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#1f2937' }} />
              </div>
            </div>

            <div className="flex items-start gap-2 pt-2">
              <input id="terms" type="checkbox" className="mt-1 rounded" style={{ accentColor: '#6366f1' }} />
              <label htmlFor="terms" className="text-sm" style={{ color: '#6b7280' }}>
                I agree to the <a href="/terms" className="underline" style={{ color: '#6366f1' }}>Terms of Service</a> and{' '}
                <a href="/privacy" className="underline" style={{ color: '#6366f1' }}>Privacy Policy</a>
              </label>
            </div>

            <button type="submit" className="w-full py-3 rounded-xl font-semibold text-sm min-h-[48px]"
              style={{ background: '#6366f1', color: '#ffffff' }}>
              Create Account
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs" style={{ color: '#9ca3af' }}>OR</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <button className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 min-h-[48px]"
            style={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#374151' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Sign up with Google
          </button>

          <p className="mt-6 text-center text-sm" style={{ color: '#6b7280' }}>
            Already have an account?{' '}
            <a href="/login" className="hover:underline" style={{ color: '#6366f1' }}>Sign in</a>
          </p>
        </div>
      </div>
    </main>
  )
}
