package handlers

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/streaming/ledger"
)

// pgxpoolQuerier adapts *pgxpool.Pool to ledger.Querier so the handler can
// compose the pure-logic ledger package without leaking pgx types into it.
type pgxpoolQuerier struct{ pool *pgxpool.Pool }

func (p *pgxpoolQuerier) QueryIter(ctx context.Context, sql string, args ...any) (ledger.RowIterator, error) {
	rows, err := p.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return &pgxRowsIter{rows: rows}, nil
}

type pgxRowsIter struct{ rows pgx.Rows }

func (p *pgxRowsIter) Next() bool             { return p.rows.Next() }
func (p *pgxRowsIter) Scan(dest ...any) error { return p.rows.Scan(dest...) }
func (p *pgxRowsIter) Err() error             { return p.rows.Err() }
func (p *pgxRowsIter) Close()                 { p.rows.Close() }
