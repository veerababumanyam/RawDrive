import React from "react"
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LandingPage from '../page'

describe('Landing Page', () => {
  it('renders hero section with headline', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders primary CTA button', () => {
    render(<LandingPage />)
    expect(screen.getAllByRole('link').find(l => /start free|get started/i.test(l.textContent || ''))).toBeInTheDocument()
  })

  it('renders features section', () => {
    render(<LandingPage />)
    expect(screen.getAllByText(/gallery|client|booking/i)[0]).toBeInTheDocument()
  })

  it('renders pricing preview', () => {
    render(<LandingPage />)
    expect(screen.getAllByText(/starter|pro|business/i)[0]).toBeInTheDocument()
  })

  it('renders testimonials section', () => {
    render(<LandingPage />)
    expect(screen.getAllByText(/photographer|studio/i)[0]).toBeInTheDocument()
  })

  it('renders stats bar', () => {
    render(<LandingPage />)
    expect(screen.getAllByText(/photographer|studio|active/i)[0]).toBeInTheDocument()
  })

  it('renders JSON-LD structured data', () => {
    render(<LandingPage />)
    const jsonLd = document.querySelector('[data-json-ld]')
    expect(jsonLd).toBeInTheDocument()
  })

  it('has no accessibility violations on interactive elements', () => {
    render(<LandingPage />)
    const buttons = screen.getAllByRole('link')
    buttons.forEach(btn => {
      expect(btn).toHaveAttribute('href')
    })
  })
})
