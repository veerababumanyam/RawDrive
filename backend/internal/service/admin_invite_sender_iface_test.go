package service

import (
	"github.com/rawdrive/backend/internal/email"
)

// Compile-time assertion that *email.InvitationSender satisfies the
// AdminInviteSender interface. main.go performs a type assertion to
// wire the invite sender without a forced dependency on email from
// this package; if the method signature drifts, this line fails to
// compile and the wiring silently becoming a no-op is prevented.
var _ AdminInviteSender = (*email.InvitationSender)(nil)
