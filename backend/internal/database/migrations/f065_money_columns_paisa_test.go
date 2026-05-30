package migrations

// Regression test for F-065.
//
// Root cause: two M6 monetary columns stored INR as DECIMAL(10,2) instead of the
// BIGINT-paisa convention used everywhere else in billing (migration 022:
// subtotal_paisa, total_paisa, amount_paisa):
//
//   * coupon_redemptions.discount_applied (migration 027) DECIMAL(10,2)
//   * margin_ratios.fixed_incentive_inr   (migration 026) DECIMAL(10,2)
//
// The Go code already treats both as int64 paisa, so the DECIMAL columns are a
// 100x magnitude / scan-failure hazard: coupon_validation_service.go inserts a
// paisa int64 into discount_applied, and margin_repository.go scans
// fixed_incentive_inr into an int64 (truncating 500.00 -> 500 and erroring on
// fractional values).
//
// The fix:
//   * migration 027's up.sql now declares discount_applied as BIGINT (fresh DBs).
//   * a new append-only migration 124 converts already-applied DBs' columns to
//     BIGINT paisa via ROUND(col*100) and renames fixed_incentive_inr ->
//     fixed_incentive_paise.
//
// This is a pure-unit, hermetic guard (no database required): it scans the
// committed *.up.sql / *.down.sql files on disk. It fails on the broken tree
// (DECIMAL columns / inr name) and passes after the fix.

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// --- Forbidden legacy DECIMAL declarations (the bug shape) ---

var discountAppliedDecimalRe = regexp.MustCompile(
	`(?is)discount_applied\s+decimal`,
)

var fixedIncentiveInrDecimalRe = regexp.MustCompile(
	`(?is)fixed_incentive_inr\s+decimal`,
)

// --- Required corrected declarations ---

// 027 must declare discount_applied as BIGINT for fresh databases.
var discountAppliedBigintRe = regexp.MustCompile(
	`(?is)discount_applied\s+bigint`,
)

// Migration 124 must convert discount_applied to BIGINT for applied databases.
var convertDiscountToBigintRe = regexp.MustCompile(
	`(?is)alter\s+column\s+discount_applied\s+type\s+bigint`,
)

// Migration 124 must convert fixed_incentive_inr to BIGINT before renaming.
var convertFixedIncentiveToBigintRe = regexp.MustCompile(
	`(?is)alter\s+column\s+fixed_incentive_inr\s+type\s+bigint`,
)

// Migration 124 must rename fixed_incentive_inr -> fixed_incentive_paise.
var renameFixedIncentiveRe = regexp.MustCompile(
	`(?is)rename\s+column\s+fixed_incentive_inr\s+to\s+fixed_incentive_paise`,
)

// Down migration must rename fixed_incentive_paise back to fixed_incentive_inr.
var renameFixedIncentiveDownRe = regexp.MustCompile(
	`(?is)rename\s+column\s+fixed_incentive_paise\s+to\s+fixed_incentive_inr`,
)

// readDownMigrations loads every *.down.sql in the working dir (migrations dir).
func readDownMigrations(t *testing.T) map[string]string {
	t.Helper()

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read migrations dir: %v", err)
	}

	out := make(map[string]string)
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".down.sql") {
			continue
		}
		b, err := os.ReadFile(name)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		out[name] = string(b)
	}
	if len(out) == 0 {
		t.Fatal("no *.down.sql migrations found in working dir")
	}
	return out
}

// TestF065_NoNewMonetaryColumnDeclaredAsDecimal guards against any NEW migration
// (re)introducing a DECIMAL monetary column for these fields. It deliberately
// EXEMPTS the two committed, append-only creator migrations:
//
//   - 026 created fixed_incentive_inr DECIMAL — committed and never edited here;
//     migration 124 converts the value to BIGINT and renames it to
//     fixed_incentive_paise (asserted by TestF065_Migration124ConvertsBothColumns).
//   - 027 originally created discount_applied DECIMAL but is OWNED and corrected to
//     BIGINT (asserted by TestF065_DiscountApplied027IsBigint); it must therefore
//     no longer match the DECIMAL form.
//
// Any OTHER migration that declares either column as DECIMAL would be a fresh
// regression and fails here. This respects the append-only invariant (026 keeps
// its historical declaration) while still pinning the convention going forward.
func TestF065_NoNewMonetaryColumnDeclaredAsDecimal(t *testing.T) {
	ups := readUpMigrations(t)

	for name, sql := range ups {
		// discount_applied DECIMAL is only ever legitimately absent now: 027
		// was corrected to BIGINT, so ANY file matching the DECIMAL form
		// (including a regressed 027) is a failure.
		if discountAppliedDecimalRe.MatchString(sql) {
			t.Errorf("%s declares discount_applied as DECIMAL; must be BIGINT paisa (F-065)", name)
		}
		// fixed_incentive_inr DECIMAL is permitted ONLY in committed creator
		// migration 026 (append-only; converted+renamed by 124). Any other file
		// reintroducing it as DECIMAL is a regression.
		if fixedIncentiveInrDecimalRe.MatchString(sql) && name != "026_create_m6_dealer_tables.up.sql" {
			t.Errorf("%s declares fixed_incentive_inr as DECIMAL outside the committed 026 creator; must be BIGINT paisa, renamed fixed_incentive_paise via migration 124 (F-065)", name)
		}
	}
}

// TestF065_DiscountApplied027IsBigint pins migration 027's corrected fresh-DB
// declaration: discount_applied BIGINT.
func TestF065_DiscountApplied027IsBigint(t *testing.T) {
	const fname = "027_create_m6_coupon_tables.up.sql"
	b, err := os.ReadFile(fname)
	if err != nil {
		t.Fatalf("read %s: %v", fname, err)
	}
	sql := string(b)

	if !discountAppliedBigintRe.MatchString(sql) {
		t.Fatalf("%s must declare discount_applied BIGINT (paisa), not DECIMAL (F-065)", fname)
	}
	if discountAppliedDecimalRe.MatchString(sql) {
		t.Fatalf("%s still declares discount_applied DECIMAL (F-065)", fname)
	}
}

// TestF065_Migration124ConvertsBothColumns asserts the append-only conversion
// migration converts both legacy DECIMAL columns to BIGINT paisa and renames
// fixed_incentive_inr -> fixed_incentive_paise for already-applied databases.
func TestF065_Migration124ConvertsBothColumns(t *testing.T) {
	const fname = "124_money_columns_to_paisa.up.sql"
	b, err := os.ReadFile(fname)
	if err != nil {
		t.Fatalf("read %s (the conversion migration is missing): %v", fname, err)
	}
	sql := string(b)

	if !convertDiscountToBigintRe.MatchString(sql) {
		t.Errorf("%s must ALTER COLUMN discount_applied TYPE BIGINT (F-065)", fname)
	}
	if !convertFixedIncentiveToBigintRe.MatchString(sql) {
		t.Errorf("%s must ALTER COLUMN fixed_incentive_inr TYPE BIGINT (F-065)", fname)
	}
	if !renameFixedIncentiveRe.MatchString(sql) {
		t.Errorf("%s must RENAME COLUMN fixed_incentive_inr TO fixed_incentive_paise (F-065)", fname)
	}
}

// TestF065_Migration124DownIsReversible asserts the down migration restores the
// fixed_incentive_inr column name so the pair is reversible.
func TestF065_Migration124DownIsReversible(t *testing.T) {
	downs := readDownMigrations(t)
	const fname = "124_money_columns_to_paisa.down.sql"
	sql, ok := downs[fname]
	if !ok {
		t.Fatalf("%s is missing; migration 124 must be reversible (F-065)", fname)
	}
	if !renameFixedIncentiveDownRe.MatchString(sql) {
		t.Fatalf("%s must RENAME COLUMN fixed_incentive_paise TO fixed_incentive_inr (F-065)", fname)
	}
}
