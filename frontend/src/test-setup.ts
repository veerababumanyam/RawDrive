import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom does not implement window.matchMedia, which crashes any
// component that reads it unconditionally at module load or in a hook
// body. WorkflowPipeline.tsx:69 is our canonical offender — it calls
// window.matchMedia inside a useSyncExternalStore snapshot, so any
// test that renders it (e.g. the landing page tests) would throw
// TypeError: window.matchMedia is not a function.
//
// The shim returns a MediaQueryList that always reports matches=false
// and no-ops on every listener method. That matches "user has no
// preference" which is the safest default for CI — any component
// that branches on prefers-reduced-motion or prefers-color-scheme
// renders the "animated / light" path. If a specific test needs a
// different media query result, override this mock in beforeEach.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
