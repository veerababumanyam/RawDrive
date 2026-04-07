'use client'

import React from 'react'

const plans = [
  { name: 'Free', price: '₹0', period: 'forever', storage: '2 GB', galleries: '3', features: ['Basic gallery', 'Watermark', '3 galleries'] },
  { name: 'Starter', price: '₹500', period: '/month', storage: '50 GB', galleries: '10', features: ['50 GB storage', '10 galleries', 'Client proofing', 'Basic analytics'] },
  { name: 'Professional', price: '₹1,200', period: '/month', storage: '200 GB', galleries: 'Unlimited', popular: true, features: ['200 GB storage', 'Unlimited galleries', 'Client proofing', 'GST invoicing', 'AI smart culling', 'Priority support'] },
  { name: 'Business', price: '₹5,000', period: '/month', storage: '2 TB', galleries: 'Unlimited', features: ['2 TB storage', 'Unlimited galleries', 'All Pro features', 'Team management', 'Live streaming', 'Custom branding'] },
  { name: 'Custom', price: 'Contact', period: 'us', storage: 'Custom', galleries: 'Unlimited', features: ['Custom storage', 'Dedicated support', 'SLA guarantee', 'On-premise option'] },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen py-20 px-4" style={{ background: '#0e0c1e' }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-4">
          <p className="text-xs tracking-wider uppercase" style={{ color: '#77728a' }}>Step 2 of 4</p>
        </div>
        <h1 className="text-4xl font-bold text-center mb-2" style={{ color: '#e8e2fc', fontFamily: 'Manrope, sans-serif' }}>Choose your plan</h1>
        <p className="text-center mb-12" style={{ color: '#ada8c1' }}>
          Select the capacity that matches your workflow. Scale up or down as your studio grows.
        </p>

        <div className="flex justify-center mb-8">
          <button role="switch" aria-label="Toggle monthly or annual billing"
            className="px-6 py-2 rounded-full text-sm font-medium min-h-[44px]"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ada8c1' }}>
            Monthly / Annual
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {plans.map((plan) => (
            <article key={plan.name} role="article"
              className="p-6 rounded-2xl flex flex-col transition-all"
              style={{
                background: plan.popular ? 'rgba(163,166,255,0.08)' : 'rgba(255,255,255,0.03)',
                border: plan.popular ? '1px solid rgba(163,166,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
                boxShadow: plan.popular ? '0 0 20px rgba(163,166,255,0.15)' : 'none',
              }}>
              {plan.popular && (
                <span className="text-xs font-semibold uppercase tracking-wider mb-3 self-start px-2 py-1 rounded-full"
                  style={{ background: 'rgba(163,166,255,0.2)', color: '#a3a6ff' }}>
                  Most Popular
                </span>
              )}
              <h2 className="text-lg font-bold mb-1" style={{ color: '#e8e2fc', fontFamily: 'Manrope, sans-serif' }}>{plan.name}</h2>
              <div className="mb-4">
                <span className="text-3xl font-bold" style={{ color: plan.popular ? '#a3a6ff' : '#e8e2fc' }}>{plan.price}</span>
                <span className="text-sm" style={{ color: '#77728a' }}>{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-center gap-2 text-sm" style={{ color: '#ada8c1' }}>
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#a3a6ff' }} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                    </svg>
                    {feat}
                  </li>
                ))}
              </ul>
              <a href="/register"
                className="block text-center py-3 rounded-xl font-semibold text-sm min-h-[44px] leading-[44px] transition-all"
                style={plan.popular
                  ? { background: '#a3a6ff', color: '#0e0c1e', boxShadow: '0 0 15px rgba(163,166,255,0.3)' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8e2fc' }
                }>
                {plan.name === 'Custom' ? 'Contact Sales' : `Select ${plan.name}`}
              </a>
            </article>
          ))}
        </div>

        <section className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: '#e8e2fc', fontFamily: 'Manrope, sans-serif' }}>Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ color: '#ada8c1' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th className="text-left py-3">Feature</th>
                  {plans.slice(0, 4).map(p => <th key={p.name} className="text-center py-3" style={{ color: '#e8e2fc' }}>{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}><td className="py-3">Storage</td>{plans.slice(0,4).map(p => <td key={p.name} className="text-center">{p.storage}</td>)}</tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}><td className="py-3">Galleries</td>{plans.slice(0,4).map(p => <td key={p.name} className="text-center">{p.galleries}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: '#e8e2fc', fontFamily: 'Manrope, sans-serif' }}>Storage Add-Ons</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {['50 GB Boost - ₹299/mo', '200 GB Boost - ₹999/mo', '1 TB Boost - ₹2,999/mo'].map(addon => (
              <div key={addon} className="p-4 rounded-xl text-center text-sm"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#ada8c1' }}>
                {addon}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: '#e8e2fc', fontFamily: 'Manrope, sans-serif' }}>Frequently Asked Questions</h2>
          <details className="p-4 mb-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <summary className="font-medium cursor-pointer" style={{ color: '#e8e2fc' }}>Can I switch plans later?</summary>
            <p className="mt-2 text-sm" style={{ color: '#ada8c1' }}>Yes, upgrade or downgrade anytime. Changes take effect immediately.</p>
          </details>
          <details className="p-4 mb-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <summary className="font-medium cursor-pointer" style={{ color: '#e8e2fc' }}>Is GST included?</summary>
            <p className="mt-2 text-sm" style={{ color: '#ada8c1' }}>All prices are inclusive of 18% GST.</p>
          </details>
        </section>
      </div>
    </main>
  )
}
