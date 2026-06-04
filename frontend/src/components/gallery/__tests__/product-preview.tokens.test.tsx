/**
 * Regression test for F-088 (cobolt-fix wave3-medium).
 *
 * product-preview.tsx previously hardcoded raw Tailwind color primitives
 * (text-red-400, bg-blue-500/10, text-emerald-400, text-amber-400, …) for
 * its error alert and DPI-quality badge. Those primitives are NOT part of
 * the @theme color map in frontend/src/app/globals.css, so they bypass the
 * design-token system and do not adapt to the `midnight` theme's semantic
 * palette.
 *
 * The fix replaces every primitive with an EXISTING semantic feedback token
 * already defined in globals.css (`--color-feedback-error`,
 * `--color-feedback-success`, `--color-feedback-warning`, `--color-info`).
 *
 * These tests assert:
 *   1. The error-alert path renders the semantic `text-feedback-error` class.
 *   2. Each DPI-quality classification renders its semantic feedback token.
 *   3. NO raw Tailwind color primitive (red/green/blue/emerald/amber/…-NNN)
 *      survives anywhere in the component's rendered markup.
 *
 * The component calls the commerce API on mount/interaction, so that module
 * is mocked to keep this a pure, deterministic unit test (no network).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { GalleryProduct, PrintPreflightResult } from "@/lib/api/commerce";

// Mock the commerce API so the component never hits the network. The mock
// returns whatever preflight result the current test queues up.
let nextPreflight: PrintPreflightResult;
vi.mock("@/lib/api/commerce", () => ({
  evaluatePrintPreflight: vi.fn(async () => nextPreflight),
  upsertPublicCart: vi.fn(async () => undefined),
  formatPaisa: (amount: number) => `₹${amount}`,
  productTypeLabel: (t: string) => t,
}));

import { ProductPreview } from "@/components/gallery/product-preview";

// Raw Tailwind color primitives that must NEVER appear after the fix.
const PRIMITIVE_RE =
  /\b(?:text|bg|border|ring|fill|stroke)-(?:red|green|blue|emerald|amber|yellow|orange|teal|cyan|sky|indigo|violet|purple|pink|rose|lime)-(?:50|100|200|300|400|500|600|700|800|900)\b/;

function makeProduct(overrides: Partial<GalleryProduct> = {}): GalleryProduct {
  return {
    id: "prod-1",
    name: "8x10 Fine Art Print",
    description: "Archival matte print",
    product_type: "print",
    price_amount: 50000,
    price_currency: "INR",
    ...overrides,
  } as GalleryProduct;
}

function makePreflight(
  quality: PrintPreflightResult["quality"],
): PrintPreflightResult {
  return {
    quality,
    effective_dpi: 300,
    message: `${quality} quality`,
    shortfall: false,
    required_width_px: 2400,
    required_height_px: 3000,
  } as PrintPreflightResult;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProductPreview — F-088 semantic feedback tokens", () => {
  it("error alert uses the semantic feedback-error token, not a primitive", async () => {
    // Non-print product: no preflight runs, so we can trigger the addError
    // path deterministically by submitting without a client email.
    render(
      <ProductPreview
        product={makeProduct({
          product_type: "digital" as GalleryProduct["product_type"],
        })}
        slug="studio-x"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("text-feedback-error");
    expect(alert.className).not.toMatch(PRIMITIVE_RE);
  });

  it.each([
    ["good", "feedback-success"],
    ["acceptable", "info"],
    ["warning", "feedback-warning"],
    ["fail", "feedback-error"],
  ] as const)(
    "DPI badge for %s quality uses the %s semantic token (no primitives)",
    async (quality, token) => {
      nextPreflight = makePreflight(quality);
      const { container } = render(
        <ProductPreview
          product={makeProduct()}
          slug="studio-x"
          sourceWidthPx={4000}
          sourceHeightPx={5000}
        />,
      );

      // Wait for the async preflight result to render the badge. Match the
      // badge label specifically ("<quality> — <dpi> DPI") rather than a bare
      // /<quality>/ regex, which also matches the "<quality> quality" message
      // paragraph and would throw "Found multiple elements".
      await waitFor(() =>
        expect(
          screen.getByText(new RegExp(`${quality}\\s*—.*DPI`, "i")),
        ).toBeTruthy(),
      );

      const html = container.innerHTML;
      expect(html).toContain(token);
      // Hard guard: the entire rendered subtree must be free of raw
      // Tailwind color primitives across all three themes.
      expect(html).not.toMatch(PRIMITIVE_RE);
    },
  );
});
