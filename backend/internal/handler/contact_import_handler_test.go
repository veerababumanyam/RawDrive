package handler

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
)

// buildContactImportMultipart returns a multipart/form-data body whose "file"
// field is csvPayload, optionally padded with filler bytes appended to the
// "file" part so the total upload size can be driven past the cap. The exact
// padding contents are irrelevant: when the upload exceeds the cap, the limit
// fires during multipart parsing, long before the CSV is ever read.
func buildContactImportMultipart(t *testing.T, csvPayload string, padBytes int) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	mw := multipart.NewWriter(body)
	part, err := mw.CreateFormFile("file", "contacts.csv")
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	if _, err := part.Write([]byte(csvPayload)); err != nil {
		t.Fatalf("write csv: %v", err)
	}
	if padBytes > 0 {
		if _, err := part.Write(bytes.Repeat([]byte("a"), padBytes)); err != nil {
			t.Fatalf("write padding: %v", err)
		}
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	return body, mw.FormDataContentType()
}

func newContactImportRequest(t *testing.T, csvPayload string, padBytes int) *http.Request {
	t.Helper()
	body, contentType := buildContactImportMultipart(t, csvPayload, padBytes)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/crm/contacts/import", body)
	req.Header.Set("Content-Type", contentType)
	// Inject a workspace so the handler proceeds past getWorkspaceID to the
	// multipart-size gate.
	ctx := middleware.WithWorkspaceID(req.Context(), uuid.New().String())
	return req.WithContext(ctx)
}

// TestF055_ImportCSV_RejectsOversizedUpload is the regression guard for F-055:
// a body larger than the 5MB cap must be rejected with 413 during multipart
// parsing — before the payload reaches ImportContactsCSV. Because the size gate
// short-circuits ahead of any repo/service call, a handler with a nil repo is
// safe here and never dereferenced.
//
// Before the fix this returned 400 ("file required") at best, or streamed the
// full ~32MB-capable body into the service — never a 413.
func TestF055_ImportCSV_RejectsOversizedUpload(t *testing.T) {
	h := &ContactHandler{repo: nil} // never touched: size gate fires first

	// header + 6MB of padding > 5MB cap.
	req := newContactImportRequest(t, "name,email\n", 6<<20)
	rec := httptest.NewRecorder()

	h.ImportCSV(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized upload: expected status %d, got %d (body=%q)",
			http.StatusRequestEntityTooLarge, rec.Code, rec.Body.String())
	}
}

// TestF055_ImportCSV_AcceptsUnderCapUpload proves the cap does not reject a
// reasonably-sized CSV: a small header-only body parses past
// ParseMultipartForm/FormFile and is handled normally. With a header but no
// data rows, ImportContactsCSV returns a zero-import result without ever
// dereferencing the repo, so the handler responds 200 — and crucially NOT 413.
func TestF055_ImportCSV_AcceptsUnderCapUpload(t *testing.T) {
	h := &ContactHandler{repo: nil} // header-only CSV never calls repo.Create

	// Header only, no padding — well under the 5MB cap.
	req := newContactImportRequest(t, "name,email,phone\n", 0)
	rec := httptest.NewRecorder()

	h.ImportCSV(rec, req)

	if rec.Code == http.StatusRequestEntityTooLarge {
		t.Fatalf("under-cap upload was wrongly rejected at the size gate with 413 (body=%q)",
			rec.Body.String())
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("under-cap upload: expected status %d, got %d (body=%q)",
			http.StatusOK, rec.Code, rec.Body.String())
	}
}
