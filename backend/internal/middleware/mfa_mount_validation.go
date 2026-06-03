package middleware

// ISSUE-006 (brownfield P1): The RequireMFA middleware reads
// mfa_verified from JWT claims, which are injected by JWTAuth. The
// required mount order — JWTAuth first, RequireMFA second — was
// previously enforced only by a comment in require_mfa.go. A future
// change that mounts RequireMFA without JWTAuth in front would not
// immediately break (the default-deny in RequireMFA returns 401) but
// would produce a confusing error and a fragile invariant.
//
// ValidateMFAMountOrder walks every leaf route in the given router
// and, for any route whose middleware chain includes RequireMFA,
// verifies JWTAuth appears earlier in the same chain. Any violation
// is collected and returned as a single joined error. Call this
// from main.go right before ListenAndServe; fail FATAL on a non-nil
// return.

import (
	"fmt"
	"net/http"
	"reflect"
	"runtime"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Runtime function name markers used to identify the target
// middlewares inside a chi middleware chain. These are compared
// against runtime.FuncForPC(..).Name() for each middleware value
// chi.Walk exposes.
//
//   - RequireMFA is a package-level function, so its value resolves
//     to an exact stable symbol name regardless of inlining.
//   - JWTAuth is a factory that returns a closure. The Go compiler
//     aggressively inlines factory calls, which attributes the
//     returned closure to the call site. Observed runtime names for
//     JWTAuth closures include:
//     ".../middleware.JWTAuth.func1"                          (un-inlined)
//     "main.main.JWTAuth.func4"                               (inlined into main)
//     ".../middleware.TestXxx.JWTAuth.func1"                  (inlined into a test)
//     All three share the substring "JWTAuth.func", which is a
//     Go-specific naming convention for closures returned from a
//     function called JWTAuth. Matching on that substring catches
//     every inlining variant without false-matching unrelated
//     functions.
const (
	requireMFAFuncName   = "github.com/rawdrive/backend/internal/middleware.RequireMFA"
	jwtAuthFuncSubstring = "JWTAuth.func"
)

// ValidateMFAMountOrder walks r and checks the invariant that every
// route mounting RequireMFA also has JWTAuth earlier in its
// middleware chain. Returns nil when the invariant holds for every
// registered route, or an error enumerating all violations.
//
// The walk is performed via chi.Walk, which visits every leaf
// handler and passes the full effective middleware chain — including
// middlewares inherited from parent subrouters.
func ValidateMFAMountOrder(r chi.Routes) error {
	var problems []string

	walkErr := chi.Walk(r, func(method, route string, _ http.Handler, mws ...func(http.Handler) http.Handler) error {
		jwtIdx, mfaIdx := -1, -1
		for i, mw := range mws {
			name := middlewareFuncName(mw)
			switch {
			case name == requireMFAFuncName:
				if mfaIdx == -1 {
					mfaIdx = i
				}
			case strings.Contains(name, jwtAuthFuncSubstring):
				if jwtIdx == -1 {
					jwtIdx = i
				}
			}
		}
		if mfaIdx == -1 {
			// Route does not use RequireMFA; nothing to validate.
			return nil
		}
		if jwtIdx == -1 {
			problems = append(problems, fmt.Sprintf("%-6s %s — RequireMFA mounted without JWTAuth", method, route))
			return nil
		}
		if jwtIdx > mfaIdx {
			problems = append(problems, fmt.Sprintf("%-6s %s — RequireMFA (pos %d) mounted before JWTAuth (pos %d)", method, route, mfaIdx, jwtIdx))
		}
		return nil
	})
	if walkErr != nil {
		return fmt.Errorf("validate MFA mount order: walk failed: %w", walkErr)
	}
	if len(problems) > 0 {
		return fmt.Errorf("MFA mount order violations (ISSUE-006 invariant):\n  - %s", strings.Join(problems, "\n  - "))
	}
	return nil
}

// middlewareFuncName returns the fully-qualified symbol name of a
// middleware function value as reported by the Go runtime. Returns
// an empty string when the value's entry point cannot be resolved
// (which should not happen for real middlewares but is defended for
// robustness).
func middlewareFuncName(mw func(http.Handler) http.Handler) string {
	if mw == nil {
		return ""
	}
	ptr := reflect.ValueOf(mw).Pointer()
	if ptr == 0 {
		return ""
	}
	fn := runtime.FuncForPC(ptr)
	if fn == nil {
		return ""
	}
	return fn.Name()
}
