package service

// DefaultPhotographySAC is the SAC code required for Indian photography
// services in RawDrive GST exports and invoice line items.
const DefaultPhotographySAC = "998386"

// PackageAddon is an optional charge that expands into its own invoice line.
type PackageAddon struct {
	Name        string `json:"name"`
	PricePaisa  int64  `json:"price_paisa"`
	Description string `json:"description,omitempty"`
}

// ServicePackage is the service-layer representation of a package catalogue
// entry. Persistence structs live in repository to avoid import cycles.
type ServicePackage struct {
	Name           string         `json:"name"`
	Description    string         `json:"description,omitempty"`
	Inclusions     []string       `json:"inclusions,omitempty"`
	BasePricePaisa int64          `json:"base_price_paisa"`
	GSTRate        float64        `json:"gst_rate"`
	SACCode        string         `json:"sac_code"`
	SelectedAddons []PackageAddon `json:"selected_addons,omitempty"`
}

// PackageLineItem matches the invoice line-item JSON shape used by the billing
// API while keeping the service package independent from repository types.
type PackageLineItem struct {
	Description    string  `json:"description"`
	Quantity       int     `json:"quantity"`
	UnitPricePaisa int64   `json:"unit_price_paisa"`
	HSNCode        string  `json:"hsn_code"`
	TaxRate        float64 `json:"tax_rate"`
}

// ExpandServicePackageLineItems turns one package plus selected add-ons into
// invoice-ready line items.
func ExpandServicePackageLineItems(pkg ServicePackage) []PackageLineItem {
	sac := pkg.SACCode
	if sac == "" {
		sac = DefaultPhotographySAC
	}
	rate := pkg.GSTRate
	if rate == 0 {
		rate = float64(GSTRate)
	}

	baseDescription := pkg.Name
	if pkg.Description != "" {
		baseDescription += " - " + pkg.Description
	}
	items := []PackageLineItem{{
		Description:    baseDescription,
		Quantity:       1,
		UnitPricePaisa: pkg.BasePricePaisa,
		HSNCode:        sac,
		TaxRate:        rate,
	}}

	for _, addon := range pkg.SelectedAddons {
		if addon.Name == "" {
			continue
		}
		description := addon.Name
		if addon.Description != "" {
			description += " - " + addon.Description
		}
		items = append(items, PackageLineItem{
			Description:    description,
			Quantity:       1,
			UnitPricePaisa: addon.PricePaisa,
			HSNCode:        sac,
			TaxRate:        rate,
		})
	}
	return items
}
