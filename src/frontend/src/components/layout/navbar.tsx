import React from 'react'

export function Navbar() {
  return (
    <nav role="navigation" className="sticky top-0 z-20 backdrop-blur-md bg-card/80 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="/" className="text-xl font-bold text-foreground">RawDrive</a>
        <div className="hidden md:flex items-center gap-6">
          <a href="/features" className="text-sm text-muted-foreground hover:text-foreground">Features</a>
          <a href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <button aria-label="Toggle theme" className="p-2 rounded-lg hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </button>
          <a href="/register" className="hidden md:inline-flex px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium min-h-[44px] items-center">Get Started</a>
          <button aria-label="Menu" className="md:hidden p-2 min-h-[44px] min-w-[44px]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
        </div>
      </div>
    </nav>
  )
}
