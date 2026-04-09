package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// QuotaEnforcer checks storage quota before allowing uploads.
func QuotaEnforcer(storageSvc *service.StorageAccounting) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only enforce on upload endpoints
			if r.Method != http.MethodPost && r.Method != http.MethodPatch {
				next.ServeHTTP(w, r)
				return
			}

			// Skip if no storage service configured
			if storageSvc == nil {
				next.ServeHTTP(w, r)
				return
			}

			claims := JWTClaimsFromContext(r.Context())
			if claims == nil {
				next.ServeHTTP(w, r)
				return
			}

			// Check content-length as a pre-flight estimate
			contentLength := r.ContentLength
			if contentLength <= 0 {
				// Can't pre-check without content-length; let the upload handler enforce
				next.ServeHTTP(w, r)
				return
			}

			wsIDStr, _ := claims["workspace_id"].(string)
			wsID, parseErr := uuid.Parse(wsIDStr)
			if parseErr != nil {
				next.ServeHTTP(w, r)
				return
			}

			allowed, err := storageSvc.CheckQuota(r.Context(), wsID, contentLength)
			if err != nil {
				// Fail open — don't block uploads due to quota check errors
				next.ServeHTTP(w, r)
				return
			}
			if !allowed {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"error":"storage_quota_exceeded","message":"Your workspace has exceeded its storage quota. Please upgrade your plan or delete unused assets."}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
