import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import PrivacyPage from '../privacy';

// Helper to wrap component with all required providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <HelmetProvider>
      <BrowserRouter>{ui}</BrowserRouter>
    </HelmetProvider>
  );
};

describe('PrivacyPage', () => {
  it('should render the Privacy Policy page correctly', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for page title - appears multiple times (title, h1, navigation)
    expect(screen.getAllByText(/Privacy Policy/i).length).toBeGreaterThan(0);
  });

  it('should display all required sections', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for key sections from the requirements by checking headings
    const headings = document.querySelectorAll('h2');
    const headingTexts = Array.from(headings).map(h => h.textContent);
    
    expect(headingTexts).toContain('Introduction');
    expect(headingTexts).toContain('Collection of Information');
    expect(headingTexts).toContain('Usage of Information');
    expect(headingTexts).toContain('Sharing of Information');
    expect(headingTexts).toContain('Security Precautions');
    expect(headingTexts).toContain('Data Deletion and Retention');
    expect(headingTexts).toContain('Your Rights');
    expect(headingTexts).toContain('Consent');
    expect(headingTexts).toContain('Changes to this Privacy Policy');
    expect(headingTexts).toContain('Grievance Officer');
  });

  it('should display version and last updated date', () => {
    renderWithProviders(<PrivacyPage />);

    expect(screen.getByText(/Version:/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/i)).toBeInTheDocument();
  });

  it('should maintain consistent styling with landing page', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for consistent layout classes
    expect(document.querySelector('.min-h-screen')).toBeInTheDocument();
    expect(document.querySelector('header')).toBeInTheDocument();
    expect(document.querySelector('main')).toBeInTheDocument();
    expect(document.querySelector('footer')).toBeInTheDocument();
  });

  it('should display data collection practices', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for data collection information
    expect(screen.getByText(/personal data\/information provided to us/i)).toBeInTheDocument();
    expect(screen.getByText(/Bank account or credit or debit card/i)).toBeInTheDocument();
  });

  it('should display data usage purposes', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for usage purposes
    expect(screen.getByText(/Enhance customer experience/i)).toBeInTheDocument();
    expect(screen.getByText(/Detect and protect us against error, fraud/i)).toBeInTheDocument();
  });

  it('should display data retention policy', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for retention policy
    expect(screen.getByText(/retain your personal data information for a period/i)).toBeInTheDocument();
    expect(screen.getByText(/delete your account/i)).toBeInTheDocument();
  });

  it('should display user rights information', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for user rights
    expect(screen.getByText(/access, rectify, and update your personal data/i)).toBeInTheDocument();
  });

  it('should display SWAZ CONSULTANTS as platform owner', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for platform owner - use getAllByText since it appears multiple times
    const swazElements = screen.getAllByText(/SWAZ CONSULTANTS/i);
    expect(swazElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/Addepalli Colony, Rajahmundry/i)).toBeInTheDocument();
  });

  it('should display Information Technology Act compliance', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for IT Act compliance
    expect(screen.getByText(/laws of India/i)).toBeInTheDocument();
    expect(screen.getByText(/data protection and privacy/i)).toBeInTheDocument();
  });

  it('should display security measures', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for security information
    expect(screen.getByText(/reasonable security practices and procedures/i)).toBeInTheDocument();
    expect(screen.getByText(/protect your personal data from unauthorised access/i)).toBeInTheDocument();
  });

  it('should display consent withdrawal information', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for consent withdrawal - use getAllByText since it appears multiple times
    const withdrawalElements = screen.getAllByText(/Withdrawal of Consent/i);
    expect(withdrawalElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/withdraw your consent/i)).toBeInTheDocument();
  });

  it('should display grievance officer contact information', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for grievance officer - use getAllByText since it appears multiple times
    const grievanceElements = screen.getAllByText(/Grievance Officer/i);
    expect(grievanceElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/54-05-10 Revenue Ward No 28/i)).toBeInTheDocument();
    expect(screen.getByText(/Andhra Pradesh, India/i)).toBeInTheDocument();
  });

  it('should have proper semantic HTML structure', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for semantic HTML elements
    expect(document.querySelector('header')).toBeInTheDocument();
    expect(document.querySelector('main')).toBeInTheDocument();
    expect(document.querySelector('footer')).toBeInTheDocument();
    expect(document.querySelector('article')).toBeInTheDocument();
  });

  it('should display copyright information in footer', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for copyright
    expect(screen.getByText(/RawDrive\. All rights reserved\./i)).toBeInTheDocument();
  });

  it('should display third-party data sharing information', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for third-party sharing
    expect(screen.getByText(/share your personal data internally/i)).toBeInTheDocument();
    expect(screen.getByText(/third parties such as/i)).toBeInTheDocument();
  });

  it('should display data protection notice', () => {
    renderWithProviders(<PrivacyPage />);

    // Check for important security notice
    expect(screen.getByText(/Important Security Notice/i)).toBeInTheDocument();
    expect(screen.getByText(/never provide such information/i)).toBeInTheDocument();
  });
});
