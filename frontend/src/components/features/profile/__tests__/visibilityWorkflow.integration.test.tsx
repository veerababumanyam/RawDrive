/**
 * Integration Tests: Visibility Workflow
 *
 * Tests the visibility toggle behavior:
 * 1. Field visibility toggles
 * 2. Social platform visibility
 * 3. Secondary contact visibility
 *
 * Requirements: 1.4, 11.5, 12.3, 12.4
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { ProfileCard } from '../ProfileCard';
import type { CompanyProfile, CompanyVisibilityConfig } from '../../../../types/companyProfile';

// =============================================================================
// Test Setup
// =============================================================================

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HelmetProvider>{children}</HelmetProvider>
);

// Full mock profile with all fields
const fullProfile: Partial<CompanyProfile> = {
  name: 'Test Company',
  tagline: 'Building the future',
  email: 'contact@test.com',
  phone: '+1-555-0100',
  website: 'https://test.com',
  secondary_emails: [
    { value: 'sales@test.com', label: 'Sales' },
    { value: 'support@test.com', label: 'Support' },
  ],
  secondary_phones: [
    { value: '+1-555-0101', label: 'Sales Line' },
    { value: '+1-555-0102', label: 'Support Line' },
  ],
  address_structured: {
    line1: '123 Main Street',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94102',
    country: 'USA',
  },
  socials: {
    instagram: 'https://instagram.com/testco',
    facebook: 'https://facebook.com/testco',
    twitter: 'https://twitter.com/testco',
    linkedin: 'https://linkedin.com/company/testco',
    youtube: 'https://youtube.com/@testco',
    tiktok: 'https://tiktok.com/@testco',
    whatsapp: 'https://wa.me/15550100',
    pinterest: 'https://pinterest.com/testco',
    behance: 'https://behance.net/testco',
    dribbble: 'https://dribbble.com/testco',
  },
  custom_links: [
    { label: 'Portfolio', url: 'https://portfolio.test.com' },
    { label: 'Blog', url: 'https://blog.test.com' },
  ],
};

// All visible by default
const allVisible: Partial<CompanyVisibilityConfig> = {
  name: true,
  tagline: true,
  email: true,
  phone: true,
  website: true,
  address: true,
  socials_instagram: true,
  socials_facebook: true,
  socials_twitter: true,
  socials_linkedin: true,
  socials_youtube: true,
  socials_tiktok: true,
  socials_whatsapp: true,
  socials_pinterest: true,
  socials_behance: true,
  socials_dribbble: true,
  custom_links: true,
  secondary_email_1: true,
  secondary_email_2: true,
  secondary_phone_1: true,
  secondary_phone_2: true,
  qr_code: true,
  vcard: true,
};

// =============================================================================
// Primary Field Visibility Tests
// =============================================================================

describe('Visibility Workflow Integration', () => {
  describe('Primary Field Visibility', () => {
    it('shows all fields when visibility is true', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={allVisible}
          />
        </TestWrapper>
      );

      expect(screen.getByText('Test Company')).toBeInTheDocument();
      expect(screen.getByText('Building the future')).toBeInTheDocument();
      expect(screen.getByText('contact@test.com')).toBeInTheDocument();
      expect(screen.getByText('+1-555-0100')).toBeInTheDocument();
      expect(screen.getByText('test.com')).toBeInTheDocument();
      // Address is in the DOM, verify with getAllByText since city appears with state
      expect(screen.getByText(/123 Main Street/)).toBeInTheDocument();
    });

    it('hides name when visibility.name is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, name: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('Test Company')).not.toBeInTheDocument();
      // Other fields should still be visible
      expect(screen.getByText('Building the future')).toBeInTheDocument();
    });

    it('hides tagline when visibility.tagline is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, tagline: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('Building the future')).not.toBeInTheDocument();
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    });

    it('hides email when visibility.email is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, email: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('contact@test.com')).not.toBeInTheDocument();
    });

    it('hides phone when visibility.phone is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, phone: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('+1-555-0100')).not.toBeInTheDocument();
    });

    it('hides website when visibility.website is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, website: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('test.com')).not.toBeInTheDocument();
    });

    it('hides address when visibility.address is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, address: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('123 Main Street')).not.toBeInTheDocument();
    });
  });

  describe('Secondary Contact Visibility', () => {
    it('shows secondary emails when visibility is true', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={allVisible}
          />
        </TestWrapper>
      );

      expect(screen.getByText('sales@test.com')).toBeInTheDocument();
      expect(screen.getByText('support@test.com')).toBeInTheDocument();
    });

    it('hides first secondary email when visibility is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, secondary_email_1: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('sales@test.com')).not.toBeInTheDocument();
      expect(screen.getByText('support@test.com')).toBeInTheDocument();
    });

    it('hides second secondary email when visibility is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, secondary_email_2: false }}
          />
        </TestWrapper>
      );

      expect(screen.getByText('sales@test.com')).toBeInTheDocument();
      expect(screen.queryByText('support@test.com')).not.toBeInTheDocument();
    });

    it('shows secondary phones when visibility is true', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={allVisible}
          />
        </TestWrapper>
      );

      expect(screen.getByText('+1-555-0101')).toBeInTheDocument();
      expect(screen.getByText('+1-555-0102')).toBeInTheDocument();
    });

    it('hides secondary phones when visibility is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{
              ...allVisible,
              secondary_phone_1: false,
              secondary_phone_2: false,
            }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('+1-555-0101')).not.toBeInTheDocument();
      expect(screen.queryByText('+1-555-0102')).not.toBeInTheDocument();
    });

    it('displays custom labels for secondary contacts', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={allVisible}
          />
        </TestWrapper>
      );

      expect(screen.getByText('Sales')).toBeInTheDocument();
      expect(screen.getByText('Support')).toBeInTheDocument();
      expect(screen.getByText('Sales Line')).toBeInTheDocument();
      expect(screen.getByText('Support Line')).toBeInTheDocument();
    });
  });

  describe('Social Platform Visibility', () => {
    it('shows all social icons when visibility is true', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={allVisible}
          />
        </TestWrapper>
      );

      // Check for social links by aria-label
      expect(screen.getByRole('link', { name: /visit instagram/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit facebook/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit twitter/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit linkedin/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit youtube/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit tiktok/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit whatsapp/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit pinterest/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit behance/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /visit dribbble/i })).toBeInTheDocument();
    });

    it('hides Instagram when visibility is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, socials_instagram: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByRole('link', { name: /visit instagram/i })).not.toBeInTheDocument();
      // Others should still be visible
      expect(screen.getByRole('link', { name: /visit facebook/i })).toBeInTheDocument();
    });

    it('hides multiple social platforms when visibility is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{
              ...allVisible,
              socials_instagram: false,
              socials_tiktok: false,
              socials_youtube: false,
            }}
          />
        </TestWrapper>
      );

      expect(screen.queryByRole('link', { name: /visit instagram/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /visit tiktok/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /visit youtube/i })).not.toBeInTheDocument();
      // Others should be visible
      expect(screen.getByRole('link', { name: /visit facebook/i })).toBeInTheDocument();
    });

    it('hides all social section when no socials are visible', () => {
      const noSocials: Partial<CompanyVisibilityConfig> = {
        ...allVisible,
        socials_instagram: false,
        socials_facebook: false,
        socials_twitter: false,
        socials_linkedin: false,
        socials_youtube: false,
        socials_tiktok: false,
        socials_whatsapp: false,
        socials_pinterest: false,
        socials_behance: false,
        socials_dribbble: false,
        custom_links: false,
      };

      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={noSocials}
          />
        </TestWrapper>
      );

      // Check that none of the social platform links exist by aria-label
      expect(screen.queryByRole('link', { name: /visit instagram/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /visit facebook/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /visit twitter/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /visit youtube/i })).not.toBeInTheDocument();

      // Custom links should also be hidden
      expect(screen.queryByText('Portfolio')).not.toBeInTheDocument();
      expect(screen.queryByText('Blog')).not.toBeInTheDocument();
    });
  });

  describe('Custom Links Visibility', () => {
    it('shows custom links when visibility is true', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={allVisible}
          />
        </TestWrapper>
      );

      expect(screen.getByText('Portfolio')).toBeInTheDocument();
      expect(screen.getByText('Blog')).toBeInTheDocument();
    });

    it('hides custom links when visibility is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, custom_links: false }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('Portfolio')).not.toBeInTheDocument();
      expect(screen.queryByText('Blog')).not.toBeInTheDocument();
    });
  });

  describe('QR Code Visibility', () => {
    const mockQrUrl = 'data:image/png;base64,mock-qr-code';

    it('shows QR code when visibility is true and URL provided', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, qr_code: true }}
            qrCodeUrl={mockQrUrl}
          />
        </TestWrapper>
      );

      expect(screen.getByAltText('Scan to connect')).toBeInTheDocument();
    });

    it('hides QR code when visibility is false', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{ ...allVisible, qr_code: false }}
            qrCodeUrl={mockQrUrl}
          />
        </TestWrapper>
      );

      expect(screen.queryByAltText('Scan to connect')).not.toBeInTheDocument();
    });
  });

  describe('Visibility Filtering Consistency', () => {
    it('shows fields when visibility config is empty (defaults to visible)', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{}}
          />
        </TestWrapper>
      );

      // All fields should be visible by default
      expect(screen.getByText('Test Company')).toBeInTheDocument();
      expect(screen.getByText('contact@test.com')).toBeInTheDocument();
    });

    it('maintains visibility state correctly with partial config', () => {
      render(
        <TestWrapper>
          <ProfileCard
            profile={fullProfile}
            visibility={{
              email: false,
              phone: true,
              // Others default to visible
            }}
          />
        </TestWrapper>
      );

      expect(screen.queryByText('contact@test.com')).not.toBeInTheDocument();
      expect(screen.getByText('+1-555-0100')).toBeInTheDocument();
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    });
  });
});
