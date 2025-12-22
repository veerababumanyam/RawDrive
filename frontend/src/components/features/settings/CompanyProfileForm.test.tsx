/**
 * Unit tests for CompanyProfileForm component
 * 
 * Tests cover:
 * - Form validation and submission
 * - Visibility toggle functionality
 * - Accessibility compliance
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanyProfileForm } from './CompanyProfileForm';
import { companyProfileService } from '../../../services/companyProfileService';
import type { CompanyProfile } from '../../../types/companyProfile';

// Helper to create a complete mock profile with all required fields
const createMockProfile = (overrides: Partial<CompanyProfile> = {}): CompanyProfile => ({
    profile_id: 'test-profile-id',
    workspace_id: 'test-workspace-id',
    name: 'Test Studio',
    slug: 'test-studio',
    email: 'test@studio.com',
    socials: {},
    custom_links: [],
    secondary_emails: [],
    secondary_phones: [],
    company_visibility: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
});

// Mock the services
vi.mock('../../../services/companyProfileService', () => ({
    companyProfileService: {
        getProfile: vi.fn(),
        createProfile: vi.fn(),
        updateProfile: vi.fn(),
        getVCardUrl: vi.fn((slug: string) => `/api/v1/public/profiles/${slug}/vcard`),
        getQrCodeUrl: vi.fn((slug: string) => `/api/v1/public/profiles/${slug}/qr-code`),
        getPublicUrlPrefix: vi.fn(() => 'https://rawdrive.ai/p/'),
        getPublicUrlDomain: vi.fn(() => 'https://rawdrive.ai'),
        checkSlugAvailability: vi.fn(() => Promise.resolve({ available: true })),
        getLogoBlobUrl: vi.fn(() => Promise.resolve(null)),
    },
}));

// Mock toast
vi.mock('../../../components/ui/Toast', () => ({
    useToastActions: () => ({
        success: vi.fn(),
        error: vi.fn(),
    }),
}));

// Mock useAuth hook
const mockWorkspace = {
    workspace_id: 'test-workspace-id',
    name: 'Test Workspace',
    role: 'owner' as const,
};

const mockAuthContext = {
    workspace: mockWorkspace,
    user: { user_id: 'test-user', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    switchWorkspace: vi.fn(),
};

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => mockAuthContext,
}));

const renderWithAuth = (component: React.ReactElement) => {
    return render(component);
};

describe('CompanyProfileForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock: no existing profile (404)
        vi.mocked(companyProfileService.getProfile).mockRejectedValue({
            response: { status: 404 },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Form Rendering', () => {
        it('should render all required form fields', async () => {
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Basic Information fields
            expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/tagline/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/public slug/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();

            // Address fields
            expect(screen.getByLabelText(/address line 1/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/state/i)).toBeInTheDocument();

            // Social media fields
            expect(screen.getByLabelText(/instagram/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/facebook/i)).toBeInTheDocument();
        });

        it('should load existing profile data when available', async () => {
            const mockProfile = createMockProfile({
                name: 'Test Studio',
                slug: 'test-studio',
                email: 'contact@teststudio.com',
                tagline: 'Professional Photography',
                phone: '+1234567890',
                website: 'https://teststudio.com',
                logo_url: 'https://example.com/logo.png',
                address_structured: {
                    line1: '123 Main St',
                    city: 'New York',
                    state: 'NY',
                    postal_code: '10001',
                    country: 'USA',
                },
                socials: {
                    instagram: 'teststudio',
                    facebook: 'teststudio',
                },
                custom_links: [
                    { label: 'Portfolio', url: 'https://portfolio.com' },
                ],
                company_visibility: {
                    name: true,
                    email: true,
                },
            });

            vi.mocked(companyProfileService.getProfile).mockResolvedValue(mockProfile);

            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.getByDisplayValue('Test Studio')).toBeInTheDocument();
            });

            expect(screen.getByDisplayValue('test-studio')).toBeInTheDocument();
            expect(screen.getByDisplayValue('contact@teststudio.com')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Professional Photography')).toBeInTheDocument();
        });
    });

    describe('Form Validation', () => {
        it('should show validation error when name is empty', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/name is required/i)).toBeInTheDocument();
            });
        });

        it('should show validation error when email is empty', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/email is required/i)).toBeInTheDocument();
            });
        });

        it('should show validation error when slug is empty', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/slug is required/i)).toBeInTheDocument();
            });
        });

        it('should show validation error for invalid slug format', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            const slugInput = screen.getByLabelText(/public slug/i);
            await user.type(slugInput, 'Invalid Slug!');

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/only lowercase letters, numbers, and hyphens allowed/i)).toBeInTheDocument();
            });
        });

        it('should accept valid slug format', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            const slugInput = screen.getByLabelText(/public slug/i);
            await user.type(slugInput, 'valid-slug-123');

            // Should not show validation error
            expect(screen.queryByText(/only lowercase letters, numbers, and hyphens allowed/i)).not.toBeInTheDocument();
        });
    });

    describe('Form Submission', () => {
        it('should create new profile when submitting valid data', async () => {
            const user = userEvent.setup();
            vi.mocked(companyProfileService.createProfile).mockResolvedValue(
                createMockProfile({
                    profile_id: 'new-profile-id',
                    name: 'New Studio',
                    slug: 'new-studio',
                    email: 'new@studio.com',
                })
            );

            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Fill in required fields
            await user.type(screen.getByLabelText(/company name/i), 'New Studio');
            await user.type(screen.getByLabelText(/public slug/i), 'new-studio');
            await user.type(screen.getByLabelText(/email address/i), 'new@studio.com');

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(companyProfileService.createProfile).toHaveBeenCalledWith(
                    'test-workspace-id',
                    expect.objectContaining({
                        name: 'New Studio',
                        slug: 'new-studio',
                        email: 'new@studio.com',
                    })
                );
            });
        });

        it('should update existing profile when create returns 409', async () => {
            const user = userEvent.setup();
            
            // Mock create to fail with 409, then update to succeed
            vi.mocked(companyProfileService.createProfile).mockRejectedValue({
                response: { status: 409 },
            });
            vi.mocked(companyProfileService.updateProfile).mockResolvedValue(
                createMockProfile({
                    profile_id: 'existing-profile-id',
                    name: 'Updated Studio',
                    slug: 'updated-studio',
                    email: 'updated@studio.com',
                })
            );

            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Fill in required fields
            await user.type(screen.getByLabelText(/company name/i), 'Updated Studio');
            await user.type(screen.getByLabelText(/public slug/i), 'updated-studio');
            await user.type(screen.getByLabelText(/email address/i), 'updated@studio.com');

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(companyProfileService.updateProfile).toHaveBeenCalledWith(
                    'test-workspace-id',
                    expect.objectContaining({
                        name: 'Updated Studio',
                        slug: 'updated-studio',
                        email: 'updated@studio.com',
                    })
                );
            });
        });

        it('should sanitize empty optional fields before submission', async () => {
            const user = userEvent.setup();
            vi.mocked(companyProfileService.createProfile).mockResolvedValue(
                createMockProfile({
                    profile_id: 'new-profile-id',
                    name: 'Test Studio',
                    slug: 'test-studio',
                    email: 'test@studio.com',
                })
            );

            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Fill in only required fields, leave optional fields empty
            await user.type(screen.getByLabelText(/company name/i), 'Test Studio');
            await user.type(screen.getByLabelText(/public slug/i), 'test-studio');
            await user.type(screen.getByLabelText(/email address/i), 'test@studio.com');

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                const callArgs = vi.mocked(companyProfileService.createProfile).mock.calls[0][1];
                // Empty optional fields should be undefined
                expect(callArgs.tagline).toBeUndefined();
                expect(callArgs.phone).toBeUndefined();
                expect(callArgs.website).toBeUndefined();
            });
        });
    });

    describe('Visibility Toggle Functionality', () => {
        it('should toggle visibility for name field', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Find all visibility toggle buttons (they have Eye/EyeOff icons)
            const allButtons = screen.getAllByRole('button');
            const visibilityButtons = allButtons.filter(btn => 
                btn.querySelector('svg') && btn.className.includes('p-1.5')
            );
            
            // Should have multiple visibility toggle buttons
            expect(visibilityButtons.length).toBeGreaterThan(0);
            
            const firstVisibilityButton = visibilityButtons[0];
            
            // Initially should be visible (has text-primary class)
            const initialClass = firstVisibilityButton.className;
            
            // Click to toggle
            await user.click(firstVisibilityButton);

            // Class should change after toggle
            await waitFor(() => {
                expect(firstVisibilityButton.className).not.toBe(initialClass);
            });
        });

        it('should toggle visibility for email field', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Find all visibility toggle buttons
            const allButtons = screen.getAllByRole('button');
            const visibilityButtons = allButtons.filter(btn => 
                btn.querySelector('svg') && btn.className.includes('p-1.5')
            );
            
            // Pick one of the visibility buttons (e.g., second one for email)
            const emailVisibilityButton = visibilityButtons[1] || visibilityButtons[0];
            
            // Click to toggle
            await user.click(emailVisibilityButton);

            // Verify the button state changed (class should include text-text-disabled)
            await waitFor(() => {
                expect(emailVisibilityButton.className).toContain('text-text-disabled');
            });
        });

        it('should include visibility settings in form submission', async () => {
            const user = userEvent.setup();
            vi.mocked(companyProfileService.createProfile).mockResolvedValue(
                createMockProfile({
                    profile_id: 'new-profile-id',
                    name: 'Test Studio',
                    slug: 'test-studio',
                    email: 'test@studio.com',
                })
            );

            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Fill required fields
            await user.type(screen.getByLabelText(/company name/i), 'Test Studio');
            await user.type(screen.getByLabelText(/public slug/i), 'test-studio');
            await user.type(screen.getByLabelText(/email address/i), 'test@studio.com');

            // Toggle one of the visibility buttons
            const allButtons = screen.getAllByRole('button');
            const visibilityButtons = allButtons.filter(btn => 
                btn.querySelector('svg') && btn.className.includes('p-1.5')
            );
            
            if (visibilityButtons.length > 0) {
                await user.click(visibilityButtons[0]);
            }

            const submitButton = screen.getByRole('button', { name: /save changes/i });
            await user.click(submitButton);

            await waitFor(() => {
                expect(companyProfileService.createProfile).toHaveBeenCalled();
                const callArgs = vi.mocked(companyProfileService.createProfile).mock.calls[0][1];
                expect(callArgs.company_visibility).toBeDefined();
            });
        });
    });

    describe('Custom Links Management', () => {
        it('should add a new custom link', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            const addLinkButton = screen.getByRole('button', { name: /add link/i });
            await user.click(addLinkButton);

            // Should now have input fields for the new link
            const linkInputs = screen.getAllByPlaceholderText(/link title/i);
            expect(linkInputs.length).toBeGreaterThan(0);
        });

        it('should remove a custom link', async () => {
            const user = userEvent.setup();

            const mockProfile = createMockProfile({
                name: 'Test Studio',
                slug: 'test-studio',
                email: 'test@studio.com',
                custom_links: [
                    { label: 'Portfolio', url: 'https://portfolio.com' },
                ],
            });

            vi.mocked(companyProfileService.getProfile).mockResolvedValue(mockProfile);

            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.getByDisplayValue('Portfolio')).toBeInTheDocument();
            });

            // Find and click the remove button (Trash icon)
            const removeButtons = screen.getAllByRole('button').filter(
                button => button.querySelector('svg') && button.className.includes('text-error')
            );
            
            expect(removeButtons.length).toBeGreaterThan(0);
            await user.click(removeButtons[0]);

            // Link should be removed
            await waitFor(() => {
                expect(screen.queryByDisplayValue('Portfolio')).not.toBeInTheDocument();
            });
        });
    });

    describe('Accessibility', () => {
        it('should have proper ARIA labels for all form fields', async () => {
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Check that all inputs have accessible labels
            expect(screen.getByLabelText(/company name/i)).toHaveAccessibleName();
            expect(screen.getByLabelText(/email address/i)).toHaveAccessibleName();
            expect(screen.getByLabelText(/public slug/i)).toHaveAccessibleName();
        });

        it('should be keyboard navigable', async () => {
            const user = userEvent.setup();
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            const nameInput = screen.getByLabelText(/company name/i);
            
            // Focus the first input
            nameInput.focus();
            expect(nameInput).toHaveFocus();

            // Tab to next field
            await user.tab();
            
            // Should move to next focusable element
            expect(document.activeElement).not.toBe(nameInput);
        });

        it('should have proper button roles and labels', async () => {
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            // Check submit button
            const submitButton = screen.getByRole('button', { name: /save changes/i });
            expect(submitButton).toBeInTheDocument();
            expect(submitButton).toHaveAttribute('type', 'submit');

            // Check add link button
            const addLinkButton = screen.getByRole('button', { name: /add link/i });
            expect(addLinkButton).toBeInTheDocument();
            expect(addLinkButton).toHaveAttribute('type', 'button');
        });
    });

    describe('vCard and QR Code Downloads', () => {
        it('should show download buttons when slug is present', async () => {
            const mockProfile = createMockProfile({
                name: 'Test Studio',
                slug: 'test-studio',
                email: 'test@studio.com',
            });

            vi.mocked(companyProfileService.getProfile).mockResolvedValue(mockProfile);

            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /vcard/i })).toBeInTheDocument();
                expect(screen.getByRole('button', { name: /qr code/i })).toBeInTheDocument();
            });
        });

        it('should not show download buttons when slug is empty', async () => {
            renderWithAuth(<CompanyProfileForm />);

            await waitFor(() => {
                expect(screen.queryByText('Loading profile settings...')).not.toBeInTheDocument();
            });

            expect(screen.queryByRole('button', { name: /vcard/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /qr code/i })).not.toBeInTheDocument();
        });
    });
});
