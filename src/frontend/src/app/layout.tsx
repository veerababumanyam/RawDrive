import React from 'react'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RawDrive - India\'s Premium Photography SaaS',
  description: 'The all-in-one platform for Indian photographers. Manage galleries, deliver to clients, handle GST invoices, and grow your studio.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="liquid-glass" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#0e0c1e', color: '#e8e2fc', fontFamily: 'Inter, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  )
}
