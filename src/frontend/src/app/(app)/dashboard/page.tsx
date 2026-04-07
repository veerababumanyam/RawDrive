import React from 'react'
import Image from 'next/image'

const glass = { background: 'rgba(31,29,53,0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(72,69,90,0.15)' } as const

const navItems = [
  { icon: '🏠', label: 'Dashboard', active: true },
  { icon: '🖼️', label: 'Galleries', active: false },
  { icon: '👥', label: 'Clients', active: false },
  { icon: '📅', label: 'Bookings', active: false },
  { icon: '🧾', label: 'Invoices', active: false },
  { icon: '📊', label: 'Analytics', active: false },
  { icon: '⚙️', label: 'Settings', active: false },
]

const stats = [
  { icon: '🖼️', label: 'Total Galleries', value: '24', badge: '+12%', color: '#a3a6ff' },
  { icon: '👥', label: 'Active Clients', value: '156', badge: '+4 new', color: '#ac8aff' },
  { icon: '☁️', label: 'Storage Used', value: '85.2', suffix: '/ 200 GB', progress: 42, color: '#ffa1d8' },
  { icon: '💰', label: 'Revenue This Month', value: '₹2,45,000', badge: 'Top Month', color: '#9598f0' },
]

const galleries = [
  { title: 'Malhotra Wedding', date: '24 Oct 2023', photos: 420, client: 'Rohan Malhotra', initials: 'RM', status: 'Delivered', statusColor: '#a3a6ff', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAJnvuEojfIFWF77Lh3_yZrdT4j-IAoyp1WQUi-x2IVqd39GB95-tyHqEHUoVj3hpaYWaxvcYTOnjHganqu9oXCAdga4KJqKrjdlonpMUIJg73phQcf9JOI9Z_PfYW7oUENm1ZC22QEVtoMXNvZJRjFZrM_wrGlJ4qDT1bYjVEDyAmk2DfTUYB3CD_DivgzT89zkULr_aEG8SfO4fNgMPzj55Pv9aDDi4EGPta615KEym4Ec4Z4R0Q4tRk_2erju8T9guPFDZjc_w4' },
  { title: 'TechCorp Portraits', date: '22 Oct 2023', photos: 85, client: 'Anita Desai', initials: 'TC', status: 'Processing', statusColor: '#ac8aff', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuADbROUc7A0o-GjmiFxsEPXwxCw_XQOUjLNR-hYJuozDR_JtNXpRDJO8iJa2yLspknahTDwN8ngse4FoCssaVyWEAKKgo0DkJ7VQ_5inIiO-DjXJTPWtz_Zqji9NcKVISG94COTw6A9f_5w5LUToN9FqNl5hivulzc7D7ORWJ95EmHC_Af_XmgofHnYgSnK-zCVn-iTxvyYmF--cjmAbuY9ShVOH_cxg0-7RHiXChS_bHykLCYdzQPWBekKqFQf3yXfMyMjPg80hrw' },
  { title: 'Ladakh Expedition', date: '18 Oct 2023', photos: 1200, client: 'NatGeo Project', initials: 'NP', status: 'Shared', statusColor: '#ffa1d8', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBZ7sLCJ7t_OU0zWPkHnE-WZuQs_7xaeZFW7zBom9jOGbPuOuyiNSP19kgVt77CpDUhDH_7_ZW8F8YGMh7M2YGHD7KwO7jaGaUbSpCmg6gWIWNC6qxK2DTIHpChX5Hr-CCQppoiGBBIpl1DNJpXt-_5VbcvkPwZgY3Ocvc3T_umGxKLr2hpGu_nVDecMgZQPpLEYoLSBB0ys1kWYPwJlzFwLaZuob168bTvqZg1gh5kElgxX0Wpne13fqO3B24lrm0kVkII07xqQOQ' },
  { title: 'Neon Summer Editorial', date: '15 Oct 2023', photos: 56, client: 'Vogue Magazine', initials: 'VM', status: 'Draft', statusColor: '#9598f0', img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1F5cP6bSLB8Bla1QTLzn3cPy8UO47g0UNtCk_K4XjjrJIUf6W8FhOuyW7b_8jO2SQ6xSAZ9QKN6uuZeMvuEdAGtlQXy_z09cf35amVWSbQNZ9ZEfxkvzOcI4TRexP_vwVkJqxjEy8WwXHR-xoi1XTQYLRO6Bpc8_AzL9VFPMijELhUJfVATk73QkyzOmqq-ehP5Z5a2f-oovS3VZ6tsEfvvXrFYMrjQc7cdmtwHm1ANWaeSosJ3s53NWQI3Y4wwc87LsaMHdJ5ac' },
]

const activities = [
  { icon: '📅', label: 'New booking from', highlight: 'Priya Sharma', time: 'Today, 2:45 PM', color: '#a3a6ff' },
  { icon: '📨', label: 'Gallery', highlight: 'Sharma Wedding', suffix: 'delivered', time: 'Yesterday, 6:20 PM', color: '#ac8aff' },
  { icon: '✅', label: 'Invoice', highlight: '#1024', suffix: 'paid ₹35,000', time: '2 days ago', color: '#ffa1d8' },
  { icon: '💬', label: '', highlight: 'Vikram Roy', suffix: 'commented on photo', time: '3 days ago', color: '#9598f0' },
]

export default function DashboardPage() {
  return (
    <div className="min-h-screen" style={{ background: '#0e0c1e', color: '#e8e2fc', fontFamily: 'Inter, sans-serif' }}>
      {/* Sidebar */}
      <aside className="w-[240px] h-screen fixed left-0 top-0 flex flex-col py-8 z-50 hidden lg:flex" style={{ background: 'rgba(19,17,37,0.9)', backdropFilter: 'blur(20px)', boxShadow: '0 0 40px rgba(163,166,255,0.06)' }}>
        <div className="px-6 mb-10">
          <div className="flex items-center gap-2">
            <Image src="/assets/brand/rawdrive-icon.png" alt="RawDrive" width={28} height={28} className="rounded-lg" />
            <span className="text-xl font-bold tracking-tighter" style={{ color: '#a3a6ff', fontFamily: 'Manrope, sans-serif' }}>RawDrive</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 text-slate-400 mt-1">Creative Studio</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map(item => (
            <a key={item.label} href="#" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${item.active ? 'border-r-2' : 'opacity-70 hover:opacity-100'}`}
              style={item.active ? { color: '#a3a6ff', borderColor: '#a3a6ff', background: 'rgba(163,166,255,0.1)' } : { color: '#94a3b8' }}>
              <span>{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="px-4 mt-auto">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer" style={{ color: '#e8e2fc' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#1f1d35', border: '1px solid rgba(163,166,255,0.2)' }}>AS</div>
            <div>
              <p className="text-sm">Arjun Singh</p>
              <p className="text-[10px] opacity-50 text-slate-400">View Profile</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Top Bar */}
      <header className="fixed top-0 right-0 h-16 flex justify-between items-center px-8 z-40 lg:w-[calc(100%-240px)] w-full" style={{ background: 'rgba(19,17,37,0.6)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-6 flex-1">
          <input className="w-full max-w-md rounded-xl py-2 pl-10 pr-4 outline-none transition-all text-sm" placeholder="Search galleries, clients, or files..." type="text"
            style={{ background: '#000', border: '1px solid rgba(72,69,90,0.15)', color: '#e8e2fc' }} />
        </div>
        <div className="flex items-center gap-4">
          <button className="w-10 h-10 flex items-center justify-center rounded-full transition-all" style={{ color: '#a3a6ff' }}>🔔</button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#1f1d35', border: '1px solid rgba(163,166,255,0.2)' }}>AS</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="lg:ml-[240px] pt-24 px-8 pb-12 min-h-screen">
        {/* Welcome Banner */}
        <section className="mb-8">
          <div className="p-8 rounded-2xl flex justify-between items-center relative overflow-hidden" style={glass}>
            <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: 'rgba(163,166,255,0.1)' }}></div>
            <div className="relative z-10">
              <h2 className="text-3xl font-bold tracking-tight mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>Welcome back, Arjun!</h2>
              <p className="max-w-md" style={{ color: '#ada8c1' }}>Your studio is buzzing today. You have 3 pending shoots and 2 galleries ready for delivery.</p>
            </div>
            <button className="text-slate-400 hover:text-white transition-colors relative z-10">✕</button>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {stats.map(s => (
            <div key={s.label} className="p-6 rounded-xl transition-all duration-300 hover:brightness-110" style={glass}>
              <div className="flex justify-between items-start mb-4">
                <span className="text-xl">{s.icon}</span>
                {s.badge && <span className="text-[10px] font-medium tracking-widest px-2 py-1 rounded-full" style={{ color: s.color, background: `${s.color}15` }}>{s.badge}</span>}
              </div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#ada8c1' }}>{s.label}</p>
              <p className="text-3xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {s.value}{s.suffix && <span className="text-lg font-medium opacity-50"> {s.suffix}</span>}
              </p>
              {s.progress !== undefined && (
                <div className="w-full rounded-full h-1.5 mt-3" style={{ background: '#25233d' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${s.progress}%`, background: s.color }}></div>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-8">
          {/* Recent Galleries */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h3 className="text-xl font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Recent Galleries</h3>
                <p className="text-sm" style={{ color: '#ada8c1' }}>Manage and share your latest shoots</p>
              </div>
              <button className="text-sm font-semibold hover:underline" style={{ color: '#a3a6ff' }}>View All</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {galleries.map(g => (
                <div key={g.title} className="rounded-2xl overflow-hidden transition-transform duration-300 hover:scale-[1.02]" style={glass}>
                  <div className="h-48 relative">
                    <Image src={g.img} alt={g.title} fill className="object-cover" unoptimized />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0c1e] to-transparent opacity-60"></div>
                    <div className="absolute bottom-4 left-4">
                      <span className="text-[10px] px-2 py-1 rounded uppercase font-bold tracking-widest" style={{ background: `${g.statusColor}30`, backdropFilter: 'blur(8px)', color: g.statusColor }}>{g.status}</span>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>{g.title}</h4>
                        <p className="text-xs mt-0.5" style={{ color: '#ada8c1' }}>{g.date} &bull; {g.photos} Photos</p>
                      </div>
                      <span className="text-slate-400 cursor-pointer hover:text-white">⋮</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: '#1f1d35', border: `1px solid ${g.statusColor}30` }}>{g.initials}</div>
                      <span className="text-xs" style={{ color: '#ada8c1' }}>{g.client}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column */}
          <div className="col-span-12 lg:col-span-4 space-y-8">
            {/* Quick Actions */}
            <div className="p-6 rounded-2xl" style={glass}>
              <h3 className="text-lg font-bold mb-6" style={{ fontFamily: 'Manrope, sans-serif' }}>Quick Actions</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: '📸', label: 'Create Gallery', color: '#a3a6ff' },
                  { icon: '🧾', label: 'Send Invoice', color: '#ac8aff' },
                  { icon: '👤', label: 'Add Client', color: '#ffa1d8' },
                  { icon: '📅', label: 'New Booking', color: '#9598f0' },
                ].map(a => (
                  <button key={a.label} className="flex flex-col items-center justify-center p-4 rounded-xl transition-all min-h-[80px]" style={{ background: `${a.color}10`, border: `1px solid ${a.color}30` }}>
                    <span className="text-xl mb-2">{a.icon}</span>
                    <span className="text-xs font-semibold" style={{ color: a.color }}>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="p-6 rounded-2xl" style={glass}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold" style={{ fontFamily: 'Manrope, sans-serif' }}>Recent Activity</h3>
                <span className="text-slate-400 text-sm cursor-pointer">🕐</span>
              </div>
              <div className="space-y-6">
                {activities.map((a, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${a.color}15` }}>
                      <span>{a.icon}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm leading-tight">{a.label} <span className="font-semibold">{a.highlight}</span>{a.suffix ? ` ${a.suffix}` : ''}</p>
                      <p className="text-xs mt-1" style={{ color: '#ada8c1' }}>{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-8 py-3 rounded-xl text-sm font-semibold transition-all" style={{ border: '1px solid rgba(72,69,90,0.15)', color: '#ada8c1' }}>
                View All Activity
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
