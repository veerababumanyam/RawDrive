# RawDrive HTTP API — OpenAPI Strategy

ISSUE-004 (brownfield P1, contract) establishes the strategy for producing and maintaining an OpenAPI specification for the ~272 HTTP endpoints registered across `backend/internal/handler/routes_*.go` and `admin_routes.go`.

**Status as of this document:** the repository previously had zero OpenAPI spec. This directory is the scaffold. The 272-endpoint backfill is a separate milestone tracked in the project backlog.

## Chosen approach: progressive swag annotations

After weighing the options (annotations vs contract-first vs reflection-based codegen), RawDrive uses [`swaggo/swag`](https://github.com/swaggo/swag) to generate an OpenAPI 2.0 specification from inline annotations on Go handler functions.

**Why this approach:**

- **Progressive adoption.** Annotations are added to new endpoints at the point of writing. Existing endpoints are backfilled milestone-by-milestone. We never have to stop-the-world for a 272-endpoint rewrite.
- **Colocated with source.** Engineers maintain API docs in the same file as the handler, so drift between the spec and the code is harder to introduce and easier to spot in review.
- **No router replacement.** Reflection-based tools (`ogen`, `goapi-gen`) require regenerating typed handlers from a spec, which would force a rewrite of the Chi router setup across all 272 endpoints. Swag runs as a build-time annotation scanner and leaves the router alone.
- **Generates a file we can lint.** A concrete `swagger.yaml` / `swagger.json` can be checked into git, diffed in PRs, and validated by CI schema linters — catching accidental breaking changes before merge.

**What we explicitly deferred:**

- A hand-written contract-first `openapi.yaml` covering all 272 endpoints. Too much upfront cost, and the code is already the source of truth.
- OpenAPI 3.1. Swag targets OpenAPI 2.0 (Swagger 2.0); a future migration to 3.0 or 3.1 can use `swagger2openapi` or `swag init --v3.1` (swag v2 supports this in preview). Not worth blocking on today.

## Installing swag

Swag is a developer tool (`cmd/swag`), not a runtime dependency. Install locally:

```bash
go install github.com/swaggo/swag/cmd/swag@latest
```

Verify:

```bash
swag --version
```

If you cannot install globally, `go run github.com/swaggo/swag/cmd/swag@latest init ...` also works but is slower.

## Generating the spec

From the repo root:

```bash
swag init \
  --generalInfo backend/cmd/api/main.go \
  --dir backend/cmd/api,backend/internal/handler \
  --output docs/api \
  --parseDependency \
  --parseInternal
```

This produces:

- `docs/api/swagger.yaml` — human-readable OpenAPI 2.0 spec
- `docs/api/swagger.json` — machine-readable equivalent
- `docs/api/docs.go` — Go package that embeds the spec for runtime serving (optional, not wired yet)

Commit the regenerated `swagger.yaml` as part of any PR that adds or modifies an annotated endpoint.

## Annotation format

Swag reads structured comments above each handler method and above `main.go` for general metadata. The minimum useful annotation for a handler is:

```go
// BulkAction handles POST /api/v1/assets/bulk
//
//	@Summary      Bulk asset operations
//	@Description  Apply update_status / move / delete / set_rating / set_label / add_tags / remove_tags to multiple assets at once, scoped to the caller's workspace.
//	@Tags         assets, bulk
//	@Security     BearerAuth
//	@Accept       json
//	@Produce      json
//	@Param        from_gallery_id  query     string  false  "required for action=move"
//	@Param        body             body      BulkActionInput true "action + asset ids + action-specific fields"
//	@Success      200              {object}  BulkActionResponse
//	@Failure      400              {object}  ErrorResponse "invalid input"
//	@Failure      500              {object}  ErrorResponse "bulk operation failed"
//	@Router       /api/v1/assets/bulk [post]
func (h *BulkAssetHandler) BulkAction(w http.ResponseWriter, r *http.Request) {
```

Key rules:

- Annotations are tab-indented immediately after a blank comment line below the function summary.
- Every route takes at least one `@Param` per path/query/header parameter.
- `@Success` + `@Failure` refer to Go types that must be annotated with swag-compatible struct tags (or at minimum be exported). Embed-by-reference works via `{object} TypeName`.
- `@Security BearerAuth` should appear on every authenticated route. The top-level `@securityDefinitions.apikey` is in `main.go` (see below).

## Top-level `main.go` annotations

Add these once at the top of `backend/cmd/api/main.go`, above `func main()`:

```go
// @title                      RawDrive API
// @version                    1.0
// @description                Multi-tenant photo-gallery platform API. Auth is Bearer JWT; OTP is registration-only.
// @termsOfService             https://rawdrive.in/terms
//
// @contact.name   RawDrive Support
// @contact.url    https://rawdrive.in/contact
// @contact.email  support@rawdrive.in
//
// @license.name   Proprietary
// @license.url    https://rawdrive.in/legal
//
// @host           api.rawdrive.in
// @BasePath       /api/v1
// @schemes        https
//
// @securityDefinitions.apikey BearerAuth
// @in             header
// @name           Authorization
// @description    "Bearer {token}" — JWT access token from POST /auth/login or POST /auth/verify-totp.
func main() { ... }
```

Do this only once you are ready to run `swag init` and commit the generated spec. Until then the annotations are inert.

## Backfill plan

The 272-endpoint backfill is tracked as its own milestone. The proposed ordering walks through `routes_*.go` milestone-by-milestone so each annotated wave lands together:

| Wave | Route file | Approx. endpoints | Priority |
|---|---|---|---|
| 1 | `routes_m2.go` | M2 gallery + asset read/write | high — user-facing |
| 2 | `routes_m4.go` | M4 upload + proofing | high — user-facing |
| 3 | `admin_routes.go` | admin panel | medium — internal |
| 4 | `routes_m5.go` | M5 marketplace | medium |
| 5 | `routes_m6.go` | M6 dealer | medium |
| 6 | `routes_m8.go` | M8 misc | medium |
| 7 | `routes_events.go` | events | low |
| 8 | `routes_m3.go` | M3 team | low |

Each wave ships: (a) annotations added, (b) `swag init` re-run, (c) `docs/api/swagger.yaml` committed in the same PR as the annotations.

## CI enforcement (future)

Once the first wave lands, add a CI step that fails the build if `swag init` produces a diff against `docs/api/swagger.yaml`. This turns the spec into a true single source of truth — engineers cannot ship annotation drift without noticing.

Until that step exists, the spec is advisory and drift is detected by reviewers.

## What lives in `docs/api/` today

- `README.md` — this strategy document
- `openapi-skeleton.yaml` — a minimal OpenAPI 2.0 stub you can use as a starting point if you run `swag init` before the first wave. Hand-written, not generated.

Generated files (`swagger.yaml`, `swagger.json`, `docs.go`) will land here once the first backfill wave merges.
