package main

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeProviders(t *testing.T) {
	all, err := normalizeProviders("all")
	require.NoError(t, err)
	assert.Equal(t, []string{"razorpay", "phonepe"}, all)

	rzp, err := normalizeProviders("razorpay")
	require.NoError(t, err)
	assert.Equal(t, []string{"razorpay"}, rzp)

	_, err = normalizeProviders("cash")
	require.Error(t, err)
}

func TestValidateCatalogSnapshotDetectsAmountMismatch(t *testing.T) {
	snapshot := mustSnapshot(t, 49900)
	order := testSettlementOrder("billing_orders", "storage_booster", 39900, snapshot)

	out := validateCatalogSnapshot(order)

	require.Len(t, out.Issues, 1)
	assert.Equal(t, "snapshot_amount_mismatch", out.Issues[0].Code)
	assert.Equal(t, "billing_product_checkout_snapshot.v1", out.Schema)
}

func TestValidateCatalogSnapshotAcceptsMatchingAmount(t *testing.T) {
	snapshot := mustSnapshot(t, 49900)
	order := testSettlementOrder("billing_orders", "storage_booster", 49900, snapshot)

	out := validateCatalogSnapshot(order)

	assert.Empty(t, out.Issues)
	assert.Equal(t, "billing_product_checkout_snapshot.v1", out.Schema)
}

func TestSettlementActionsDescribeSubscriptionRenewal(t *testing.T) {
	order := testSettlementOrder("subscription_upgrade_orders", "subscription_renewal", 99900, mustSnapshot(t, 99900))

	actions := settlementActions(order)

	assert.Contains(t, actions, "extend active subscription expiry from current future expiry or now")
	assert.Contains(t, actions, "schedule payment-success, renewal, expiry, deletion, gallery-delete, and account-delete jobs")
}

func TestHasBlockingIssuesOnlyErrors(t *testing.T) {
	assert.False(t, hasBlockingIssues([]dryRunIssue{{Severity: "warning"}}))
	assert.True(t, hasBlockingIssues([]dryRunIssue{{Severity: "error"}}))
}

func mustSnapshot(t *testing.T, amount int64) []byte {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"snapshot_schema": "billing_product_checkout_snapshot.v1",
		"billing": map[string]any{
			"amount_paise": amount,
			"currency":     "INR",
		},
		"product": map[string]any{
			"version_id": uuid.NewString(),
			"code":       "storage_boost_50",
		},
	})
	require.NoError(t, err)
	return body
}

func testSettlementOrder(sourceTable, orderType string, amount int64, snapshot []byte) settlementOrder {
	return settlementOrder{
		ID:              uuid.New(),
		SourceTable:     sourceTable,
		WorkspaceID:     uuid.New(),
		Provider:        "razorpay",
		ProviderOrderID: "order_test",
		OrderType:       orderType,
		TargetType:      "workspace",
		Status:          "pending",
		AmountPaise:     amount,
		Currency:        "INR",
		CatalogSnapshot: snapshot,
		CreatedAt:       time.Now().UTC(),
	}
}
