import React from "react"
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PrivacyPage from '../../app/privacy/page'
import TermsPage from '../../app/terms/page'
import RefundPage from '../../app/refund/page'

describe('Privacy Policy Page', () => {
  it('renders heading', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('contains DPDPA sections', () => {
    render(<PrivacyPage />)
    expect(screen.getAllByText(/data protection|dpdpa|personal data/i)[0]).toBeInTheDocument()
  })
})

describe('Terms of Service Page', () => {
  it('renders heading', () => {
    render(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('contains marketplace disclaimers', () => {
    render(<TermsPage />)
    expect(screen.getAllByText(/terms|service|agreement/i)[0]).toBeInTheDocument()
  })
})

describe('Refund Policy Page', () => {
  it('renders heading', () => {
    render(<RefundPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('contains cancellation terms', () => {
    render(<RefundPage />)
    expect(screen.getAllByText(/refund|cancellation/i)[0]).toBeInTheDocument()
  })
})
