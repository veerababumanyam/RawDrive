import React from 'react'

export default function RefundPage() {
  return (
    <main className="py-20 px-4 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground">Refund Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2026</p>
      <section className="mt-8 space-y-6 text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">1. Cancellation Terms</h2>
        <p>You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.</p>
        <h2 className="text-xl font-semibold text-foreground">2. Refund Eligibility</h2>
        <p>Refunds are available within 14 days of initial purchase if you are not satisfied with the service.</p>
        <h2 className="text-xl font-semibold text-foreground">3. Return Process</h2>
        <p>To request a refund, contact support@rawdrive.in with your account details and reason for the request.</p>
      </section>
    </main>
  )
}
