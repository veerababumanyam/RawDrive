import React from 'react';
import { render } from '@testing-library/react';
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { MemoryRouter } from 'react-router-dom';
import HeroSection from '../components/landing/sections/HeroSection';

describe('HeroSection Components - Responsive Integrity', () => {
    it('Property 2: Responsive Layout Integrity - renders without crashing with various prop combinations', async () => {
        // This property test verifies that the component can handle arbitrary string inputs for text props
        // without crashing, effectively ensuring that the layout doesn't break simply due to content length.
        // Real visual responsiveness is handled by CSS, but this ensures structural integrity.

        await fc.assert(
            fc.asyncProperty(
                fc.string(),
                fc.string(),
                fc.string(),
                fc.string(),
                async (badge, subheadline, primaryCTA, secondaryCTA) => {
                    render(
                        <MemoryRouter>
                            <HeroSection
                                badge={badge}
                                subheadline={subheadline}
                                primaryCTA={primaryCTA}
                                secondaryCTA={secondaryCTA}
                            />
                        </MemoryRouter>
                    );
                    // implicit assertion: render does not throw
                }
            ),
            { numRuns: 10 } // Limit runs for component speed
        );
    });
});
