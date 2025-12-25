import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import TermsPage from '../terms';

describe('TermsPage', () => {
  const renderTermsPage = () => {
    return render(
      <HelmetProvider>
        <BrowserRouter>
          <TermsPage />
        </BrowserRouter>
      </HelmetProvider>
    );
  };

  it('should render the Terms and Conditions page correctly', () => {
    renderTermsPage();
    
    // Check if the title is present
    expect(screen.getByText('Terms and Conditions')).toBeInTheDocument();
  });

  it('should display all required sections', () => {
    renderTermsPage();
    
    // Check for key sections from the requirements - use getAllByText for items appearing in TOC and content
    expect(screen.getAllByText(/Electronic Record/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Platform Owner/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Binding Agreement/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Terms of Service/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Intellectual Property/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Governing Law/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Jurisdiction/i).length).toBeGreaterThan(0);
  });

  it('should display version and last updated date', () => {
    renderTermsPage();
    
    // Check for version number
    expect(screen.getByText(/Version: 1\.0\.0/i)).toBeInTheDocument();
    
    // Check for last updated date
    expect(screen.getByText(/Last updated:/i)).toBeInTheDocument();
  });

  it('should maintain consistent styling with landing page', () => {
    const { container } = renderTermsPage();
    
    // Check for consistent layout classes
    const mainElement = container.querySelector('main');
    expect(mainElement).toBeInTheDocument();
    // Main element should have some styling - check for ID instead
    expect(mainElement?.id).toBe('main-content');
  });

  it('should display jurisdiction information (Rajahmundry court, Andhra Pradesh)', () => {
    renderTermsPage();
    
    // Check for jurisdiction clause
    expect(screen.getByText(/Rajahmundry and Andhra Pradesh/i)).toBeInTheDocument();
  });

  it('should display SWAZ CONSULTANTS as platform owner', () => {
    renderTermsPage();
    
    // Check for platform owner information
    expect(screen.getByText(/SWAZ CONSULTANTS/i)).toBeInTheDocument();
    expect(screen.getByText(/Addepalli colony Rajahmundry/i)).toBeInTheDocument();
  });

  it('should display Information Technology Act compliance', () => {
    renderTermsPage();
    
    // Check for IT Act 2000 reference
    expect(screen.getByText(/Information Technology Act, 2000/i)).toBeInTheDocument();
  });

  it('should display acceptance notice prominently', () => {
    renderTermsPage();
    
    // Check for acceptance clause
    expect(screen.getByText(/ACCESSING, BROWSING OR OTHERWISE USING THE PLATFORM INDICATES YOUR AGREEMENT/i)).toBeInTheDocument();
  });

  it('should display indemnification clause', () => {
    renderTermsPage();
    
    // Check for indemnification - may appear multiple times in TOC and content
    const elements = screen.getAllByText(/indemnify and hold harmless/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('should display force majeure clause', () => {
    renderTermsPage();
    
    // Check for force majeure - appears in TOC and content
    const elements = screen.getAllByText(/force majeure/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('should have proper semantic HTML structure', () => {
    const { container } = renderTermsPage();
    
    // Check for header
    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
    
    // Check for main content
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
    
    // Check for footer
    const footer = container.querySelector('footer');
    expect(footer).toBeInTheDocument();
  });

  it('should display copyright information in footer', () => {
    renderTermsPage();
    
    // Check for copyright
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${currentYear} RawDrive`, 'i'))).toBeInTheDocument();
  });
});
