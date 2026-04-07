import React from "react"
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage from '../page'

describe('Login Page', () => {
  it('renders login form', () => {
    render(<LoginPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
  })

  it('renders Google OAuth button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /google|sign in with/i })).toBeInTheDocument()
  })

  it('renders magic link option', () => {
    render(<LoginPage />)
    expect(screen.getByText(/magic link|passwordless/i)).toBeInTheDocument()
  })

  it('renders link to register', () => {
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: /register|sign up|create account/i })).toBeInTheDocument()
  })

  it('renders OTP input when requested', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /send|otp|continue/i })).toBeInTheDocument()
  })

  it('renders welcome heading', () => {
    render(<LoginPage />)
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument()
  })
})
