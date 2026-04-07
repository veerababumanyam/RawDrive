import React from 'react'

export default function TermsPage() {
  return (
    <main className="py-20 px-4 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2026</p>
      <section className="mt-8 space-y-6 text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">1. Agreement to Terms</h2>
        <p>By accessing RawDrive, you agree to be bound by these Terms of Service and all applicable laws and regulations.</p>
        <h2 className="text-xl font-semibold text-foreground">2. Service Description</h2>
        <p>RawDrive provides a SaaS platform for professional photographers including gallery management, client proofing, invoicing, and business tools.</p>
        <h2 className="text-xl font-semibold text-foreground">3. User Responsibilities</h2>
        <p>You are responsible for maintaining the security of your account and for all activities under your account.</p>
        <h2 className="text-xl font-semibold text-foreground">4. Marketplace Disclaimer</h2>
        <p>RawDrive is a platform provider. We are not a party to transactions between photographers and their clients, or between marketplace participants.</p>
      </section>
    </main>
  )
}
