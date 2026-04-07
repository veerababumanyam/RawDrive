'use client'

import React from 'react'
import Image from 'next/image'

const glass = { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' } as const

const stateGroups = [
  { label: 'North', states: ['Delhi', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Punjab', 'Rajasthan', 'Uttar Pradesh', 'Uttarakhand'] },
  { label: 'South', states: ['Andhra Pradesh', 'Karnataka', 'Kerala', 'Tamil Nadu', 'Telangana'] },
  { label: 'West', states: ['Goa', 'Gujarat', 'Maharashtra'] },
  { label: 'East', states: ['Bihar', 'Jharkhand', 'Odisha', 'West Bengal'] },
  { label: 'Central', states: ['Chhattisgarh', 'Madhya Pradesh'] },
  { label: 'Northeast', states: ['Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'] },
  { label: 'Islands & UTs', states: ['Andaman & Nicobar', 'Chandigarh', 'Dadra & Nagar Haveli', 'Lakshadweep', 'Ladakh', 'Puducherry'] },
]

export default function StateSelectionPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0e0c1e', color: '#e8e2fc', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 shadow-xl" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-3">
          <Image src="/assets/brand/rawdrive-icon.png" alt="RawDrive" width={32} height={32} className="rounded-lg" />
          <span className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>RawDrive India</span>
        </div>
        <button className="text-sm font-medium px-3 py-2 rounded-xl transition-colors" style={{ color: 'rgba(255,255,255,0.6)' }}>Support</button>
      </header>

      <main className="pt-24 pb-12 px-6 min-h-screen flex items-center justify-center">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Content Side */}
          <div className="lg:col-span-6 flex flex-col space-y-8">
            {/* Progress */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#a3a6ff' }}>Step 1 of 4</span>
                <span className="text-xs" style={{ color: '#ada8c1' }}>Business Region Setup</span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#26223d' }}>
                <div className="h-full w-1/4 rounded-full" style={{ background: 'linear-gradient(to right, #a3a6ff, #8455ef)' }}></div>
              </div>
            </div>

            {/* Heading */}
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Select your state</h1>
              <p className="text-lg max-w-md" style={{ color: '#ada8c1' }}>This determines your business region and dealer network within the Indian market.</p>
            </div>

            {/* Dropdown */}
            <div className="rounded-2xl p-6 space-y-4" style={glass}>
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#a3a6ff' }}>State or Union Territory</label>
              <div className="relative">
                <select className="w-full rounded-xl py-4 pl-4 pr-10 appearance-none text-white focus:ring-2 focus:outline-none transition-all cursor-pointer min-h-[48px]" style={{ background: '#141125', border: '1px solid rgba(255,255,255,0.1)', focusRingColor: 'rgba(163,166,255,0.5)' }}>
                  <option disabled value="" selected>Choose from list...</option>
                  {stateGroups.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.states.map(s => <option key={s} value={s}>{s}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none" style={{ color: '#ada8c1' }}>
                  <span>&#x25BC;</span>
                </div>
              </div>
              <p className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(173,168,193,0.6)' }}>
                &#x2139; You can modify regional settings after onboarding in the Admin Panel.
              </p>
            </div>

            {/* Actions */}
            <div className="pt-4 flex flex-col sm:flex-row gap-4">
              <a href="/onboarding/profile" className="font-bold px-8 py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 min-h-[48px]" style={{ background: 'linear-gradient(to right, #a3a6ff, #8455ef)', color: '#000', boxShadow: '0 0 20px rgba(163,166,255,0.2)' }}>
                Continue &#x2192;
              </a>
              <button className="px-8 py-4 rounded-xl font-medium transition-all min-h-[48px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Save for later
              </button>
            </div>
          </div>

          {/* Illustration Side - India Map */}
          <div className="lg:col-span-6 relative hidden lg:block">
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(163,166,255,0.2)' }}></div>
            <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(172,138,255,0.1)' }}></div>
            <div className="relative rounded-[2.5rem] p-8 aspect-square flex items-center justify-center overflow-hidden shadow-2xl" style={{ ...glass, borderColor: 'rgba(255,255,255,0.2)' }}>
              <div className="relative z-10 w-full h-full p-4 flex flex-col">
                <div className="flex justify-between items-start mb-8">
                  <div className="px-4 py-2 rounded-full flex items-center gap-2" style={{ ...glass, borderColor: 'rgba(255,255,255,0.2)' }}>
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#a3a6ff' }}></span>
                    <span className="text-xs font-semibold text-white tracking-wide">Live Infrastructure Status</span>
                  </div>
                </div>
                <div className="flex-grow flex items-center justify-center">
                  <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuAFCjnSwt5OqoyoQNJCpAli9c8YKElqg2fNF1dhjXmdCObIDVbUYj-iNuJq6xyJM-oM11qcSUwxcHEYqkDKrvrczTuE0gP1SDEIx1WYfdzDOqNRtRQ5HGFqyxCfrbxQX8FFvJ8jX62cJO5kOUBh7yBgb2lcjn4a36_T7kW2NIzHjS4bTF24pNsbcOoY9eGnuiTWx1Vo3KO9GZdN-KzfV1lENAGQPX9ry8JFeAtkGI840bNRAh90o1IVe-N0pH3xbQiSwDnBretmvHc" alt="India Map" fill className="object-contain" style={{ opacity: 0.9, filter: 'brightness(1.1) contrast(1.25)' }} unoptimized />
                </div>
                <div className="mt-auto grid grid-cols-3 gap-4">
                  {[
                    { value: '28', label: 'States', color: '#a3a6ff' },
                    { value: '8', label: 'UTs', color: '#ac8aff' },
                    { value: '500+', label: 'Nodes', color: '#ff6daf' },
                  ].map(s => (
                    <div key={s.label} className="p-3 rounded-xl text-center" style={glass}>
                      <div className="font-bold text-lg leading-tight" style={{ color: s.color }}>{s.value}</div>
                      <div className="text-[10px] uppercase tracking-tighter" style={{ color: 'rgba(255,255,255,0.5)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full py-8 flex flex-col md:flex-row justify-between items-center px-8 gap-4 mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>© 2026 RawDrive India.</div>
        <div className="flex gap-6">
          <a className="text-xs transition-colors hover:text-indigo-400" href="/privacy" style={{ color: 'rgba(255,255,255,0.4)' }}>Privacy Policy</a>
          <a className="text-xs transition-colors hover:text-indigo-400" href="/terms" style={{ color: 'rgba(255,255,255,0.4)' }}>Terms of Service</a>
        </div>
      </footer>
    </div>
  )
}
