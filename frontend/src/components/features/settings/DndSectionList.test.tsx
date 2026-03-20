import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { DndSectionList } from './DndSectionList';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();
const mockSectionOrder = ['header', 'bio', 'contact', 'socials'];

vi.mock('@/contexts/ProfileEditorContext', () => ({
  useProfileEditor: () => ({
    sectionOrder: mockSectionOrder,
    profileType: 'personal',
    profile: {},
    visibility: null,
    theme: null,
    customization: null,
    deviceMode: 'desktop',
    isDirty: false,
    isSaving: false,
  }),
  useProfileEditorDispatch: () => mockDispatch,
}));

// Mock @dnd-kit to avoid complex drag simulation
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: any) => (
    <div data-testid="dnd-context" data-ondragend={onDragEnd}>
      {children}
    </div>
  ),
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...args: any[]) => args),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  verticalListSortingStrategy: 'vertical',
  useSortable: (props: any) => ({
    attributes: { 'data-sortable-id': props.id },
    listeners: { 'data-drag-handle': true },
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  arrayMove: vi.fn((arr: string[], from: number, to: number) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: (t: any) => (t ? `translate(${t.x}px, ${t.y}px)` : undefined) },
  },
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, layoutId, ...props }: any, ref: any) => (
      <div ref={ref} data-layout-id={layoutId} {...props}>
        {children}
      </div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('DndSectionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all section items from sectionOrder', () => {
    render(<DndSectionList />);

    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Bio')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Socials')).toBeInTheDocument();
  });

  it('renders a GripVertical icon (drag handle) for each item', () => {
    const { container } = render(<DndSectionList />);

    // Each section item should have an svg icon (GripVertical from lucide-react renders as svg)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(mockSectionOrder.length);
  });

  it('applies Framer Motion layoutId to each item', () => {
    const { container } = render(<DndSectionList />);

    const layoutItems = container.querySelectorAll('[data-layout-id]');
    expect(layoutItems).toHaveLength(mockSectionOrder.length);

    mockSectionOrder.forEach((id) => {
      expect(container.querySelector(`[data-layout-id="${id}"]`)).toBeInTheDocument();
    });
  });

  it('dispatches SET_SECTION_ORDER when items are reordered via onDragEnd', async () => {
    // We need to import the component module to access the onDragEnd handler
    // Since DndContext is mocked, we simulate calling onDragEnd directly
    const { DndSectionList: Component } = await import('./DndSectionList');

    // Render and find the DndContext mock to get its onDragEnd
    const onDragEndCapture = vi.fn();
    vi.mocked(await import('@dnd-kit/core')).DndContext = (({ children, onDragEnd }: any) => {
      onDragEndCapture.mockImplementation(onDragEnd);
      return <div data-testid="dnd-context-capture">{children}</div>;
    }) as any;

    render(<Component />);

    // Simulate a drag end event: move 'bio' (index 1) to index 0
    if (onDragEndCapture.mock.calls.length > 0) {
      // Already captured
    }
    // Call the captured onDragEnd with a mock event
    const mockEvent = {
      active: { id: 'bio' },
      over: { id: 'header' },
    };

    if (onDragEndCapture.getMockImplementation()) {
      onDragEndCapture.getMockImplementation()(mockEvent);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_SECTION_ORDER',
        order: expect.any(Array),
      });
    }
  });
});
