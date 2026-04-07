'use client'

import React from 'react'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: '#0e0c1e',
        backgroundImage: 'radial-gradient(ellipse at 20% 80%, rgba(26,23,45,0.8), transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.15), transparent 50%)',
      }}>
      <div className="w-full max-w-md">
        {/* Glass Card */}
        <div className="p-8 rounded-2xl border"
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderColor: 'rgba(255,255,255,0.1)',
          }}>
          {/* Logo Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(163,166,255,0.15)', border: '1px solid rgba(163,166,255,0.3)' }}>
              <svg className="w-7 h-7" style={{ color: '#a3a6ff' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center mb-1" style={{ fontFamily: 'Manrope, sans-serif', color: '#e8e2fc' }}>Welcome back</h1>
          <p className="text-sm text-center mb-8" style={{ color: '#ada8c1' }}>Sign in to access your studio</p>

          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: '#ada8c1', fontFamily: 'Inter, sans-serif' }}>EMAIL ADDRESS</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#77728a' }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                </span>
                <input id="email" name="email" type="email" aria-label="Email" placeholder="you@studio.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm min-h-[48px]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8e2fc', fontFamily: 'Inter, sans-serif' }} />
              </div>
            </div>

            <button type="submit" className="w-full py-3 rounded-xl font-semibold text-sm min-h-[48px] transition-all"
              style={{ background: '#a3a6ff', color: '#0e0c1e', fontFamily: 'Manrope, sans-serif', boxShadow: '0 0 20px rgba(163,166,255,0.3)' }}>
              Send OTP
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
            <span className="text-xs" style={{ color: '#77728a' }}>OR</span>
            <div className="flex-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
          </div>

          <button className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-3 min-h-[48px] transition-all hover:opacity-90"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8e2fc' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Sign in with Google
          </button>

          <p className="mt-4 text-center text-sm" style={{ color: '#ada8c1' }}>
            <a href="#" className="hover:underline" style={{ color: '#a3a6ff' }}>Use Magic Link</a>
          </p>

          <p className="mt-6 text-center text-sm" style={{ color: '#77728a' }}>
            Don&apos;t have an account?{' '}
            <a href="/register" className="hover:underline" style={{ color: '#a3a6ff' }}>Sign up</a>
          </p>
        </div>
      </div>
    </main>
  )
}
