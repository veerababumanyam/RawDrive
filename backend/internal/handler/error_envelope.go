package handler

// error_envelope.go — M14 GAL-FR-202: standardized error envelope.
//
// Every API error response follows the shape:
//
//	{
//	  "error": {
//	    "code":       "product_not_found",
//	    "message":    "product not found",
//	    "request_id": "uuid",
//	    "timestamp":  "2026-04-10T05:30:00Z"
//	  }
//	}
//
// The request_id comes from the X-Request-ID header if set by an upstream
// proxy, otherwise a fresh UUID is minted so every error response is
// traceable. The timestamp is ISO-8601 UTC.
//
// Existing call sites that use plain http.Error continue to work — this
// helper is additive. New handlers should prefer respondError so the
// shape is consistent across the API surface.

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ErrorEnvelope is the JSON body returned by respondError.
type ErrorEnvelope struct {
	Error ErrorEnvelopeBody `json:"error"`
}

// ErrorEnvelopeBody is the inner field of ErrorEnvelope.
type ErrorEnvelopeBody struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
	Timestamp string `json:"timestamp"`
}

// respondError writes a standardized error envelope to the response.
// code should be a short snake_case identifier the client can switch on;
// message is a human-readable description safe to surface to end users.
func respondError(w http.ResponseWriter, status int, code, message string) {
	env := ErrorEnvelope{
		Error: ErrorEnvelopeBody{
			Code:      code,
			Message:   message,
			RequestID: "",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		},
	}
	// If the surrounding request has a request ID on the header, use it.
	// Otherwise mint a fresh one so every error is traceable.
	if rid := w.Header().Get("X-Request-ID"); rid != "" {
		env.Error.RequestID = rid
	} else {
		env.Error.RequestID = uuid.NewString()
		w.Header().Set("X-Request-ID", env.Error.RequestID)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(env)
}
