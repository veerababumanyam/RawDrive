import React from 'react'

export default function PrivacyPage() {
  return (
    <main className="py-20 px-4 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2026</p>
      <section className="mt-8 space-y-6 text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">1. Data Protection & DPDPA Compliance</h2>
        <p>RawDrive complies with the Digital Personal Data Protection Act (DPDPA) 2023 and processes your personal data lawfully, fairly, and transparently.</p>
        <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>
        <p>We collect information you provide during registration, onboarding, and use of the platform including email, phone number, business name, and uploaded media.</p>
        <h2 className="text-xl font-semibold text-foreground">3. How We Use Your Data</h2>
        <p>Your data is used to provide platform services, process payments, generate invoices, and improve our service quality.</p>
        <h2 className="text-xl font-semibold text-foreground">4. Data Storage and Security</h2>
        <p>All data is stored on servers located in India. We use industry-standard encryption for data at rest and in transit.</p>
        <h2 className="text-xl font-semibold text-foreground">5. Your Rights</h2>
        <p>Under DPDPA, you have the right to access, correct, and delete your personal data. Contact us at privacy@rawdrive.in to exercise these rights.</p>
      </section>
    </main>
  )
}
