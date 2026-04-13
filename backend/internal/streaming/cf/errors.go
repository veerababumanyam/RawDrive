package cf

import (
	"errors"
	"fmt"
)

// ErrCFNetwork is returned when a CF API request fails at the transport layer
// (DNS, connection refused, TLS, timeout) with no usable HTTP response.
var ErrCFNetwork = errors.New("cf: network error")

// CFError is a typed error carrying the HTTP status code and a coarse
// classification of what went wrong. Callers can errors.As into *CFError
// to branch on Code or Type without string-matching.
type CFError struct {
	Code int    // HTTP status code (0 if pre-HTTP failure — see ErrCFNetwork instead)
	Type string // "unauthorized" | "not_found" | "rate_limited" | "server" | "bad_request" | "other"
	Err  error  // underlying cause (decoded CF API error, or io error)
}

func (e *CFError) Error() string {
	if e == nil {
		return ""
	}
	if e.Err != nil {
		return fmt.Sprintf("cf: %s (status=%d): %v", e.Type, e.Code, e.Err)
	}
	return fmt.Sprintf("cf: %s (status=%d)", e.Type, e.Code)
}

func (e *CFError) Unwrap() error { return e.Err }

// Sentinel instances used for comparisons via errors.Is. Handlers that need
// to branch on a specific failure mode can compare against these.
var (
	ErrCFUnauthorized = &CFError{Code: 401, Type: "unauthorized"}
	ErrCFForbidden    = &CFError{Code: 403, Type: "forbidden"}
	ErrCFNotFound     = &CFError{Code: 404, Type: "not_found"}
	ErrCFRateLimited  = &CFError{Code: 429, Type: "rate_limited"}
)

// Is lets callers write errors.Is(err, ErrCFUnauthorized) etc.
func (e *CFError) Is(target error) bool {
	t, ok := target.(*CFError)
	if !ok {
		return false
	}
	return e.Code == t.Code && e.Type == t.Type
}

// classifyStatus maps an HTTP status code to a canonical *CFError.
func classifyStatus(code int, body []byte) *CFError {
	switch {
	case code == 401:
		return &CFError{Code: code, Type: "unauthorized", Err: bodyErr(body)}
	case code == 403:
		return &CFError{Code: code, Type: "forbidden", Err: bodyErr(body)}
	case code == 404:
		return &CFError{Code: code, Type: "not_found", Err: bodyErr(body)}
	case code == 429:
		return &CFError{Code: code, Type: "rate_limited", Err: bodyErr(body)}
	case code >= 400 && code < 500:
		return &CFError{Code: code, Type: "bad_request", Err: bodyErr(body)}
	case code >= 500:
		return &CFError{Code: code, Type: "server", Err: bodyErr(body)}
	default:
		return &CFError{Code: code, Type: "other", Err: bodyErr(body)}
	}
}

func bodyErr(b []byte) error {
	if len(b) == 0 {
		return nil
	}
	return errors.New(string(b))
}
