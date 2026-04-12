package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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
	BankName          *string `json:"bank_name,omitempty"`
	BankAccountHolder *string `json:"bank_account_holder,omitempty"`
	BankAccountNumber *string `json:"bank_account_number,omitempty"`
	BankIFSC          *string `json:"bank_ifsc,omitempty"`
	BankBranch        *string `json:"bank_branch,omitempty"`
	SignatureName     *string `json:"signature_name,omitempty"`
	InvoiceTerms      *string `json:"invoice_terms,omitempty"`
	InvoiceFooter     *string `json:"invoice_footer,omitempty"`
	// M23 additions (migration 073)
	UPIID             *string `json:"upi_id,omitempty"`
	PANNumber         *string `json:"pan_number,omitempty"`
	InstagramHandle   *string `json:"instagram_handle,omitempty"`
	StateCode         *string `json:"state_code,omitempty"`
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
		bankName, bankHolder, bankAcc, ifsc, branch, sig, terms, footer      string
		upiID, panNumber, instaHandle, stateCode                             string
	)
	if err := row.Scan(&name, &gstin, &addr1, &addr2, &city, &postal, &phone, &email, &website, &logo,
		&bankName, &bankHolder, &bankAcc, &ifsc, &branch, &sig, &terms, &footer,
		&upiID, &panNumber, &instaHandle, &stateCode); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to load profile: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"name":                name,
		"gstin":               gstin,
		"address_line1":       addr1,
		"address_line2":       addr2,
		"city":                city,
		"postal_code":         postal,
		"phone":               phone,
		"email":               email,
		"website":             website,
		"logo_url":            logo,
		"bank_name":           bankName,
		"bank_account_holder": bankHolder,
		"bank_account_number": bankAcc,
		"bank_ifsc":           ifsc,
		"bank_branch":         branch,
		"signature_name":      sig,
		"invoice_terms":       terms,
		"invoice_footer":      footer,
		"upi_id":              upiID,
		"pan_number":          panNumber,
		"instagram_handle":    instaHandle,
		"state_code":          stateCode,
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
	add("name", p.Name)
	add("gstin", p.GSTIN)
	add("address_line1", p.AddressLine1)
	add("address_line2", p.AddressLine2)
	add("city", p.City)
	add("postal_code", p.PostalCode)
	add("phone", p.Phone)
	add("email", p.Email)
	add("website", p.Website)
	add("logo_url", p.LogoURL)
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
