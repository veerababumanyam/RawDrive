import React from 'react'

export function Footer() {
  return (
    <footer role="contentinfo" className="bg-card/60 backdrop-blur-sm border-t border-border py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <span className="text-lg font-bold text-foreground">RawDrive</span>
            <p className="mt-2 text-sm text-muted-foreground">Professional Photography, Simplified</p>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-3">Product</h3>
            <a href="/features" className="block text-sm text-muted-foreground hover:text-foreground mb-2">Features</a>
            <a href="/pricing" className="block text-sm text-muted-foreground hover:text-foreground mb-2">Pricing</a>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-3">Legal</h3>
            <a href="/privacy" className="block text-sm text-muted-foreground hover:text-foreground mb-2">Privacy Policy</a>
            <a href="/terms" className="block text-sm text-muted-foreground hover:text-foreground mb-2">Terms of Service</a>
            <a href="/refund" className="block text-sm text-muted-foreground hover:text-foreground mb-2">Refund Policy</a>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-3">Connect</h3>
            <p className="text-sm text-muted-foreground">Made in India</p>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} RawDrive. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
