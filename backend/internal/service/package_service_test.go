package service

import "testing"

func TestExpandServicePackageLineItems(t *testing.T) {
	pkg := ServicePackage{
		Name:           "Wedding Gold",
		Description:    "Two-day wedding coverage",
		Inclusions:     []string{"Photography", "Cinematic highlight"},
		BasePricePaisa: 15000000,
		GSTRate:        18,
		SACCode:        "998386",
		SelectedAddons: []PackageAddon{
			{Name: "Same-day edit", PricePaisa: 2500000, Description: "Reception reel"},
			{Name: "Premium album", PricePaisa: 1800000},
		},
	}

	items := ExpandServicePackageLineItems(pkg)
	if len(items) != 3 {
		t.Fatalf("len(items) = %d, want 3", len(items))
	}
	if items[0].Description != "Wedding Gold - Two-day wedding coverage" {
		t.Fatalf("base description = %q", items[0].Description)
	}
	if items[0].Quantity != 1 || items[0].UnitPricePaisa != 15000000 || items[0].HSNCode != "998386" || items[0].TaxRate != 18 {
		t.Fatalf("base item mismatch: %#v", items[0])
	}
	if items[1].Description != "Same-day edit - Reception reel" || items[1].UnitPricePaisa != 2500000 {
		t.Fatalf("first addon mismatch: %#v", items[1])
	}
	if items[2].Description != "Premium album" || items[2].UnitPricePaisa != 1800000 {
		t.Fatalf("second addon mismatch: %#v", items[2])
	}
}

func TestExpandServicePackageLineItemsDefaultsSACAndRate(t *testing.T) {
	items := ExpandServicePackageLineItems(ServicePackage{
		Name:           "Portrait Mini",
		BasePricePaisa: 1200000,
	})
	if len(items) != 1 {
		t.Fatalf("len(items) = %d, want 1", len(items))
	}
	if items[0].HSNCode != DefaultPhotographySAC {
		t.Fatalf("HSNCode = %q, want %q", items[0].HSNCode, DefaultPhotographySAC)
	}
	if items[0].TaxRate != float64(GSTRate) {
		t.Fatalf("TaxRate = %v, want %v", items[0].TaxRate, float64(GSTRate))
	}
}
