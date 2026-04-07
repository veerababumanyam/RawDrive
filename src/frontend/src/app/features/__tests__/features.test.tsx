import React from "react"
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FeaturesPage from '../page'

describe('Features Page', () => {
  it('renders page heading', () => {
    render(<FeaturesPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders feature sections', () => {
    render(<FeaturesPage />)
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.length).toBeGreaterThanOrEqual(4)
  })

  it('renders gallery management section', () => {
    render(<FeaturesPage />)
    expect(screen.getAllByText(/gallery|portfolio/i)[0]).toBeInTheDocument()
  })

  it('renders client experience section', () => {
    render(<FeaturesPage />)
    expect(screen.getAllByText(/client|proofing|selection/i)[0]).toBeInTheDocument()
  })

  it('renders business tools section', () => {
    render(<FeaturesPage />)
    expect(screen.getAllByText(/invoice|booking|contract|business/i)[0]).toBeInTheDocument()
  })

  it('renders CTA section', () => {
    render(<FeaturesPage />)
    expect(screen.getByRole('link', { name: /start|get started|try/i })).toBeInTheDocument()
  })

  it('uses anchor links for navigation', () => {
    render(<FeaturesPage />)
    const sections = document.querySelectorAll('[id]')
    expect(sections.length).toBeGreaterThan(0)
  })

  it('renders feature icons', () => {
    const { container } = render(<FeaturesPage />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })
})
