import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import TermsPage from '../terms';

describe('Terms Page - Property Test: Compliance with Indian Law', () => {
  const renderAndExtractText = (): string => {
    const { container } = render(
      <BrowserRouter>
        <TermsPage />
      </BrowserRouter>
    );
    return (container.textContent || '').toLowerCase();
  };

  it('should consistently reference IT Act 2000 compliance across 100 iterations', () => {
    const iterations = 100;
    const results: boolean[] = [];

    for (let i = 0; i < iterations; i++) {
      const pageText = renderAndExtractText();
      
      const hasITAct = pageText.includes('information technology act');
      const hasElectronicRecord = pageText.includes('electronic record');
      const hasIntermediariesGuidelines = pageText.includes('intermediaries guidelines');
      
      results.push(hasITAct && hasElectronicRecord && hasIntermediariesGuidelines);
    }

    const passRate = results.filter(r => r).length / iterations;
    expect(passRate).toBe(1.0);
  });

  it('should consistently include consumer protection clauses across 100 iterations', () => {
    const iterations = 100;
    const results: boolean[] = [];

    for (let i = 0; i < iterations; i++) {
      const pageText = renderAndExtractText();
      
      const hasUserRights = pageText.includes('your use') || pageText.includes('you agree');
      const hasRefundReference = pageText.includes('charges') || pageText.includes('payment');
      const hasDisputeResolution = pageText.includes('dispute');
      const hasLiabilityClause = pageText.includes('liability');
      
      results.push(hasUserRights && hasRefundReference && hasDisputeResolution && hasLiabilityClause);
    }

    const passRate = results.filter(r => r).length / iterations;
    expect(passRate).toBe(1.0);
  });

  it('should consistently specify Rajahmundry court jurisdiction across 100 iterations', () => {
    const iterations = 100;
    const results: boolean[] = [];

    for (let i = 0; i < iterations; i++) {
      const pageText = renderAndExtractText();
      
      const hasRajahmundry = pageText.includes('rajahmundry');
      const hasAndhraPradesh = pageText.includes('andhra pradesh');
      const hasJurisdiction = pageText.includes('jurisdiction');
      const hasCourts = pageText.includes('court');
      
      results.push(hasRajahmundry && hasAndhraPradesh && hasJurisdiction && hasCourts);
    }

    const passRate = results.filter(r => r).length / iterations;
    expect(passRate).toBe(1.0);
  });

  it('should consistently identify SWAZ CONSULTANTS as platform owner across 100 iterations', () => {
    const iterations = 100;
    const results: boolean[] = [];

    for (let i = 0; i < iterations; i++) {
      const pageText = renderAndExtractText();
      
      const hasPlatformOwner = pageText.includes('swaz consultants');
      const hasAddress = pageText.includes('addepalli colony') || pageText.includes('rajahmundry');
      const hasOwnerDesignation = pageText.includes('platform owner');
      
      results.push(hasPlatformOwner && hasAddress && hasOwnerDesignation);
    }

    const passRate = results.filter(r => r).length / iterations;
    expect(passRate).toBe(1.0);
  });

  it('should consistently specify Indian law as governing law across 100 iterations', () => {
    const iterations = 100;
    const results: boolean[] = [];

    for (let i = 0; i < iterations; i++) {
      const pageText = renderAndExtractText();
      
      const hasIndianLaw = pageText.includes('laws of india');
      const hasGoverningLaw = pageText.includes('governing law');
      
      results.push(hasIndianLaw && hasGoverningLaw);
    }

    const passRate = results.filter(r => r).length / iterations;
    expect(passRate).toBe(1.0);
  });
});
