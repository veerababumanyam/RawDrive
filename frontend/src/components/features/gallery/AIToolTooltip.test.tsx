/**
 * AIToolTooltip Tests
 * Tests tooltip behavior on hover (desktop) and long-press (mobile)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { AIToolTooltip, AI_TOOL_DESCRIPTIONS } from './AIToolTooltip';

describe('AIToolTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children without tooltip initially', () => {
    render(
      <AIToolTooltip label="Auto Tag" description="Tags photos automatically">
        <button>AI Button</button>
      </AIToolTooltip>
    );

    expect(screen.getByText('AI Button')).toBeTruthy();
    expect(screen.queryByText('Tags photos automatically')).toBeNull();
  });

  it('shows tooltip on mouse enter after 200ms delay', () => {
    render(
      <AIToolTooltip label="Auto Tag" description="Tags photos automatically">
        <button>AI Button</button>
      </AIToolTooltip>
    );

    const wrapper = screen.getByText('AI Button').closest('[data-tooltip-wrapper]')!;
    fireEvent.mouseEnter(wrapper);

    // Not visible yet (before 200ms)
    expect(screen.queryByText('Tags photos automatically')).toBeNull();

    // After 200ms delay
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText('Tags photos automatically')).toBeTruthy();
    expect(screen.getByText('Auto Tag')).toBeTruthy();
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <AIToolTooltip label="Auto Tag" description="Tags photos automatically">
        <button>AI Button</button>
      </AIToolTooltip>
    );

    const wrapper = screen.getByText('AI Button').closest('[data-tooltip-wrapper]')!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText('Tags photos automatically')).toBeTruthy();

    fireEvent.mouseLeave(wrapper);

    expect(screen.queryByText('Tags photos automatically')).toBeNull();
  });

  it('cancels tooltip if mouse leaves before delay completes', () => {
    render(
      <AIToolTooltip label="Auto Tag" description="Tags photos automatically">
        <button>AI Button</button>
      </AIToolTooltip>
    );

    const wrapper = screen.getByText('AI Button').closest('[data-tooltip-wrapper]')!;
    fireEvent.mouseEnter(wrapper);

    // Leave before 200ms
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('Tags photos automatically')).toBeNull();
  });

  it('shows tooltip on long press (500ms) for mobile', () => {
    render(
      <AIToolTooltip label="Auto Tag" description="Tags photos automatically">
        <button>AI Button</button>
      </AIToolTooltip>
    );

    const wrapper = screen.getByText('AI Button').closest('[data-tooltip-wrapper]')!;
    fireEvent.touchStart(wrapper);

    // Not visible yet
    expect(screen.queryByText('Tags photos automatically')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText('Tags photos automatically')).toBeTruthy();
  });

  it('cancels long press if touch ends early', () => {
    render(
      <AIToolTooltip label="Auto Tag" description="Tags photos automatically">
        <button>AI Button</button>
      </AIToolTooltip>
    );

    const wrapper = screen.getByText('AI Button').closest('[data-tooltip-wrapper]')!;
    fireEvent.touchStart(wrapper);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.touchEnd(wrapper);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText('Tags photos automatically')).toBeNull();
  });

  it('supports position prop', () => {
    render(
      <AIToolTooltip label="Auto Tag" description="Tags photos automatically" position="bottom">
        <button>AI Button</button>
      </AIToolTooltip>
    );

    const wrapper = screen.getByText('AI Button').closest('[data-tooltip-wrapper]')!;
    fireEvent.mouseEnter(wrapper);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.className).toContain('top-full');
  });

  it('exports AI_TOOL_DESCRIPTIONS constant map', () => {
    expect(AI_TOOL_DESCRIPTIONS).toBeDefined();
    expect(AI_TOOL_DESCRIPTIONS.auto_tag).toBeTruthy();
    expect(AI_TOOL_DESCRIPTIONS.face_detect).toBeTruthy();
    expect(AI_TOOL_DESCRIPTIONS.auto_cull).toBeTruthy();
    expect(AI_TOOL_DESCRIPTIONS.smart_album).toBeTruthy();
  });
});
