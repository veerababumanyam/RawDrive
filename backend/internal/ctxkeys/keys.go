// Package ctxkeys defines typed context keys shared across internal packages.
// This breaks the import cycle between middleware and ai: both import ctxkeys
// instead of each other, and context.Value matches on (type, value) so there
// is no risk of cross-package key collision.
package ctxkeys

// Key is the typed context key used throughout the backend.
// Using a named type prevents collisions with plain-string context keys
// from other packages.
type Key string

const (
	// WorkspaceID is the workspace UUID extracted from JWT claims or API key.
	WorkspaceID Key = "workspace_id"
)
