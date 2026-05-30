package passwordpolicy

import "fmt"

// MaxBcryptInputBytes is bcrypt's hard input limit. Keep password/PIN length
// checks byte-based because golang.org/x/crypto/bcrypt rejects longer inputs.
const MaxBcryptInputBytes = 72

// FitsBcrypt reports whether value can be passed to bcrypt without hitting its
// hard input-length error.
func FitsBcrypt(value string) bool {
	return len(value) <= MaxBcryptInputBytes
}

// ValidateBcryptInput returns a user-facing length error for values that are
// eventually hashed with bcrypt.
func ValidateBcryptInput(label, value string) error {
	if FitsBcrypt(value) {
		return nil
	}
	return fmt.Errorf("%s must be at most %d characters", label, MaxBcryptInputBytes)
}
