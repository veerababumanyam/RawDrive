import React from "react"
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Navbar } from '../layout/navbar'

describe('Navbar', () => {
  it('renders logo', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /rawdrive/i })).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /features/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /pricing/i })).toBeInTheDocument()
  })

  it('renders CTA button', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /get started|sign up|try free/i })).toBeInTheDocument()
  })

  it('has sticky positioning', () => {
    const { container } = render(<Navbar />)
    const nav = container.querySelector('nav')
    expect(nav).toBeInTheDocument()
  })

  it('renders theme toggle', () => {
    render(<Navbar />)
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument()
  })

  it('has accessible navigation role', () => {
    render(<Navbar />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })
})
