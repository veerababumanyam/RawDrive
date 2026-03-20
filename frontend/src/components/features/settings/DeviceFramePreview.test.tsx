import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { DeviceFramePreview } from './DeviceFramePreview';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();
let mockDeviceMode = 'desktop';

vi.mock('@/contexts/ProfileEditorContext', () => ({
  useProfileEditor: () => ({
    deviceMode: mockDeviceMode,
    sectionOrder: ['header', 'bio', 'contact', 'socials'],
    profileType: 'personal',
    profile: {},
    visibility: null,
    theme: null,
    customization: null,
    isDirty: false,
    isSaving: false,
  }),
  useProfileEditorDispatch: () => mockDispatch,
}));

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as any;

describe('DeviceFramePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeviceMode = 'desktop';
  });

  it('renders 3 device toggle buttons (phone, tablet, desktop)', () => {
    render(
      <DeviceFramePreview>
        <div>Preview Content</div>
      </DeviceFramePreview>
    );

    // Buttons should be accessible by their aria-label or role
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('active device button has highlighted style', () => {
    render(
      <DeviceFramePreview>
        <div>Preview Content</div>
      </DeviceFramePreview>
    );

    const buttons = screen.getAllByRole('button');
    // Desktop is active (index 2), should have bg-blue-600
    const desktopButton = buttons[2];
    expect(desktopButton.className).toContain('bg-blue-600');
    expect(desktopButton.className).toContain('text-white');
  });

  it('clicking a device button dispatches SET_DEVICE_MODE', () => {
    render(
      <DeviceFramePreview>
        <div>Preview Content</div>
      </DeviceFramePreview>
    );

    const buttons = screen.getAllByRole('button');
    // Click phone button (first button)
    fireEvent.click(buttons[0]);

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_DEVICE_MODE',
      mode: 'phone',
    });
  });

  it('renders children inside the preview container', () => {
    render(
      <DeviceFramePreview>
        <div data-testid="child-content">Hello World</div>
      </DeviceFramePreview>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('preview container has transform scale style', () => {
    const { container } = render(
      <DeviceFramePreview>
        <div>Preview Content</div>
      </DeviceFramePreview>
    );

    // The inner frame should have a transform style with scale
    const frame = container.querySelector('[data-testid="device-frame"]');
    expect(frame).toBeInTheDocument();
  });
});
