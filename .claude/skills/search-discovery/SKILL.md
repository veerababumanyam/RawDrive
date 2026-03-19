---
name: search-discovery
description: "Search and discovery patterns for RawDrive: full-text search (PostgreSQL), vector/semantic search (Milvus/pgvector), geo-location search, faceted filtering, search indexing, and AI-powered discovery features. Use this skill when implementing search functionality, building search UIs, working with Milvus vector database, creating search indexes, implementing autocomplete, building faceted filters, or working with geo-spatial queries. Also use for similar image search, semantic photo search by description, and search ranking/relevance tuning. Triggers on: search, full-text search, vector search, Milvus, pgvector, semantic search, geo search, location search, faceted search, filter, autocomplete, search index, similar images, search ranking, discovery, typeahead."
---

# Search & Discovery Patterns

RawDrive offers three search paradigms: full-text (metadata), vector/semantic (visual similarity), and geo-spatial (location-based).

## Search Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Full-Text      │     │   Vector Search   │     │   Geo Search     │
│   PostgreSQL     │     │   Milvus + CLIP   │     │   PostGIS        │
│   tsvector/GIN   │     │   pgvector        │     │   GIST index     │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ Title, tags,     │     │ Image embeddings  │     │ GPS coordinates  │
│ descriptions,    │     │ Text-to-image     │     │ Venue locations  │
│ EXIF metadata    │     │ Similar photos    │     │ Radius queries   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                         ┌────────▼────────┐
                         │  Search Service  │
                         │  Unified API     │
                         └─────────────────┘
```

## Full-Text Search (PostgreSQL)

```python
class SearchRepository:
    async def full_text_search(
        self,
        workspace_id: UUID,
        query: str,
        filters: SearchFilters | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> SearchResults:
        """Full-text search using PostgreSQL tsvector with ranking."""
        # Build search query with ts_rank for relevance scoring
        search_query = text("""
            SELECT a.id, a.title, a.file_path,
                   ts_rank(a.search_vector, plainto_tsquery('english', :query)) as rank
            FROM assets a
            WHERE a.workspace_id = :ws_id
              AND a.search_vector @@ plainto_tsquery('english', :query)
              AND (:gallery_id IS NULL OR a.gallery_id = :gallery_id)
              AND (:date_from IS NULL OR a.captured_at >= :date_from)
              AND (:date_to IS NULL OR a.captured_at <= :date_to)
            ORDER BY rank DESC
            LIMIT :limit OFFSET :offset
        """)
        result = await self.db.execute(search_query, {
            "ws_id": workspace_id,
            "query": query,
            "gallery_id": filters.gallery_id if filters else None,
            "date_from": filters.date_from if filters else None,
            "date_to": filters.date_to if filters else None,
            "limit": limit,
            "offset": offset,
        })
        return SearchResults(items=result.mappings().all())
```

### Search Vector Setup

```python
# Migration: Add tsvector column with GIN index
# alembic revision -m "add_search_vector_to_assets"

def upgrade():
    op.add_column('assets', sa.Column(
        'search_vector', TSVector(), nullable=True
    ))
    op.create_index(
        'ix_assets_search_vector', 'assets', ['search_vector'],
        postgresql_using='gin'
    )
    # Trigger to auto-update search_vector on insert/update
    op.execute("""
        CREATE OR REPLACE FUNCTION assets_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
                setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B') ||
                setweight(to_tsvector('english', COALESCE(NEW.camera_model, '')), 'C');
            RETURN NEW;
        END $$ LANGUAGE plpgsql;
    """)
```

## Vector / Semantic Search (Milvus)

```python
class VectorSearchService:
    def __init__(self, milvus_client, clip_model):
        self.milvus = milvus_client      # Milvus at :19530
        self.clip = clip_model            # CLIP for embeddings

    async def search_by_text(
        self, workspace_id: UUID, query: str, limit: int = 20
    ) -> list[dict]:
        """Semantic search: find photos matching a text description."""
        # Encode text query to CLIP embedding
        text_embedding = self.clip.encode_text(query)
        # Search Milvus for similar image embeddings
        results = self.milvus.search(
            collection_name="asset_embeddings",
            data=[text_embedding.tolist()],
            filter=f"workspace_id == '{workspace_id}'",
            limit=limit,
            output_fields=["asset_id", "gallery_id"],
        )
        return results

    async def search_similar(
        self, workspace_id: UUID, asset_id: UUID, limit: int = 20
    ) -> list[dict]:
        """Find visually similar photos to a given asset."""
        # Get the reference image embedding
        ref = self.milvus.get(
            collection_name="asset_embeddings",
            ids=[str(asset_id)],
        )
        # Search for nearest neighbors
        results = self.milvus.search(
            collection_name="asset_embeddings",
            data=[ref[0]["embedding"]],
            filter=f"workspace_id == '{workspace_id}' and asset_id != '{asset_id}'",
            limit=limit,
        )
        return results
```

### Milvus Collection Schema

```python
# Collection setup for asset embeddings
from pymilvus import CollectionSchema, FieldSchema, DataType

fields = [
    FieldSchema("id", DataType.VARCHAR, is_primary=True, max_length=36),
    FieldSchema("asset_id", DataType.VARCHAR, max_length=36),
    FieldSchema("workspace_id", DataType.VARCHAR, max_length=36),
    FieldSchema("gallery_id", DataType.VARCHAR, max_length=36),
    FieldSchema("embedding", DataType.FLOAT_VECTOR, dim=512),  # CLIP ViT-B/32
]
# Index: IVF_FLAT for balance of speed and accuracy
# Partition by workspace_id for tenant isolation
```

## Geo-Spatial Search

```python
async def search_by_location(
    self,
    workspace_id: UUID,
    latitude: float,
    longitude: float,
    radius_km: float = 10,
) -> list[dict]:
    """Find photos taken near a GPS coordinate."""
    query = text("""
        SELECT a.id, a.title,
               ST_Distance(
                   a.location::geography,
                   ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
               ) / 1000 as distance_km
        FROM assets a
        WHERE a.workspace_id = :ws_id
          AND a.location IS NOT NULL
          AND ST_DWithin(
              a.location::geography,
              ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
              :radius_m
          )
        ORDER BY distance_km ASC
    """)
    # ALWAYS filter by workspace_id
```

## Frontend Search UI

```typescript
// Unified search with mode switching
interface SearchBarProps {
  mode: 'text' | 'semantic' | 'location';
  onResults: (results: SearchResult[]) => void;
}

// Key components:
// SearchBar — unified input with mode toggle
// FacetedFilters — date range, camera, gallery, tags
// SearchResults — grid with infinite scroll
// SimilarPhotosPanel — "Find similar" from any photo
// LocationMap — map-based photo discovery
```
