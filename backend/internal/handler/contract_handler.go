package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type ContractHandler struct {
	repo *repository.ContractRepo
	pdf  *service.PDFService
}

func NewContractHandler(repo *repository.ContractRepo) *ContractHandler {
	return &ContractHandler{repo: repo}
}

// WithPDFService wires the PDF renderer used by DownloadPDF. Safe to call
// with nil — DownloadPDF responds 503 when the renderer is not wired.
func (h *ContractHandler) WithPDFService(p *service.PDFService) *ContractHandler {
	h.pdf = p
	return h
}

// Template handlers

func (h *ContractHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var t repository.ContractTemplate
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	t.WorkspaceID = workspaceID
	if err := h.repo.CreateTemplate(r.Context(), &t); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, t)
}

func (h *ContractHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	templates, err := h.repo.ListTemplates(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, templates)
}

// Contract handlers

func (h *ContractHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var c repository.Contract
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	c.WorkspaceID = workspaceID
	if c.Status == "" {
		c.Status = "draft"
	}
	if err := h.repo.Create(r.Context(), &c); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, c)
}

func (h *ContractHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid contract id"}`, http.StatusBadRequest)
		return
	}
	contract, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, contract)
}

func (h *ContractHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	contracts, err := h.repo.List(r.Context(), workspaceID, r.URL.Query().Get("status"), 50)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, contracts)
}

// htmlTagsRe matches HTML tags so we can strip them for plain-text PDF
// rendering. The body column stores rendered contract HTML; the PDF
// renderer expects plain text.
var htmlTagsRe = regexp.MustCompile(`<[^>]*>`)

// stripHTMLToText produces a reasonable plain-text form of the contract
// body. Block-level tags become newlines, then every remaining tag is
// removed. We intentionally keep this dependency-free.
func stripHTMLToText(s string) string {
	if s == "" {
		return ""
	}
	// Normalize common block tags to newlines before stripping.
	replacements := [][2]string{
		{"<br>", "\n"},
		{"<br/>", "\n"},
		{"<br />", "\n"},
		{"</p>", "\n\n"},
		{"</h1>", "\n\n"},
		{"</h2>", "\n\n"},
		{"</h3>", "\n\n"},
		{"</li>", "\n"},
		{"</div>", "\n"},
	}
	out := s
	for _, pair := range replacements {
		out = replaceCaseInsensitive(out, pair[0], pair[1])
	}
	return htmlTagsRe.ReplaceAllString(out, "")
}

// replaceCaseInsensitive does a case-insensitive literal replacement.
// Tiny helper — regexp compilation is too heavy for every call site.
func replaceCaseInsensitive(s, old, new string) string {
	if old == "" {
		return s
	}
	lowerS := toLowerASCII(s)
	lowerOld := toLowerASCII(old)
	var out []byte
	i := 0
	for {
		idx := indexOf(lowerS[i:], lowerOld)
		if idx < 0 {
			out = append(out, s[i:]...)
			break
		}
		out = append(out, s[i:i+idx]...)
		out = append(out, new...)
		i += idx + len(old)
	}
	return string(out)
}

func toLowerASCII(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

func indexOf(s, substr string) int {
	if len(substr) == 0 {
		return 0
	}
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// DownloadPDF renders the contract as a PDF document and streams it to the
// caller. The body is stored as HTML; we strip tags into plain text since
// the minimal PDF writer does not support HTML layout.
func (h *ContractHandler) DownloadPDF(w http.ResponseWriter, r *http.Request) {
	if h.pdf == nil {
		http.Error(w, `{"error":"pdf service not configured"}`, http.StatusServiceUnavailable)
		return
	}
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid contract id"}`, http.StatusBadRequest)
		return
	}
	contract, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	payload := service.Contract{
		Title:       contract.Title,
		ContractID:  contract.ID.String(),
		PartyA:      "Workspace " + contract.WorkspaceID.String(),
		PartyB:      "Contact " + contract.ContactID.String(),
		EffectiveOn: contract.CreatedAt.Format("2 Jan 2006"),
		Body:        stripHTMLToText(contract.ContentHTML),
	}

	bytesOut, err := h.pdf.RenderContract(payload)
	if err != nil {
		http.Error(w, `{"error":"failed to render pdf"}`, http.StatusInternalServerError)
		return
	}

	filename := "contract-" + contract.ID.String() + ".pdf"
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(bytesOut)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(bytesOut)
}
