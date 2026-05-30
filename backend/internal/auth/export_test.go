package auth

// This file is only compiled during `go test` (because of the _test.go suffix)
// and lives in the production package so it can reach unexported fields.
// It exposes narrowly-scoped test hooks for other packages' tests.

// SetPasswordServiceCodeGeneratorForTest replaces the OTP code generator on a
// PasswordService. Tests use this to inject a deterministic generator so they
// can submit the matching OTP to ResetPassword and exercise the real code path
// instead of bypassing OTP verification.
//
// This is a test-only helper. It is not part of the production API.
func SetPasswordServiceCodeGeneratorForTest(svc PasswordService, fn func(int) (string, error)) {
	if ps, ok := svc.(*passwordService); ok {
		ps.codeGenerator = fn
	}
}

// MaskEmailForTest exposes the unexported maskEmail helper (F-070) so the
// external auth_test package can unit-test the masking rule directly.
// Test-only; not part of the production API.
func MaskEmailForTest(email string) string {
	return maskEmail(email)
}
