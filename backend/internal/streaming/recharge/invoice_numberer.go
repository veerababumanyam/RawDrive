package recharge

// Invoice numbering: monthly-rolling, workspace-scoped, gap-free per month.
// Format: RD-{YYYY}{MM}-{workspace-prefix}-{NNNN}
// Example: RD-202604-AB12-0001
//
// We compute NNNN by counting existing invoices for this (workspace, month)
// and adding 1. Concurrency: the streaming_invoices.invoice_number UNIQUE
// constraint catches the (rare) race; the caller may retry.

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PerMonthInvoiceNumberer is the production InvoiceNumberer implementation.
type PerMonthInvoiceNumberer struct {
	pool *pgxpool.Pool
}

// NewInvoiceNumberer constructs a PerMonthInvoiceNumberer.
func NewInvoiceNumberer(pool *pgxpool.Pool) *PerMonthInvoiceNumberer {
	return &PerMonthInvoiceNumberer{pool: pool}
}

// Next implements InvoiceNumberer.
func (n *PerMonthInvoiceNumberer) Next(ctx context.Context, workspaceID uuid.UUID, issuedAt time.Time) (string, error) {
	monthStart := time.Date(issuedAt.Year(), issuedAt.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := monthStart.AddDate(0, 1, 0)

	var count int
	err := n.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM streaming_invoices
		  WHERE workspace_id = $1
		    AND issued_at >= $2 AND issued_at < $3`,
		workspaceID, monthStart, monthEnd,
	).Scan(&count)
	if err != nil {
		return "", fmt.Errorf("invoice number count: %w", err)
	}

	prefix := strings.ToUpper(workspaceID.String())[:4]
	return fmt.Sprintf("RD-%04d%02d-%s-%04d",
		issuedAt.Year(), int(issuedAt.Month()), prefix, count+1), nil
}
