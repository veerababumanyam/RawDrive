import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import TermsPage from '../terms';

describe('TermsPage', () => {
  const renderTermsPage = () => {
    return render(
      <BrowserRouter>
        <TermsPage />
      </BrowserRouter>
    );
  };

  it('should render the Terms and Conditions page correctly', () => {
    renderTermsPage();
    
    // Check if the title is present
    expect(screen.getByText('Terms and Conditions')).toBeInTheDocument();
  });

  it('should display all required sections', () => {
    renderTermsPage();
    
    // Check for key sections from the requirements
    expect(screen.getByText(/Electronic Record/i)).toBeInTheDocument();
    expect(screen.getByText(/Platform Owner/i)).toBeInTheDocument();
    expect(screen.getByText(/Binding Agreement/i)).toBeInTheDocument();
    expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument();
    expect(screen.getByText(/Intellectual Property/i)).toBeInTheDocument();
    expect(screen.getByText(/Governing Law/i)).toBeInTheDocument();
    expect(screen.getByText(/Jurisdiction/i)).toBeInTheDocument();
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
    expect(mainElement).toHaveClass('flex', 'flex-col');
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
    
    // Check for indemnification
    expect(screen.getByText(/indemnify and hold harmless/i)).toBeInTheDocument();
  });

  it('should display force majeure clause', () => {
    renderTermsPage();
    
    // Check for force majeure
    expect(screen.getByText(/force majeure/i)).toBeInTheDocument();
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
