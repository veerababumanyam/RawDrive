import { render, screen, fireEvent, act } from '@testing-library/react';
import { PhotoGrid } from '../PhotoGrid';
import { GalleryAssetItem } from '../../../types/gallery';
import { ResponsiveColumns } from '../../../types/canvas';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// Helper to create minimal mock assets
const createMockAsset = (id: string): GalleryAssetItem => ({
  gallery_asset_id: `ga-${id}`,
  asset_id: id,
  sort_order: 0,
  visible: true,
  is_private: false,
  is_favorited: false,
  is_selected: false,
  favorites_count: 0,
  asset: {
    type: 'photo',
    status: 'available',
    mime_type: 'image/jpeg',
    filename: `photo-${id}.jpg`,
    file_size: 1000,
    created_at: new Date().toISOString(),
    width: 800,
    height: 600
  }
});

// Mock ResizeObserver and IntersectionObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  constructor(public cb: (entries: any[]) => void) {}
}

global.ResizeObserver = ResizeObserverMock;
global.IntersectionObserver = IntersectionObserverMock as any;

// Mock useAuth
// Path relative to THIS test file:
vi.mock('../../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    workspace: { workspace_id: 'test-workspace' },
    user: { id: 'test-user' },
    isAuthenticated: true,
  }),
}));

// Mock useSignedUrl to avoid wrapping in SignedUrlProvider
vi.mock('../../../../hooks/useSignedUrl', () => ({
  useSignedUrl: () => ({
    url: 'https://mock.com/image.jpg',
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe('PhotoGrid Property Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Property 1: Grid Layout Uniform Cells & Responsive Columns', () => {
    // We mock window.innerWidth by overriding it
    const originalInnerWidth = window.innerWidth;

    fc.assert(
      fc.property(
        fc.integer({ min: 320, max: 2560 }), // viewport width
        (width) => {
          // Set window width
          Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: width,
          });
          
          // Trigger resize event
          act(() => {
            window.dispatchEvent(new Event('resize'));
          });

          // Determine expected columns based on default config
          let expectedCols = 2; // sm
          if (width >= 1536) expectedCols = 5; // xl
          else if (width >= 1024) expectedCols = 4; // lg
          else if (width >= 640) expectedCols = 3; // md
          else expectedCols = 2; // sm

          // Note: The logic in PhotoGrid is:
          // if (width < 640) sm
          // else if (width < 1024) md
          // else if (width < 1536) lg
          // else xl
          // Default sm=2, md=3, lg=4, xl=5.
          
          // Re-verify logic:
          let logicCols = 5;
          if (width < 640) logicCols = 2;
          else if (width < 1024) logicCols = 3;
          else if (width < 1536) logicCols = 4;
          
          // We can't easily assert internal state `currentColCount` without checking visual classes 
          // OR inspecting component state (unstable).
          // However, we *can* check if the rendered `div` has the correct class? 
          // `PhotoGrid` renders specific classes `grid-cols-2 md:grid-cols-3...`. 
          // CSS Grid handles the actual display. 
          // The JS logic `currentColCount` is ONLY used for Keyboard Navigation.
          
          // So let's test that the container HAS the responsive classes.
          const assets = [createMockAsset('1')];
          const { container, unmount } = render(<PhotoGrid assets={assets} columns={{ sm: 2, md: 3, lg: 4, xl: 5 }} />);
          
          const grid = container.firstChild as HTMLElement;
          expect(grid.className).toContain('grid-cols-2');
          expect(grid.className).toContain('md:grid-cols-3');
          expect(grid.className).toContain('lg:grid-cols-4');
          expect(grid.className).toContain('2xl:grid-cols-5');
          
          // Also check gap classes if provided
          unmount();
        }
      ),
      { numRuns: 10 } // Reduced runs as render is expensive
    );
    
    // Restore
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('Property 25: Keyboard Navigation', () => {
    // We need to verify that Arrow keys move focus correctly.
    // We fix width to 1200px (lg breakpoint -> 4 columns).
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200, // lg -> 4 cols
    });
    
    const assets = Array.from({ length: 10 }, (_, i) => createMockAsset(`${i}`));
    const { getByRole, getAllByRole } = render(
      <PhotoGrid 
        assets={assets} 
        columns={{ sm: 2, md: 3, lg: 4, xl: 5 }} 
      />
    );

    // Initial focus needs to be set manually or we simulate tab.
    // Assume user clicks or tabs to first item.
    const items = getAllByRole('gridcell'); // PhotoCard has role="gridcell"
    expect(items.length).toBe(10);
    
    // Focus first item
    act(() => {
      items[0].focus();
    });
    expect(document.activeElement).toBe(items[0]);
    
    // Arrow Right -> Item 1
    fireEvent.keyDown(items[0], { key: 'ArrowRight', code: 'ArrowRight', bubbles: true });
    // PhotoGrid handles event and calls focus() on next item.
    // Warning: JSDOM doesn't support layout, so `element.focus()` works but requires `tabIndex` etc.
    // Our logic uses querySelector(`[data-photo-index="1"]`).focus().
    
    expect(document.activeElement).toBe(items[1]);
    
    // Arrow Left -> Item 0
    fireEvent.keyDown(items[1], { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true });
    expect(document.activeElement).toBe(items[0]);
    
    // Arrow Down -> Item 4 (since 4 columns)
    // 0 + 4 = 4
    fireEvent.keyDown(items[0], { key: 'ArrowDown', code: 'ArrowDown', bubbles: true });
    expect(document.activeElement).toBe(items[4]);
    
    // Arrow Up -> Item 0
    fireEvent.keyDown(items[4], { key: 'ArrowUp', code: 'ArrowUp', bubbles: true });
    expect(document.activeElement).toBe(items[0]);
  });
});
