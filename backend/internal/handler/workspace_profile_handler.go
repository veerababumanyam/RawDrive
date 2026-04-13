package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WorkspaceProfileHandler reads and writes the non-sensitive "business
// profile" columns on the workspaces row — name, GSTIN, address, phone,
// email, website, bank details, invoice terms, signature. The caller's
// workspace is read from JWT claims so clients cannot spoof another
// workspace via the URL.
//
// Wired at /api/v1/workspaces/current/profile (GET + PUT). The row is
// already workspace-isolated via the RLS policy on workspaces, and the
// caller's JWT claim is used as the authoritative identifier for which
// row to read/write.
type WorkspaceProfileHandler struct {
	DB *pgxpool.Pool
}

// WorkspaceProfile mirrors the columns added in migration 068 plus the
// name/GSTIN fields that already existed. All fields are optional on
// write — missing fields are left unchanged.
type WorkspaceProfile struct {
	Name              *string `json:"name,omitempty"`
	GSTIN             *string `json:"gstin,omitempty"`
	AddressLine1      *string `json:"address_line1,omitempty"`
	AddressLine2      *string `json:"address_line2,omitempty"`
	City              *string `json:"city,omitempty"`
	PostalCode        *string `json:"postal_code,omitempty"`
	Phone             *string `json:"phone,omitempty"`
	Email             *string `json:"email,omitempty"`
	Website           *string `json:"website,omitempty"`
	LogoURL           *string `json:"logo_url,omitempty"`
	BrandName         *string `json:"brand_name,omitempty"`
	BrandAccentColor  *string `json:"brand_accent_color,omitempty"`
	PublicBranding    *bool   `json:"public_branding_enabled,omitempty"`
	LogoAssetID       *string `json:"logo_asset_id,omitempty"`
	BankName          *string `json:"bank_name,omitempty"`
	BankAccountHolder *string `json:"bank_account_holder,omitempty"`
	BankAccountNumber *string `json:"bank_account_number,omitempty"`
	BankIFSC          *string `json:"bank_ifsc,omitempty"`
	BankBranch        *string `json:"bank_branch,omitempty"`
	SignatureName     *string `json:"signature_name,omitempty"`
	InvoiceTerms      *string `json:"invoice_terms,omitempty"`
	InvoiceFooter     *string `json:"invoice_footer,omitempty"`
	// M23 additions (migration 073)
	UPIID           *string `json:"upi_id,omitempty"`
	PANNumber       *string `json:"pan_number,omitempty"`
	InstagramHandle *string `json:"instagram_handle,omitempty"`
	StateCode       *string `json:"state_code,omitempty"`
}

// GetProfile returns the current workspace's business profile. Any NULL
// column is returned as an empty string so the frontend form can bind
// directly without nil-coalescing.
func (h *WorkspaceProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	row := h.DB.QueryRow(r.Context(), `
		SELECT
			COALESCE(name, ''),
			COALESCE(gstin, ''),
			COALESCE(address_line1, ''),
			COALESCE(address_line2, ''),
			COALESCE(city, ''),
			COALESCE(postal_code, ''),
			COALESCE(phone, ''),
			COALESCE(email, ''),
			COALESCE(website, ''),
			COALESCE(logo_url, ''),
			COALESCE(brand_name, ''),
			COALESCE(brand_accent_color, ''),
			COALESCE(public_branding_enabled, true),
			COALESCE(logo_asset_id::text, ''),
			COALESCE(logo_metadata, '{}'::jsonb),
			COALESCE(bank_name, ''),
			COALESCE(bank_account_holder, ''),
			COALESCE(bank_account_number, ''),
			COALESCE(bank_ifsc, ''),
			COALESCE(bank_branch, ''),
			COALESCE(signature_name, ''),
			COALESCE(invoice_terms, ''),
			COALESCE(invoice_footer, ''),
			COALESCE(upi_id, ''),
			COALESCE(pan_number, ''),
			COALESCE(instagram_handle, ''),
			COALESCE(state_code, '')
		FROM workspaces WHERE id = $1`, wsID)
	var (
		name, gstin, addr1, addr2, city, postal, phone, email, website, logo string
		brandName, brandAccent, logoAssetID                                  string
		publicBranding                                                       bool
		logoMetadata                                                         map[string]interface{}
		bankName, bankHolder, bankAcc, ifsc, branch, sig, terms, footer      string
		upiID, panNumber, instaHandle, stateCode                             string
	)
	if err := row.Scan(&name, &gstin, &addr1, &addr2, &city, &postal, &phone, &email, &website, &logo,
		&brandName, &brandAccent, &publicBranding, &logoAssetID, &logoMetadata,
		&bankName, &bankHolder, &bankAcc, &ifsc, &branch, &sig, &terms, &footer,
		&upiID, &panNumber, &instaHandle, &stateCode); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to load profile: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"name":                    name,
		"gstin":                   gstin,
		"address_line1":           addr1,
		"address_line2":           addr2,
		"city":                    city,
		"postal_code":             postal,
		"phone":                   phone,
		"email":                   email,
		"website":                 website,
		"logo_url":                logo,
		"brand_name":              brandName,
		"brand_accent_color":      brandAccent,
		"public_branding_enabled": publicBranding,
		"logo_asset_id":           logoAssetID,
		"logo_metadata":           logoMetadata,
		"bank_name":               bankName,
		"bank_account_holder":     bankHolder,
		"bank_account_number":     bankAcc,
		"bank_ifsc":               ifsc,
		"bank_branch":             branch,
		"signature_name":          sig,
		"invoice_terms":           terms,
		"invoice_footer":          footer,
		"upi_id":                  upiID,
		"pan_number":              panNumber,
		"instagram_handle":        instaHandle,
		"state_code":              stateCode,
	})
}

// UpdateProfile PUTs a partial WorkspaceProfile — any omitted field is
// left unchanged (explicit nil vs empty-string distinction: empty string
// overwrites with blank, omitted field is untouched).
func (h *WorkspaceProfileHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var p WorkspaceProfile
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if err := validateBrandAccentColor(p.BrandAccentColor); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	// Build a dynamic UPDATE with only the fields the client sent. This
	// lets the settings page PATCH just a subset without clobbering
	// other columns to empty strings.
	sets := []string{}
	args := []any{}
	idx := 1
	add := func(col string, v *string) {
		if v != nil {
			sets = append(sets, fmt.Sprintf("%s=$%d", col, idx))
			args = append(args, *v)
			idx++
		}
	}
	addAny := func(col string, v any) {
		sets = append(sets, fmt.Sprintf("%s=$%d", col, idx))
		args = append(args, v)
		idx++
	}
	addBool := func(col string, v *bool) {
		if v != nil {
			addAny(col, *v)
		}
	}
	add("name", p.Name)
	add("gstin", p.GSTIN)
	add("address_line1", p.AddressLine1)
	add("address_line2", p.AddressLine2)
	add("city", p.City)
	add("postal_code", p.PostalCode)
	add("phone", p.Phone)
	add("email", p.Email)
	add("website", p.Website)
	add("brand_name", p.BrandName)
	add("brand_accent_color", p.BrandAccentColor)
	addBool("public_branding_enabled", p.PublicBranding)
	add("bank_name", p.BankName)
	add("bank_account_holder", p.BankAccountHolder)
	add("bank_account_number", p.BankAccountNumber)
	add("bank_ifsc", p.BankIFSC)
	add("bank_branch", p.BankBranch)
	add("signature_name", p.SignatureName)
	add("invoice_terms", p.InvoiceTerms)
	add("invoice_footer", p.InvoiceFooter)
	add("upi_id", p.UPIID)
	add("pan_number", p.PANNumber)
	add("instagram_handle", p.InstagramHandle)
	add("state_code", p.StateCode)

	if p.LogoAssetID != nil {
		logoAssetID := strings.TrimSpace(*p.LogoAssetID)
		if logoAssetID == "" {
			addAny("logo_asset_id", nil)
			addAny("logo_metadata", map[string]interface{}{})
			addAny("logo_url", "")
		} else {
			metadata, storageKey, err := h.logoMetadataForAsset(r.Context(), wsID, logoAssetID)
			if err != nil {
				status := http.StatusInternalServerError
				if errors.Is(err, pgx.ErrNoRows) {
					status = http.StatusBadRequest
				}
				http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), status)
				return
			}
			addAny("logo_asset_id", logoAssetID)
			addAny("logo_metadata", metadata)
			addAny("logo_url", storageKey)
		}
	} else {
		add("logo_url", p.LogoURL)
	}

	if len(sets) == 0 {
		respondJSON(w, http.StatusOK, map[string]any{"updated": 0})
		return
	}
	args = append(args, wsID)
	query := "UPDATE workspaces SET " + joinComma(sets) + ", updated_at = now() WHERE id = $" + fmt.Sprintf("%d", idx)
	if _, err := h.DB.Exec(r.Context(), query, args...); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to update profile: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"updated": len(sets)})
}

func joinComma(parts []string) string {
	return strings.Join(parts, ", ")
}

func validateBrandAccentColor(value *string) error {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	if len(trimmed) != 7 || trimmed[0] != '#' {
		return fmt.Errorf("brand_accent_color must be a #RRGGBB hex color")
	}
	for _, ch := range trimmed[1:] {
		if (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F') {
			continue
		}
		return fmt.Errorf("brand_accent_color must be a #RRGGBB hex color")
	}
	return nil
}

var errInvalidLogoAssetID = errors.New("logo_asset_id must be a valid UUID")

func (h *WorkspaceProfileHandler) logoMetadataForAsset(ctx context.Context, workspaceID uuid.UUID, assetIDRaw string) (map[string]interface{}, string, error) {
	assetID, err := uuid.Parse(assetIDRaw)
	if err != nil {
		return nil, "", fmt.Errorf("%w: %v", errInvalidLogoAssetID, err)
	}

	var filename, contentType, storageKey string
	var sizeBytes int64
	err = h.DB.QueryRow(ctx, `
		SELECT filename, content_type, size_bytes, storage_key
		FROM assets
		WHERE id = $1
		  AND workspace_id = $2
		  AND deleted_at IS NULL
		  AND content_type LIKE 'image/%'`,
		assetID, workspaceID,
	).Scan(&filename, &contentType, &sizeBytes, &storageKey)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", fmt.Errorf("logo asset must be an image uploaded to this workspace")
		}
		return nil, "", fmt.Errorf("failed to validate logo asset: %w", err)
	}

	return map[string]interface{}{
		"asset_id":       assetID.String(),
		"filename":       filename,
		"content_type":   contentType,
		"size_bytes":     sizeBytes,
		"storage_key":    storageKey,
		"storage_driver": "r2",
	}, storageKey, nil
}
