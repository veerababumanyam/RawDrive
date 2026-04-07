import React from 'react'
import Image from 'next/image'

export default function LandingPage() {
  return (
    <>
      {/* Stitch-generated Landing Page — RawDrive India Photography SaaS */}
      {/* Design: Liquid Glass dark theme | Fonts: Manrope headlines, Inter body */}

      {/* 1. STICKY NAVBAR */}
      <nav className="fixed top-0 w-full z-50" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <a href="/" className="flex items-center gap-2">
            <Image src="/assets/brand/rawdrive-icon.png" alt="RawDrive" width={32} height={32} className="rounded-lg" />
            <span className="text-2xl font-black tracking-tighter text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>RawDrive</span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <a className="text-gray-400 hover:text-white transition-colors" href="/features">Features</a>
            <a className="text-gray-400 hover:text-white transition-colors" href="/pricing">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="/register" className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 min-h-[44px] inline-flex items-center" style={{ background: '#a3a6ff', color: '#0f00a4', boxShadow: '0 0 20px rgba(163,166,255,0.3)' }}>
              Get Started
            </a>
          </div>
        </div>
      </nav>

      <main className="pt-20" style={{ background: '#0e0c1e', color: '#e8e2fc', fontFamily: 'Inter, sans-serif' }}>

        {/* 2. HERO SECTION */}
        <section className="min-h-screen flex items-center px-6">
          <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: 'rgba(163,166,255,0.1)', border: '1px solid rgba(163,166,255,0.2)', color: '#a3a6ff' }}>
                India&apos;s #1 Photography SaaS
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold text-white leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Professional Photography, <span style={{ color: '#a3a6ff' }}>Simplified</span>
              </h1>
              <p className="text-lg max-w-lg leading-relaxed" style={{ color: '#ada8c1' }}>
                The all-in-one platform for Indian photographers. Manage galleries, deliver to clients, handle GST invoices, and grow your studio with cutting-edge AI.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="/register" className="px-8 py-4 rounded-xl font-bold text-lg transition-all active:scale-95 min-h-[48px] inline-flex items-center" style={{ background: '#a3a6ff', color: '#0f00a4', boxShadow: '0 0 20px rgba(163,166,255,0.3)' }}>
                  Start Free Trial
                </a>
                <a href="/features" className="px-8 py-4 rounded-xl font-bold text-lg text-white transition-all min-h-[48px] inline-flex items-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  Watch Demo
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-6 pt-4 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span style={{ color: '#a3a6ff' }}>&#x1F465;</span> 5,000+ Photographers
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#a3a6ff' }}>&#x2764;</span> Made in India
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#a3a6ff' }}>&#x2713;</span> DPDPA Compliant
                </div>
              </div>
            </div>
            <div className="relative hidden md:block">
              <div className="absolute -inset-4 rounded-full blur-3xl" style={{ background: 'rgba(163,166,255,0.2)' }}></div>
              <div className="rounded-2xl overflow-hidden shadow-2xl relative" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuDB9mQtzsQntF6IssWlOlcKYOZ-_zY0ZBq9AaidjZXttyGH5tpujmSsYXTQJuSX5Jxmz6SKu--PQVckHRLa0bRX4rFQu-6jDZhohX9970IsK4eWXkqKabALdSo6yWQa07334qVCuO0LBbCtMTYQ2gf486_dskCSo65jUnKg0NiNDv0Q2nmPI7PZyf8UJMwTMZa0OxbiNFlaDQULV81ydHyLtp0f0kQpgn1OKiJVMrPmSLtB38g4P3Tv-SC1uTuw7gzeFiEQj8HCMqM" alt="RawDrive Dashboard Preview" width={600} height={400} className="w-full h-auto opacity-90" unoptimized />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0c1e] via-transparent to-transparent opacity-40"></div>
              </div>
              <div className="absolute -bottom-6 -left-6 p-4 rounded-xl flex items-center gap-4 shadow-2xl" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(163,166,255,0.2)' }}>
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white" style={{ background: '#ac8aff' }}>&#x1F389;</div>
                <div>
                  <p className="text-xs text-gray-400">New Client Booking</p>
                  <p className="font-bold text-white">Premium Wedding Set</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. FEATURE CARDS */}
        <section className="py-24 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Everything your studio needs</h2>
            <p style={{ color: '#ada8c1' }} className="max-w-2xl mx-auto">Built specifically for the workflow of modern Indian photography studios.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: '📸', title: 'Gallery Management', desc: 'High-speed uploads with automated folder structures and client-ready previews.' },
              { icon: '✅', title: 'Client Proofing', desc: 'Let clients select their favorites with a single tap. Mobile-optimized for easy viewing.' },
              { icon: '🧾', title: 'GST Invoicing', desc: 'Automated GST compliance for India. Generate professional tax invoices in seconds.' },
              { icon: '✨', title: 'AI Smart Culling', desc: 'Save hours of work. Our AI automatically detects blurry shots and duplicates for you.' },
              { icon: '📺', title: 'Live Streaming', desc: "Stream wedding highlights directly to guests who couldn't make it, integrated with your gallery." },
              { icon: '📅', title: 'Booking Calendar', desc: 'Manage your dates and advance payments with an intuitive studio-wide calendar.' },
            ].map((f) => (
              <div key={f.title} className="p-8 rounded-2xl transition-all group" role="article" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 text-2xl" style={{ background: 'rgba(163,166,255,0.1)' }}>{f.icon}</div>
                <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
                <p style={{ color: '#ada8c1' }} className="leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. SOCIAL PROOF */}
        <section className="py-20 overflow-hidden" style={{ background: '#141125' }}>
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Trusted by Indian Photographers</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-center">
              <div className="lg:col-span-1 space-y-10">
                <div className="space-y-2"><p className="text-4xl font-black" style={{ color: '#a3a6ff' }}>5,000+</p><p className="text-gray-400 uppercase tracking-widest text-xs font-bold">Active Studios</p></div>
                <div className="space-y-2"><p className="text-4xl font-black" style={{ color: '#ac8aff' }}>1M+</p><p className="text-gray-400 uppercase tracking-widest text-xs font-bold">Photos Delivered</p></div>
                <div className="space-y-2"><p className="text-4xl font-black" style={{ color: '#ff6daf' }}>₹50Cr+</p><p className="text-gray-400 uppercase tracking-widest text-xs font-bold">Revenue Processed</p></div>
              </div>
              <div className="lg:col-span-2">
                <div className="p-10 rounded-3xl relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex items-center gap-6 mb-8">
                    <Image src="https://lh3.googleusercontent.com/aida-public/AB6AXuApJmroFN6B6kiA5_KqD8iKCyuvVYTUcTzOamaSIn_ttHhKQT4KvA2_ofYXWoDVOd0u4GM3Jmc8FOHL8tiUndfnzdCAXc6GJNnFw5i0wffqC5oKRolmHNKXdPCUm-RxxD__WU6qNOsUN133KxKuFa5dMgvFO1qzHgGGB1bttljD8h536z3Lbbno7w8qLhi4r0mF_jNgG_vQ-JgO9u_zjvqmu1Lj08Y0OgzMcIW6r6Hhgn32ExmXNW54fvcXrW6Bx-XYSU5OEah8J5Y" alt="Arjun Malhotra" width={64} height={64} className="rounded-full object-cover" style={{ border: '2px solid #a3a6ff' }} unoptimized />
                    <div>
                      <h4 className="text-white font-bold text-xl">Arjun Malhotra</h4>
                      <p className="text-sm" style={{ color: '#a3a6ff' }}>Founder, LensArt Studios (Bangalore)</p>
                    </div>
                  </div>
                  <p className="text-xl italic leading-relaxed" style={{ color: '#e8e2fc' }}>
                    &ldquo;RawDrive has completely changed how I deliver weddings. The GST invoicing saves me hours of headache, and the AI culling is like having a full-time assistant. It&apos;s the first platform that actually understands the Indian wedding photography business.&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. PRICING PREVIEW */}
        <section className="py-24 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Simple, Transparent Pricing</h2>
            <p style={{ color: '#ada8c1' }}>Choose a plan that scales with your studio.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Starter', price: '₹500', features: ['10 Active Galleries', '100GB Storage', 'GST Ready Invoices'], popular: false },
              { name: 'Professional', price: '₹1,200', features: ['Unlimited Galleries', '500GB Storage', 'AI Smart Culling', 'Custom Branding'], popular: true },
              { name: 'Business', price: '₹5,000', features: ['Unlimited Storage', 'Team Accounts (5 Users)', 'Live Streaming Feature', 'Priority 24/7 Support'], popular: false },
            ].map((plan) => (
              <article key={plan.name} role="article" className={`p-8 rounded-2xl flex flex-col ${plan.popular ? 'relative md:-translate-y-4 shadow-2xl' : ''}`}
                style={{
                  background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)',
                  border: plan.popular ? '1px solid rgba(163,166,255,0.4)' : '1px solid rgba(255,255,255,0.05)',
                }}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest" style={{ background: '#a3a6ff', color: '#0f00a4' }}>Popular</div>
                )}
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">{plan.price}</span>
                    <span className="text-gray-500">/mo</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-8 flex-grow">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-gray-300">
                      <span style={{ color: '#a3a6ff' }}>&#x2713;</span> {f}
                    </li>
                  ))}
                </ul>
                <a href="/register" className={`w-full py-3 rounded-xl font-bold transition-all text-center block min-h-[44px] leading-[44px]`}
                  style={plan.popular
                    ? { background: '#a3a6ff', color: '#0f00a4', boxShadow: '0 0 20px rgba(163,166,255,0.3)' }
                    : { border: '1px solid rgba(255,255,255,0.1)', color: 'white' }
                  }>
                  {plan.popular ? 'Select Pro' : plan.name === 'Business' ? 'Contact Sales' : 'Get Started'}
                </a>
              </article>
            ))}
          </div>
          <div className="text-center mt-12">
            <a className="font-bold transition-all inline-flex items-center gap-2 hover:underline" href="/pricing" style={{ color: '#a3a6ff' }}>
              View All Plans &amp; Comparison &#x2192;
            </a>
          </div>
        </section>

        {/* 6. FINAL CTA */}
        <section className="py-24 px-6 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px]" style={{ background: 'rgba(163,166,255,0.1)' }}></div>
          <div className="max-w-4xl mx-auto rounded-3xl p-12 text-center relative z-10" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(163,166,255,0.2)' }}>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6" style={{ fontFamily: 'Manrope, sans-serif' }}>Ready to Transform Your Studio?</h2>
            <p className="mb-10 max-w-xl mx-auto text-lg leading-relaxed" style={{ color: '#ada8c1' }}>
              Join thousands of elite photographers across India. Set up your gallery in under 2 minutes.
            </p>
            <div className="flex flex-col md:flex-row gap-4 justify-center items-stretch max-w-lg mx-auto">
              <input className="flex-grow rounded-xl px-6 py-4 text-white outline-none min-h-[48px]" placeholder="Enter your email" type="email"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <a href="/register" className="px-8 py-4 rounded-xl font-bold transition-all active:scale-95 whitespace-nowrap text-center min-h-[48px] inline-flex items-center justify-center" style={{ background: '#a3a6ff', color: '#0f00a4', boxShadow: '0 0 20px rgba(163,166,255,0.3)' }}>
                Start Free
              </a>
            </div>
            <p className="text-gray-500 mt-6 text-sm">No credit card required &bull; 14-day free trial</p>
          </div>
        </section>
      </main>

      {/* 7. FOOTER */}
      <footer className="w-full py-12 px-6 border-t" style={{ background: '#050411', borderColor: 'rgba(255,255,255,0.05)', color: '#e8e2fc', fontFamily: 'Inter, sans-serif' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1 space-y-6">
              <div className="flex items-center gap-2">
                <Image src="/assets/brand/rawdrive-icon.png" alt="RawDrive" width={28} height={28} className="rounded-md" />
                <span className="text-xl font-bold text-white">RawDrive</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">The premium photography operating system for India&apos;s creative professionals.</p>
            </div>
            <div className="space-y-4">
              <h4 className="text-white font-bold">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a className="hover:text-indigo-400 transition-colors" href="/features">Features</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="/pricing">Pricing</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-white font-bold">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a className="hover:text-indigo-400 transition-colors" href="#">About Us</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="#">Contact</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-white font-bold">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a className="hover:text-indigo-400 transition-colors" href="/privacy">Privacy Policy</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="/terms">Terms of Service</a></li>
                <li><a className="hover:text-indigo-400 transition-colors" href="/refund">Refund Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <p className="text-gray-500 text-sm">© 2026 RawDrive India. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-1">&#x1F6E1; Secure Payments</span>
              <span className="flex items-center gap-1">&#x1F310; Global CDN</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
