import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppButton } from '../components/landing/ui/AppButton';
import { AppBadge } from '../components/landing/ui/AppBadge';
import { AppCard } from '../components/landing/ui/AppCard';

describe('AppButton Component', () => {
    it('renders with correct text', () => {
        render(<AppButton>Click Me</AppButton>);
        expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('fires click handler', () => {
        const handleClick = vi.fn();
        render(<AppButton onClick={handleClick}>Click Me</AppButton>);
        fireEvent.click(screen.getByText('Click Me'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders loading state', () => {
        render(<AppButton isLoading>Click Me</AppButton>);
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('renders disabled state', () => {
        render(<AppButton disabled>Click Me</AppButton>);
        expect(screen.getByRole('button')).toBeDisabled();
    });
});

describe('AppBadge Component', () => {
    it('renders text content', () => {
        render(<AppBadge>New</AppBadge>);
        expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders with icon', () => {
        render(<AppBadge icon={<span data-testid="icon" />}>Featured</AppBadge>);
        expect(screen.getByText('Featured')).toBeInTheDocument();
        expect(screen.getByTestId('icon')).toBeInTheDocument();
    });
});

describe('AppCard Component', () => {
    it('renders title and description', () => {
        render(<AppCard title="Card Title" description="Card Description" />);
        expect(screen.getByText('Card Title')).toBeInTheDocument();
        expect(screen.getByText('Card Description')).toBeInTheDocument();
    });

    it('renders children content', () => {
        render(<AppCard><div>Child Content</div></AppCard>);
        expect(screen.getByText('Child Content')).toBeInTheDocument();
    });
});
