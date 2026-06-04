-- Migration 162: raise the default HNSW ef_search to cover vector-query LIMITs.
--
-- pgvector's hnsw.ef_search (the dynamic candidate-list size during an HNSW
-- index scan) defaults to 40. For good recall it must be >= the query's
-- LIMIT/k: with ef_search=40 an index scan only surfaces ~40 candidates, so a
-- query asking for more silently gets degraded recall.
--
-- The recall-critical path is face matching within a gallery:
--   FindSimilarFacesInGallery(..., 200)  (handler/public_gallery_handler.go)
-- runs ORDER BY embedding <=> $2 LIMIT 200. 200 > 40, so face search was
-- running under-recalled. Semantic asset search (ai/search_service.go) caps its
-- LIMIT at 50. Setting the role default to 200 covers the largest k so every
-- vector query explores enough candidates.
--
-- Set as a ROLE-LEVEL default (ALTER ROLE), same mechanism and rationale as
-- migration 160's session timeouts: it survives pgbouncer transaction pooling
-- (server_reset_query=DISCARD ALL resets TO the role default, not past it) and
-- is applied at every backend session start.
--
-- The leading `SELECT ... ::vector` is load-bearing, not decorative: hnsw.ef_search
-- is a custom GUC registered by pgvector's C library only when that library is
-- loaded into the session. A non-superuser (the app/migrate role is not a
-- superuser) gets "permission denied to set parameter" if it tries to ALTER
-- ROLE SET an unregistered placeholder GUC. Casting a literal to `vector`
-- forces the library to load (registering hnsw.ef_search as USERSET) so the
-- non-superuser ALTER ROLE then succeeds — regardless of whether an earlier
-- migration already loaded it in this session. Verified on pgvector/pgvector:pg17.
--
-- Trade-off: the smaller semantic-search queries (k<=50) now explore 200
-- candidates too — a few ms more index work for materially better face recall.
-- A per-query `SET LOCAL hnsw.ef_search` sized to each query's k (inside a
-- transaction) would be the ideal refinement if vector-search latency ever
-- becomes a concern.
--
-- Numbered 162: next free after 161. Pure role-attribute change — no table,
-- column, or index is touched; fully reversed by 162_hnsw_ef_search.down.sql.

BEGIN;

SELECT '[3,1,2]'::vector;  -- force pgvector to load so hnsw.ef_search is settable

ALTER ROLE CURRENT_USER SET hnsw.ef_search = '200';

COMMIT;
