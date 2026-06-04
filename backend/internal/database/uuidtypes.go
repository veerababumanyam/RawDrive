package database

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// RegisterUUIDTypes teaches a pgx connection how to encode google/uuid values
// as Postgres uuid / uuid[] when the pool runs in QueryExecModeExec — which
// production uses for pgbouncer compatibility (see the pool configs in
// cmd/api/main.go and newMigrationPoolConfig).
//
// WHY THIS IS LOAD-BEARING:
//
//	In exec mode pgx performs NO Describe round-trip, so it cannot infer the
//	Postgres OID for a Go []uuid.UUID parameter. A bulk lookup like
//	`... WHERE id = ANY($1::uuid[])` (poolAssetBatchSource.GetByIDs,
//	AssetRepo.GetByIDs, BulkAddTags, …) then fails at encode time with:
//	  unable to encode []uuid.UUID{…} into text format for unknown type
//	  (OID 0): cannot find encode plan
//	which surfaced as a production-only "Failed to list assets: 500" on every
//	gallery open (the SQL ::uuid[] cast added in #149 does not help — the
//	failure is Go-side, before the query is sent). cache_statement mode (dev
//	without pgbouncer / older test pools) masked it because its Describe step
//	learns the array OID. Mapping the Go types to the built-in uuid / _uuid pg
//	types fixes EVERY array-bind call site at once, in every exec mode.
//
// Wire it as the pgxpool AfterConnect hook on every runtime pool.
func RegisterUUIDTypes(ctx context.Context, conn *pgx.Conn) error {
	tm := conn.TypeMap()
	tm.RegisterDefaultPgType(uuid.UUID{}, "uuid")
	tm.RegisterDefaultPgType([]uuid.UUID{}, "_uuid")
	tm.RegisterDefaultPgType([]*uuid.UUID{}, "_uuid")
	return nil
}
