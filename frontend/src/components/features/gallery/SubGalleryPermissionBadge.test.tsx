/**
 * SubGalleryPermissionBadge Tests
 * Tests badge display, toggle behavior, and confirmation messages
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SubGalleryPermissionBadge } from './SubGalleryPermissionBadge';

describe('SubGalleryPermissionBadge', () => {
  const defaultProps = {
    subGalleryId: 'sub-1',
    parentGalleryId: 'parent-1',
    inheritsPermissions: true,
    onToggleOverride: vi.fn(),
  };

  it('shows "Inherits from parent" when inheriting', () => {
    render(<SubGalleryPermissionBadge {...defaultProps} />);

    expect(screen.getByText('Inherits from parent')).toBeTruthy();
  });

  it('shows "Custom permissions" when overridden', () => {
    render(
      <SubGalleryPermissionBadge
        {...defaultProps}
        inheritsPermissions={false}
      />
    );

    expect(screen.getByText('Custom permissions')).toBeTruthy();
  });

  it('shows blue badge when inheriting', () => {
    render(<SubGalleryPermissionBadge {...defaultProps} />);

    const badge = screen.getByText('Inherits from parent').closest('[data-permission-badge]')!;
    expect(badge.className).toContain('blue');
  });

  it('shows amber badge when overridden', () => {
    render(
      <SubGalleryPermissionBadge
        {...defaultProps}
        inheritsPermissions={false}
      />
    );

    const badge = screen.getByText('Custom permissions').closest('[data-permission-badge]')!;
    expect(badge.className).toContain('amber');
  });

  it('has override toggle switch', () => {
    render(<SubGalleryPermissionBadge {...defaultProps} />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toBeTruthy();
  });

  it('shows confirmation when toggling to override', () => {
    render(<SubGalleryPermissionBadge {...defaultProps} />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(screen.getByText(/own access settings/)).toBeTruthy();
  });

  it('shows confirmation when toggling back to inherit', () => {
    render(
      <SubGalleryPermissionBadge
        {...defaultProps}
        inheritsPermissions={false}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(screen.getByText(/parent gallery settings/)).toBeTruthy();
  });

  it('calls onToggleOverride after confirmation', () => {
    const onToggleOverride = vi.fn();
    render(
      <SubGalleryPermissionBadge
        {...defaultProps}
        onToggleOverride={onToggleOverride}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    // Confirm the action
    fireEvent.click(screen.getByText('Confirm'));

    expect(onToggleOverride).toHaveBeenCalledWith('sub-1', true);
  });

  it('does not call onToggleOverride if cancelled', () => {
    const onToggleOverride = vi.fn();
    render(
      <SubGalleryPermissionBadge
        {...defaultProps}
        onToggleOverride={onToggleOverride}
      />
    );

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    // Cancel the action
    fireEvent.click(screen.getByText('Cancel'));

    expect(onToggleOverride).not.toHaveBeenCalled();
  });
});
