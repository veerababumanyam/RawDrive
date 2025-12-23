/**
 * Integration Tests: Coordinate Workflow
 *
 * Tests the GPS coordinate input and map URL generation:
 * 1. Coordinate validation (latitude/longitude ranges)
 * 2. Map URL generation with coordinate priority
 * 3. ProfileCard location link behavior
 *
 * Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7, 9.8, 9.11, 9.12
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import {
  generateMapUrl,
  validateCoordinates,
  type AddressWithCoordinates,
} from '../../../../utils/themeTransformer';
import { ProfileCard } from '../ProfileCard';

// =============================================================================
// Test Setup
// =============================================================================

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HelmetProvider>{children}</HelmetProvider>
);

// =============================================================================
// Coordinate Validation Tests
// =============================================================================

describe('Coordinate Validation', () => {
  describe('validateCoordinates', () => {
    it('validates correct coordinates', () => {
      const result = validateCoordinates(37.7749, -122.4194); // San Francisco
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates edge case coordinates (poles, date line)', () => {
      // North pole
      expect(validateCoordinates(90, 0).valid).toBe(true);
      // South pole
      expect(validateCoordinates(-90, 0).valid).toBe(true);
      // Date line
      expect(validateCoordinates(0, 180).valid).toBe(true);
      expect(validateCoordinates(0, -180).valid).toBe(true);
    });

    it('rejects latitude outside range [-90, 90]', () => {
      const tooHigh = validateCoordinates(91, 0);
      expect(tooHigh.valid).toBe(false);
      expect(tooHigh.errors).toContain('Latitude must be between -90 and 90');

      const tooLow = validateCoordinates(-91, 0);
      expect(tooLow.valid).toBe(false);
      expect(tooLow.errors).toContain('Latitude must be between -90 and 90');
    });

    it('rejects longitude outside range [-180, 180]', () => {
      const tooHigh = validateCoordinates(0, 181);
      expect(tooHigh.valid).toBe(false);
      expect(tooHigh.errors).toContain('Longitude must be between -180 and 180');

      const tooLow = validateCoordinates(0, -181);
      expect(tooLow.valid).toBe(false);
      expect(tooLow.errors).toContain('Longitude must be between -180 and 180');
    });

    it('returns multiple errors when both coordinates are invalid', () => {
      const result = validateCoordinates(100, 200);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('Latitude must be between -90 and 90');
      expect(result.errors).toContain('Longitude must be between -180 and 180');
    });

    it('handles undefined values gracefully', () => {
      expect(validateCoordinates(undefined, undefined).valid).toBe(true);
      expect(validateCoordinates(37.7749, undefined).valid).toBe(true);
      expect(validateCoordinates(undefined, -122.4194).valid).toBe(true);
    });
  });
});

// =============================================================================
// Map URL Generation Tests
// =============================================================================

describe('Map URL Generation', () => {
  describe('generateMapUrl', () => {
    it('returns null for null/undefined address', () => {
      expect(generateMapUrl(null)).toBeNull();
      expect(generateMapUrl(undefined)).toBeNull();
    });

    it('returns null for empty address', () => {
      expect(generateMapUrl({})).toBeNull();
    });

    it('prioritizes coordinates over text address', () => {
      const address: AddressWithCoordinates = {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'USA',
        latitude: 37.7749,
        longitude: -122.4194,
      };

      const url = generateMapUrl(address);

      // Should use coordinate-based URL
      expect(url).toContain('q=37.7749,-122.4194');
      // Should NOT contain address text
      expect(url).not.toContain('123+Main+St');
    });

    it('falls back to text address when no coordinates', () => {
      const address: AddressWithCoordinates = {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94102',
        country: 'USA',
      };

      const url = generateMapUrl(address);

      // Should use search-based URL
      expect(url).toContain('maps/search/');
      expect(url).toContain('query=');
      // Should contain encoded address
      expect(url).toContain(encodeURIComponent('123 Main St'));
    });

    it('ignores invalid coordinates and falls back to text', () => {
      const address: AddressWithCoordinates = {
        line1: '123 Main St',
        city: 'San Francisco',
        latitude: 91, // Invalid
        longitude: 0,
      };

      const url = generateMapUrl(address);

      // Should fall back to text address
      expect(url).not.toContain('q=91');
      expect(url).toContain('maps/search/');
    });

    it('handles addresses with only city', () => {
      const address: AddressWithCoordinates = {
        city: 'San Francisco',
        state: 'CA',
      };

      const url = generateMapUrl(address);

      expect(url).toContain(encodeURIComponent('San Francisco'));
    });

    it('uses coordinates with high precision', () => {
      const address: AddressWithCoordinates = {
        latitude: 37.774929,
        longitude: -122.419418,
      };

      const url = generateMapUrl(address);

      expect(url).toBe('https://www.google.com/maps?q=37.774929,-122.419418');
    });
  });
});

// =============================================================================
// ProfileCard Location Integration Tests
// =============================================================================

describe('ProfileCard Location Integration', () => {
  const baseProfile = {
    name: 'Test Company',
    email: 'test@example.com',
    address_structured: {
      line1: '123 Main Street',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94102',
      country: 'USA',
    },
  };

  it('renders location with text address as clickable link using search URL', () => {
    render(
      <TestWrapper>
        <ProfileCard
          profile={baseProfile}
          visibility={{ address: true }}
        />
      </TestWrapper>
    );

    // Should show address text (using regex for flexibility with rendering)
    expect(screen.getByText(/123 Main Street/)).toBeInTheDocument();
    expect(screen.getByText(/San Francisco/)).toBeInTheDocument();

    // Should have a link using search URL (text-based)
    const locationLink = screen.getByRole('link', { name: /open location in google maps/i });
    expect(locationLink).toBeInTheDocument();
    expect(locationLink.getAttribute('href')).toContain('maps/search/');
  });

  it('renders location with coordinates using coordinate-based URL', () => {
    const profileWithCoords = {
      ...baseProfile,
      address_structured: {
        ...baseProfile.address_structured,
        latitude: 37.7749,
        longitude: -122.4194,
      },
    };

    render(
      <TestWrapper>
        <ProfileCard
          profile={profileWithCoords}
          visibility={{ address: true }}
        />
      </TestWrapper>
    );

    // Should have a link with aria-label
    const locationLink = screen.getByRole('link', { name: /open location in google maps/i });
    expect(locationLink).toBeInTheDocument();

    // Link should use coordinate URL (not search URL)
    expect(locationLink).toHaveAttribute('href', 'https://www.google.com/maps?q=37.7749,-122.4194');
  });

  it('displays human-readable address, not raw coordinates', () => {
    const profileWithCoords = {
      ...baseProfile,
      address_structured: {
        ...baseProfile.address_structured,
        latitude: 37.7749,
        longitude: -122.4194,
      },
    };

    render(
      <TestWrapper>
        <ProfileCard
          profile={profileWithCoords}
          visibility={{ address: true }}
        />
      </TestWrapper>
    );

    // Should show human-readable address (using regex for flexibility with rendering)
    expect(screen.getByText(/123 Main Street/)).toBeInTheDocument();
    expect(screen.getByText(/San Francisco/)).toBeInTheDocument();

    // Should NOT display raw coordinates
    expect(screen.queryByText('37.7749')).not.toBeInTheDocument();
    expect(screen.queryByText('-122.4194')).not.toBeInTheDocument();
  });

  it('hides address when visibility is false', () => {
    const profileWithCoords = {
      ...baseProfile,
      address_structured: {
        ...baseProfile.address_structured,
        latitude: 37.7749,
        longitude: -122.4194,
      },
    };

    render(
      <TestWrapper>
        <ProfileCard
          profile={profileWithCoords}
          visibility={{ address: false }}
        />
      </TestWrapper>
    );

    // Address should not be visible
    expect(screen.queryByText('123 Main Street')).not.toBeInTheDocument();
  });

  it('opens link in new tab with correct attributes', () => {
    const profileWithCoords = {
      ...baseProfile,
      address_structured: {
        ...baseProfile.address_structured,
        latitude: 37.7749,
        longitude: -122.4194,
      },
    };

    render(
      <TestWrapper>
        <ProfileCard
          profile={profileWithCoords}
          visibility={{ address: true }}
        />
      </TestWrapper>
    );

    const locationLink = screen.getByRole('link', { name: /open location in google maps/i });

    // Should open in new tab
    expect(locationLink).toHaveAttribute('target', '_blank');
    // Should have security attributes
    expect(locationLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

// =============================================================================
// Coordinate Display Privacy Tests
// =============================================================================

describe('Coordinate Display Privacy', () => {
  it('never exposes raw coordinates in UI text content', () => {
    const profile = {
      name: 'Test Company',
      email: 'test@example.com',
      address_structured: {
        line1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        latitude: 37.7749,
        longitude: -122.4194,
      },
    };

    const { container } = render(
      <TestWrapper>
        <ProfileCard
          profile={profile}
          visibility={{ address: true }}
        />
      </TestWrapper>
    );

    // Get all visible text content (not href attributes)
    const textContent = container.textContent || '';

    // Raw coordinates should NOT appear in text content
    expect(textContent).not.toMatch(/37\.7749/);
    expect(textContent).not.toMatch(/-122\.4194/);

    // But the address text SHOULD appear
    expect(textContent).toContain('123 Main St');
    expect(textContent).toContain('San Francisco');
  });

  it('uses coordinates in href but not in visible text', () => {
    const profile = {
      name: 'Test Company',
      email: 'test@example.com',
      address_structured: {
        line1: '456 Oak Ave',
        city: 'New York',
        state: 'NY',
        latitude: 40.7128,
        longitude: -74.006,
      },
    };

    render(
      <TestWrapper>
        <ProfileCard
          profile={profile}
          visibility={{ address: true }}
        />
      </TestWrapper>
    );

    // The link should have coordinates in href
    const locationLink = screen.getByRole('link', { name: /open location in google maps/i });
    expect(locationLink.getAttribute('href')).toContain('40.7128,-74.006');

    // The visible text should show address, not coordinates
    expect(screen.getByText(/456 Oak Ave/)).toBeInTheDocument();
    expect(screen.getByText(/New York/)).toBeInTheDocument();
    // Coordinates should not be in visible text
    expect(screen.queryByText('40.7128')).not.toBeInTheDocument();
  });
});
