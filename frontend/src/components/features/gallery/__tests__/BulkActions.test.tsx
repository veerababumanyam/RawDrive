
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkActionBar } from '../BulkActionBar';
import fc from 'fast-check';
import React from 'react';

// Mock GalleryAssetItem
const mockAsset = (id: string) => ({
    asset_id: id,
    asset: { filename: `photo-${id}.jpg`, mime_type: 'image/jpeg' },
} as any);

describe('BulkActionBar', () => {
    it('Property 14: Selection Count Display', () => {
        fc.assert(
            fc.property(fc.array(fc.uuid()), (ids) => {
                const uniqueIds = new Set(ids); // Set handles uniqueness
                const selectedIds = uniqueIds;
                
                // If empty, component returns null usually, let's skip empty to test "Selection Count" visible
                if (selectedIds.size === 0) return true;

                const { unmount } = render(
                    <BulkActionBar
                        selectedAssetIds={selectedIds}
                        assets={[]}
                        onClearSelection={vi.fn()}
                    />
                );

                expect(screen.getByText(selectedIds.size.toString())).toBeTruthy();
                
                 if (selectedIds.size === 1) {
                    expect(screen.getByText('photo selected')).toBeTruthy();
                } else {
                    expect(screen.getByText('photos selected')).toBeTruthy();
                }

                unmount();
            })
        );
    });

    it('Property 15: Bulk Delete Atomicity', () => {
        const onBulkDelete = vi.fn();
        const selectedIds = new Set(['id-1', 'id-2', 'id-3']);

        render(
            <BulkActionBar
                selectedAssetIds={selectedIds}
                assets={[]}
                onClearSelection={vi.fn()}
                onBulkDelete={onBulkDelete}
            />
        );

        // 1. Click Delete button
        fireEvent.click(screen.getByText('Delete'));

        // 2. Expect Confirmation Dialog
        expect(screen.getByText(/Are you sure you want to delete 3 photos?/)).toBeTruthy();

        // 3. Confirm Delete
        const deleteButtons = screen.getAllByText('Delete');
        fireEvent.click(deleteButtons[deleteButtons.length - 1]);

        // 4. Verify onBulkDelete called ONCE with ALL IDs
        expect(onBulkDelete).toHaveBeenCalledTimes(1);
        expect(onBulkDelete).toHaveBeenCalledWith(['id-1', 'id-2', 'id-3']);
    });

    it('Property 16: Bulk Move Destination', () => {
        fc.assert(
            fc.property(
                fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
                fc.array(fc.record({ sub_gallery_id: fc.uuid(), name: fc.lorem({ maxCount: 2 }) }), { minLength: 1, maxLength: 3 }),
                (ids, subGalleries) => {
                    const uniqueIds = new Set(ids);
                    if (uniqueIds.size === 0) return true;

                    const onBulkMove = vi.fn();

                    const { unmount } = render(
                        <BulkActionBar
                            selectedAssetIds={uniqueIds}
                            assets={[]}
                            subGalleries={subGalleries}
                            onClearSelection={vi.fn()}
                            onBulkMove={onBulkMove}
                        />
                    );

                    // 1. Click Move button
                    const moveButtonsInitial = screen.getAllByText('Move');
                    fireEvent.click(moveButtonsInitial[0]);

                    // 2. Select a destination (first sub-gallery)
                    const dest = subGalleries[0];
                    // Handle potential duplicate names or "Root Gallery" collision
                    const destButtons = screen.getAllByText(dest.name);
                    fireEvent.click(destButtons[0]);

                    // 3. Confirm Move
                    // The dialog has a "Move" button. Since the trigger is also "Move", we need the last one.
                    // Or specifically target the one in the dialog.
                    const moveButtons = screen.getAllByText('Move');
                    const confirmButton = moveButtons[moveButtons.length - 1];
                    
                    // Verify it's not disabled (it should be enabled after selection)
                    expect(confirmButton).not.toBeDisabled();
                    
                    fireEvent.click(confirmButton);

                    // 4. Verify callback
                    expect(onBulkMove).toHaveBeenCalledWith(
                        expect.arrayContaining(Array.from(uniqueIds)),
                        dest.sub_gallery_id
                    );

                    unmount();
                    return true;
                }
            )
        );
    });
});
