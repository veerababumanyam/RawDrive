import React from "react"
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RegisterPage from '../page'

describe('Register Page', () => {
  it('renders registration form', () => {
    render(<RegisterPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
  })

  it('renders terms checkbox', () => {
    render(<RegisterPage />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('renders Google OAuth button', () => {
    render(<RegisterPage />)
    expect(screen.getByRole('button', { name: /google|sign up with/i })).toBeInTheDocument()
  })

  it('renders link to login', () => {
    render(<RegisterPage />)
    expect(screen.getByRole('link', { name: /login|sign in|already have/i })).toBeInTheDocument()
  })

  it('renders submit button', () => {
    render(<RegisterPage />)
    expect(screen.getAllByRole('button').find(b => /create|register|sign up/i.test(b.textContent || ''))).toBeInTheDocument()
  })

  it('renders logo', () => {
    render(<RegisterPage />)
    expect(screen.getAllByText(/rawdrive/i)[0]).toBeTruthy()
  })
})
