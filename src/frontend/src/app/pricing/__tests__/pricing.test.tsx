import React from "react"
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PricingPage from '../page'

describe('Pricing Page', () => {
  it('renders page heading', () => {
    render(<PricingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders all plan tiers', () => {
    render(<PricingPage />)
    expect(screen.getAllByText(/starter/i)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/pro/i)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/business/i)[0]).toBeInTheDocument()
  })

  it('shows INR pricing', () => {
    render(<PricingPage />)
    expect(screen.getAllByText(/₹|month/i)[0]).toBeInTheDocument()
  })

  it('renders billing toggle', () => {
    render(<PricingPage />)
    expect(screen.getByRole('switch')).toBeTruthy()
  })

  it('renders feature comparison', () => {
    render(<PricingPage />)
    expect(screen.getAllByText(/storage|galleries/i)[0]).toBeInTheDocument()
  })

  it('highlights popular plan', () => {
    render(<PricingPage />)
    expect(screen.getByText(/popular|recommended/i)).toBeInTheDocument()
  })

  it('renders CTA buttons on each plan', () => {
    render(<PricingPage />)
    const ctas = screen.getAllByRole('link', { name: /get started|choose|select/i })
    expect(ctas.length).toBeGreaterThanOrEqual(3)
  })

  it('renders FAQ section', () => {
    render(<PricingPage />)
    expect(screen.getByText(/faq|question|frequently/i)).toBeInTheDocument()
  })

  it('renders add-on cards', () => {
    render(<PricingPage />)
    expect(screen.getAllByText(/boost|add-on|storage/i)[0]).toBeInTheDocument()
  })

  it('has accessible plan cards', () => {
    render(<PricingPage />)
    const cards = screen.getAllByRole('article') || screen.getAllByRole('region')
    expect(cards.length).toBeGreaterThanOrEqual(3)
  })
})
