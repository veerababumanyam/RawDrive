import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductPreview } from "../product-preview";
import type { GalleryProduct } from "@/lib/api/commerce";

// Mock the commerce API so preflight + cart calls are deterministic.
// The component pulls evaluatePrintPreflight and upsertPublicCart from
// lib/api/commerce, so those are the only functions we need to fake.
vi.mock("@/lib/api/commerce", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/commerce")>("@/lib/api/commerce");
  return {
    ...actual,
    evaluatePrintPreflight: vi.fn(),
    upsertPublicCart: vi.fn(),
  };
});

import { evaluatePrintPreflight, upsertPublicCart } from "@/lib/api/commerce";

const mockPreflight = vi.mocked(evaluatePrintPreflight);
const mockUpsertCart = vi.mocked(upsertPublicCart);

function fakeProduct(overrides: Partial<GalleryProduct> = {}): GalleryProduct {
  return {
    id: "product-1",
    gallery_id: "gallery-1",
    workspace_id: "workspace-1",
    name: "Test Print",
    description: "A test product",
    product_type: "print",
    price_amount: 50000, // ₹500 in paise
    price_currency: "INR",
    asset_id: "asset-1",
    config: {},
    is_active: true,
    created_at: "2026-04-10T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default preflight response — excellent quality 4×6 print from a
  // standard 1200×1800 source. Individual tests override as needed.
  mockPreflight.mockResolvedValue({
    width_dpi: 300,
    height_dpi: 300,
    effective_dpi: 300,
    quality: "excellent",
    message: "Print quality: excellent",
    required_width_px: 1200,
    required_height_px: 1800,
    shortfall: false,
  });
});

describe("ProductPreview", () => {
  it("renders product name, type label, and price", () => {
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        sourceWidthPx={1200}
        sourceHeightPx={1800}
      />,
    );
    expect(screen.getByRole("heading", { name: "Test Print" })).toBeInTheDocument();
    // "Print" is the product_type label above the name
    expect(screen.getByText(/^print$/i)).toBeInTheDocument();
    // Price is 50000 paise → ₹500
    expect(screen.getByText(/₹500/)).toBeInTheDocument();
  });

  it("shows size selector for print products", () => {
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        sourceWidthPx={1200}
        sourceHeightPx={1800}
      />,
    );
    // Default preset labels
    expect(screen.getByRole("radio", { name: "4×6" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "8×10" })).toBeInTheDocument();
  });

  it("hides size selector for digital products", () => {
    render(
      <ProductPreview
        product={fakeProduct({ product_type: "digital" })}
        slug="test-gallery"
      />,
    );
    expect(screen.queryByRole("radiogroup", { name: /print size/i })).not.toBeInTheDocument();
  });

  it("runs preflight on mount when source dimensions provided", async () => {
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        sourceWidthPx={1200}
        sourceHeightPx={1800}
      />,
    );
    await waitFor(() => expect(mockPreflight).toHaveBeenCalledTimes(1));
    expect(mockPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        source_width_px: 1200,
        source_height_px: 1800,
        print_width_in: 4,
        print_height_in: 6,
      }),
    );
  });

  it("disables add-to-cart when preflight returns 'fail'", async () => {
    mockPreflight.mockResolvedValue({
      width_dpi: 75,
      height_dpi: 80,
      effective_dpi: 75,
      quality: "fail",
      message: "Print quality: too low",
      required_width_px: 4800,
      required_height_px: 6000,
      shortfall: true,
    });
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        sourceWidthPx={400}
        sourceHeightPx={600}
      />,
    );
    const button = await screen.findByRole("button", { name: /add to cart/i });
    await waitFor(() => expect(button).toBeDisabled());
  });

  it("increments quantity via stepper", () => {
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        sourceWidthPx={1200}
        sourceHeightPx={1800}
      />,
    );
    const inc = screen.getByRole("button", { name: /increase quantity/i });
    fireEvent.click(inc);
    fireEvent.click(inc);
    // Price should reflect quantity 3 × ₹500 = ₹1,500
    expect(screen.getByText(/₹1,500/)).toBeInTheDocument();
  });

  it("prevents decrement below 1", () => {
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        sourceWidthPx={1200}
        sourceHeightPx={1800}
      />,
    );
    const dec = screen.getByRole("button", { name: /decrease quantity/i });
    expect(dec).toBeDisabled();
  });

  it("shows email-required error when clientEmail is blank", async () => {
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        sourceWidthPx={1200}
        sourceHeightPx={1800}
      />,
    );
    const button = await screen.findByRole("button", { name: /add to cart/i });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/enter your email/i),
    );
    expect(mockUpsertCart).not.toHaveBeenCalled();
  });

  it("calls cart API and fires onAddedToCart on success", async () => {
    mockUpsertCart.mockResolvedValue({
      id: "cart-1",
      gallery_id: "gallery-1",
      client_email: "client@example.com",
      items: [{ product_id: "product-1", quantity: 1, unit_price: 50000, line_total: 50000 }],
      subtotal: 50000,
      discount: 0,
      total: 50000,
      created_at: "2026-04-10T00:00:00Z",
      updated_at: "2026-04-10T00:00:00Z",
    });
    const onAdded = vi.fn();
    render(
      <ProductPreview
        product={fakeProduct()}
        slug="test-gallery"
        clientEmail="client@example.com"
        sourceWidthPx={1200}
        sourceHeightPx={1800}
        onAddedToCart={onAdded}
      />,
    );
    const button = await screen.findByRole("button", { name: /add to cart/i });
    fireEvent.click(button);
    await waitFor(() => expect(mockUpsertCart).toHaveBeenCalledTimes(1));
    expect(mockUpsertCart).toHaveBeenCalledWith(
      "test-gallery",
      "client@example.com",
      expect.arrayContaining([
        expect.objectContaining({
          product_id: "product-1",
          quantity: 1,
          customization: expect.objectContaining({ print_size: "4×6" }),
        }),
      ]),
    );
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
  });
});
