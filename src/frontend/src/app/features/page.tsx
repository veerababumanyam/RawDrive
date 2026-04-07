import React from 'react'
import Image from 'next/image'

const glass = { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }
const primary = '#a3a6ff'
const secondary = '#ac8aff'
const tertiary = '#ff6daf'
const surfaceVariant = '#ada8c1'

const features = [
  { icon: '📸', color: primary, title: 'Gallery Management', desc: 'Deliver high-resolution client galleries that look stunning on any device. Your work deserves a premium presentation that reflects your brand\'s quality.', bullets: ['Fast drag-and-drop uploads', 'Automated cloud watermarking', 'Granular download controls'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBvyg4xN6NdTtC0vkpPJiGBSXMDosT6GTVz0LblDp7OOLY229eOuKsQfwmZ4eEL9Jtsi_7wBTSlI8to_w-3ijxPP4HIn2iYGgV8MvNmp40pBEmeO49PeTi74rJJVTOIBIW-J6_oIbaTj0BUFCizfZY-d43RqlB47JG6W3eH3Dl2lnLblF2DwC0FuJzqcgwKwBRSfxSM2KZfASDtZ-4N0bzOq_lN8FpfCAHJvH049Z82tqUiX4oR3ypEN7kAR5tSutEgoGzw-FtK5qA', imgAlt: 'Gallery Management Interface' },
  { icon: '✅', color: secondary, title: 'Client Proofing and Selection', desc: 'Stop the WhatsApp back-and-forth. Let clients select their favorites directly within the gallery with clear limits and instant updates.', bullets: ['Interactive star ratings', 'Photo-specific comments', 'Custom selection limits'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA1sxdl7g60ATFLuuWzIFfaEECBpIMYy76PWisNlmPWP_4U-S7Vl_Dgh_031PDu72I38opYxF7eXoX8ax0XZz7iY2h2y8mzZ_gid0J93jwlyu7m92cqDTB0xjMM2m78k2Faw4D4DnzzF9w_TnwpAaAzV6WwzBkwl61-5uk-_q-1V3DUsmXtsXQrHkITkCMDvztUIOFeJYgYzXW46Yz1ZOv59iPKL217tloFNGLQh11yaaFtyvZ7HHP4-HkppzAHA45hGs5eWz0DI-E', imgAlt: 'Client Proofing Tool' },
  { icon: '🧾', color: tertiary, title: 'GST Invoicing', desc: 'Built for the Indian market. Generate professional invoices that comply with local tax laws automatically.', bullets: ['Fully compliant GST invoices', 'Built-in HSN code library', 'State-wise financial reporting'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBY5Zynr21xdJRyF100RVV_26WLDRha7sQ6g52QTGNPeXLq_VE1QY7VD6J_cNmpdENDxcI3IpnBmYSyXP0TzZ7zkc0eA3_uLirgrUuJBGsBxKIJdzqvDZfKJI_aqrnF7YB3FJzT52RSul4SuUNelzxOIIyW4dU6sp_mBWXD2kSFti9My4Vuf0u4vy6ZLNXXMfZ9doHnJXxB5Cxwix8ywlX8YBLb4b3HyNbtLR2KyVC7AaiD8VR6ibt81WXVs003IoKewNl3etCDbTs', imgAlt: 'GST Invoice Preview' },
  { icon: '✨', color: primary, title: 'AI Smart Culling', desc: 'Save hours of manual work. Our AI analyzes your shoot to identify the best shots based on technical and aesthetic criteria.', bullets: ['Advanced face detection', 'Automatic duplicate removal', 'Smart \'best-shot\' suggestions'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBOJQ1_qqYSfXlTM85Y4XGeov2SBUTAh-OcRV9Lxh6Zf7mps0bMvFhq-Ee2Oo6K1p-xbqlQMxE23Zul0Ff3nl99L63L1m009Behib-GjXbIHO5PVqVRFd8nbduTqtiej7h73J96clKHtL3dQZpaSGkWNuAdMlsQdwmZtDoX9DoVfwJaPjUaeODL8BMXbxU4ghwaPVcO8HuH3_dp4gkxktv4dg8U6_i-ewAIIn7Y2GVNv3ahbHdX3W1qDit6G4ioT44rAb0JQUpn0Lc', imgAlt: 'AI Smart Culling' },
  { icon: '📺', color: secondary, title: 'Live Streaming', desc: "Stream weddings and events directly to family and friends who couldn't make it. Keep the experience exclusive and private.", bullets: ['Integrated real-time chat', 'Live guest reactions', 'Automatic cloud recording'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDVZo2k8wLdpFdACExxo3BVGjKN3x0QT7ET_GQWW7hbOlIgR_2lsgFKZw1wFawV6g-eyKdqTXLifVs4epry0qIQsrKBvIGOtzE9IkZRt5iaYNuL0ozOBV4zO4RaZmqpKjLmyWr4mAhoI0l4LSIgCnRIQ4xYIchSHv6aYeBIaLQm7UOdaY_6yGIdH1YRbRbvtDtWI8Y4YLYcWHl1GAnqdOBJVc4Pa75mSy7OZYJ9CZG3v4HA5-qZLE_g76hTQ1Zvns7gTLtnTHygHoI', imgAlt: 'Live Stream Interface' },
  { icon: '📅', color: tertiary, title: 'Booking and Calendar', desc: 'Manage your availability and let clients book you effortlessly. Stay organized with a unified view of all your upcoming shoots.', bullets: ['Smart availability settings', 'Automated SMS/Email reminders', 'Seamless payment collection'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA6GKe1Iw-Em5IwvKWsiwknUqPymLDaCQYmQ6_fgiTvUy8_NLjILDysw_l-4aRQ7u8iTZrI3UJiroV4b8O_LjSHddQSsXvCnvnGiJpG5CRymTwZYHSmNCAK9qhbPX36qKcWyh5H0mU0M0ZSjDOnD75_jDZ9TQPaKXahFrRexbEscteyF_6ylI1xKXoz-n88ooNEzND9oI7ZTUkJHByBTK4He38_6tywggqicnzKYUntdGMyivDjeGlOlxXYWgsDgwwYs5DgpiFZIeA', imgAlt: 'Calendar Interface' },
  { icon: '👥', color: primary, title: 'CRM and Lead Management', desc: 'Never miss an inquiry again. Track every lead from the first message to the final delivery in one unified dashboard.', bullets: ['Centralized inquiry tracking', 'Automated follow-up flows', 'Robust searchable database'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCXbF9U1spoY4R4JQoXJuY8gydsmM09QG57Sn7pl-nFuN6X4z7IjBs7qEquL-jdlB-nW1Txjmo0RB7tEPI1NBraq3VkwkYxgAcehdhEHO2ZVi-W6SKK0bfgrkvfDL8tP90HK1wB8R84F9_GoK1eXHpZUdPKiAp9hAdDuR73SRKu3OpebD0vQNOn78B6v8kQ4cKxNXvNiM2NzsqB1tc0ct7xvPU6O5mT_P08IBOvdfGgpi1pR7v5FSHWnXVR0pZrmP3uUJxNhiTbceU', imgAlt: 'CRM Dashboard' },
  { icon: '📝', color: secondary, title: 'Contracts and E-Signatures', desc: 'Protect your business with legally binding digital contracts. Professional templates ready for the Indian legal context.', bullets: ['Professional lawyer-vetted templates', 'Secure one-click digital signing', 'Real-time status notifications'], img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDjEB1dw8eQUSKVgJq7TlOA8hqvxInw8pxiA69dvATQtRBaWXfB2KGg2gKj55b9rBaoGABeXYmIrH4aOf5ST0HsH__lNoqASYMbG57reF6pui1myVZQEy5R1ZNO6CEOYlvZ2Q4GAKsNxjsz-BeNwGi05sHqsKjN5RYrfYykYkqnG2mJj6zMXIGJ9rgWDtVFAqbQAvjsduoizGC10O9hfMclzH4E0wtTPw0pwl9YBejDnotgLj2gcMOf-xn1Gcv9TTmkAPsnoKYF6m8', imgAlt: 'Digital Signature' },
]

const comparisonRows = [
  { feature: 'GST Invoicing', rawdrive: true, pixieset: false, shootproof: false },
  { feature: 'UPI Payments', rawdrive: true, pixieset: false, shootproof: false },
  { feature: 'India Pricing (INR)', rawdrive: true, pixieset: false, shootproof: false },
  { feature: 'Hindi Language Support', rawdrive: true, pixieset: false, shootproof: false },
  { feature: 'DPDPA Compliance', rawdrive: true, pixieset: false, shootproof: false },
]

export default function FeaturesPage() {
  return (
    <>
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
          <a href="/" className="flex items-center gap-2">
            <Image src="/assets/brand/rawdrive-icon.png" alt="RawDrive" width={32} height={32} className="rounded-lg" />
            <span className="text-2xl font-black tracking-tighter text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>RawDrive</span>
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a className="text-white font-semibold" href="/features" style={{ borderBottom: '2px solid #6366f1', paddingBottom: '4px' }}>Features</a>
            <a className="text-white/70 hover:text-white transition-colors" href="/pricing">Pricing</a>
          </div>
          <a href="/register" className="px-6 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 min-h-[44px] inline-flex items-center" style={{ background: primary, color: '#0f00a4' }}>Get Started</a>
        </div>
      </nav>

      <main style={{ background: '#0e0c1e', color: '#e8e2fc', fontFamily: 'Inter, sans-serif' }}>
        {/* Hero */}
        <header className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
          <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(163,166,255,0.15) 0%, transparent 70%)' }}></div>
          <div className="max-w-7xl mx-auto px-6 text-center">
            <h1 className="font-extrabold text-5xl md:text-7xl text-white mb-6 tracking-tight max-w-4xl mx-auto leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Everything You Need to <span style={{ color: primary }}>Run Your Studio</span>
            </h1>
            <p className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed" style={{ color: surfaceVariant }}>
              RawDrive combines gallery delivery, client management, invoicing, and AI tools in one platform designed specifically for the modern Indian photographer.
            </p>
          </div>
        </header>

        {/* Feature Sections */}
        <div className="max-w-7xl mx-auto px-6 space-y-32 pb-32">
          {features.map((f, i) => {
            const reversed = i % 2 === 1
            return (
              <section key={f.title} id={f.title.toLowerCase().replace(/\s+/g, '-')} className="grid md:grid-cols-2 gap-16 items-center">
                <div className={`space-y-6 ${reversed ? 'order-1 md:order-2' : ''}`}>
                  <div className="inline-flex p-3 rounded-2xl" style={{ background: `${f.color}15`, color: f.color }}>
                    <span className="text-3xl">{f.icon}</span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>{f.title}</h2>
                  <p className="leading-relaxed" style={{ color: surfaceVariant }}>{f.desc}</p>
                  <ul className="space-y-4">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-3">
                        <span style={{ color: f.color }}>&#x2713;</span> {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`rounded-2xl p-4 ${reversed ? 'order-2 md:order-1' : ''}`} style={glass}>
                  <div className="relative rounded-xl overflow-hidden aspect-video">
                    <Image src={f.img} alt={f.imgAlt} fill className="object-cover" unoptimized />
                  </div>
                </div>
              </section>
            )
          })}

          {/* Comparison Table */}
          <section className="py-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Why RawDrive?</h2>
              <p style={{ color: surfaceVariant }} className="max-w-xl mx-auto">Compare us with global alternatives and see why Indian professionals choose RawDrive.</p>
            </div>
            <div className="rounded-3xl overflow-hidden" style={glass}>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <th className="p-6 font-medium" style={{ color: surfaceVariant }}>Feature</th>
                      <th className="p-6 font-bold" style={{ color: primary }}>RawDrive</th>
                      <th className="p-6 font-medium text-slate-500">Pixieset</th>
                      <th className="p-6 font-medium text-slate-500">ShootProof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.feature} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td className="p-6 text-white font-medium">{row.feature}</td>
                        <td className="p-6" style={{ color: primary }}>{row.rawdrive ? '✓' : '—'}</td>
                        <td className="p-6 text-slate-600">{row.pixieset ? '✓' : '—'}</td>
                        <td className="p-6 text-slate-600">{row.shootproof ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section className="py-20">
            <div className="p-12 md:p-20 rounded-[2.5rem] relative overflow-hidden text-center" style={glass}>
              <div className="absolute top-0 right-0 w-64 h-64 blur-[100px]" style={{ background: 'rgba(163,166,255,0.2)' }}></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 blur-[100px]" style={{ background: 'rgba(172,138,255,0.2)' }}></div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 relative z-10" style={{ fontFamily: 'Manrope, sans-serif' }}>Start Your Free 14-Day Trial</h2>
              <p className="text-lg mb-10 max-w-xl mx-auto relative z-10" style={{ color: surfaceVariant }}>Join thousands of Indian photographers who have elevated their business with RawDrive.</p>
              <div className="flex flex-col md:flex-row gap-4 max-w-lg mx-auto mb-6 relative z-10">
                <input className="flex-1 rounded-xl px-6 py-4 text-white outline-none transition-all min-h-[48px]" placeholder="Enter your work email" type="email" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                <a href="/register" className="px-8 py-4 rounded-xl font-bold transition-all active:scale-95 text-center min-h-[48px] inline-flex items-center justify-center" style={{ background: primary, color: '#0f00a4' }}>Get Started</a>
              </div>
              <p className="text-slate-500 text-sm relative z-10">No credit card required. Cancel anytime.</p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#050411', borderTop: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Inter, sans-serif' }}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 px-8 py-16 max-w-7xl mx-auto text-sm">
          <div className="col-span-2 md:col-span-1 space-y-4">
            <div className="flex items-center gap-2">
              <Image src="/assets/brand/rawdrive-icon.png" alt="RawDrive" width={24} height={24} className="rounded-md" />
              <span className="text-lg font-bold text-white">RawDrive</span>
            </div>
            <p className="text-slate-500 leading-relaxed">© 2026 RawDrive Photography SaaS. Built for professionals.</p>
          </div>
          <div className="space-y-4">
            <h4 className="text-white font-medium">Product</h4>
            <nav className="flex flex-col gap-2">
              <a className="text-slate-500 hover:text-indigo-400 transition-colors" href="/features">Features</a>
              <a className="text-slate-500 hover:text-indigo-400 transition-colors" href="/pricing">Pricing</a>
            </nav>
          </div>
          <div className="space-y-4">
            <h4 className="text-white font-medium">Legal</h4>
            <nav className="flex flex-col gap-2">
              <a className="text-slate-500 hover:text-indigo-400 transition-colors" href="/privacy">Privacy</a>
              <a className="text-slate-500 hover:text-indigo-400 transition-colors" href="/terms">Terms</a>
              <a className="text-slate-500 hover:text-indigo-400 transition-colors" href="/refund">Refund</a>
            </nav>
          </div>
          <div className="space-y-4">
            <h4 className="text-white font-medium">Connect</h4>
            <nav className="flex flex-col gap-2">
              <a className="text-slate-500 hover:text-indigo-400 transition-colors" href="#">Instagram</a>
              <a className="text-slate-500 hover:text-indigo-400 transition-colors" href="#">X (Twitter)</a>
            </nav>
          </div>
        </div>
      </footer>
    </>
  )
}
