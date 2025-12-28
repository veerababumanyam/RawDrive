# Data Model: AI-Powered Photo Features

**Date**: 2025-12-28
**Context**: Database schema changes for AI analysis results, usage tracking, and user settings

## Overview

Extends existing database schema to support AI-powered photo features with proper indexing, constraints, and relationships.

## Schema Changes

### 1. Extend `asset_analysis` Table

**Purpose**: Store AI analysis results for photos
**Scope**: Workspace-scoped

```sql
-- Add AI analysis columns to existing asset_analysis table
ALTER TABLE asset_analysis ADD COLUMN IF NOT EXISTS ai_provider TEXT;
ALTER TABLE asset_analysis ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE asset_analysis ADD COLUMN IF NOT EXISTS analysis_result JSONB;
ALTER TABLE asset_analysis ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE asset_analysis ADD COLUMN IF NOT EXISTS analysis_error TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_asset_analysis_ai_completed ON asset_analysis(workspace_id, analysis_completed_at) WHERE analysis_completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_analysis_ai_provider ON asset_analysis(ai_provider) WHERE ai_provider IS NOT NULL;
```

**Fields**:
- `ai_provider`: 'gemini', 'openai', etc.
- `ai_model`: Specific model version
- `analysis_result`: JSON with analysis data
- `analysis_completed_at`: Timestamp of completion
- `analysis_error`: Error message if failed

### 2. New `ai_job_results` Table

**Purpose**: Store results of async AI jobs (stories, curation)
**Scope**: Workspace-scoped

```sql
CREATE TABLE IF NOT EXISTS ai_job_results (
    job_id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    job_type TEXT NOT NULL, -- 'story_generation', 'smart_curation'
    asset_ids UUID[] NOT NULL,
    ai_provider TEXT NOT NULL,
    ai_model TEXT NOT NULL,
    result JSONB,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT chk_job_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Indexes
CREATE INDEX idx_ai_job_results_workspace_status ON ai_job_results(workspace_id, status);
CREATE INDEX idx_ai_job_results_created_at ON ai_job_results(created_at);
CREATE INDEX idx_ai_job_results_type ON ai_job_results(job_type);
```

### 3. Extend `user_gemini_settings` Table

**Purpose**: Store user AI preferences and settings
**Scope**: User-scoped (but workspace-aware)

```sql
-- Add AI feature preferences
ALTER TABLE user_gemini_settings ADD COLUMN IF NOT EXISTS ai_features_enabled JSONB DEFAULT '{
  "photo_analysis": true,
  "caption_generation": true,
  "hashtag_generation": true,
  "story_generation": true,
  "smart_curation": true
}'::jsonb;

ALTER TABLE user_gemini_settings ADD COLUMN IF NOT EXISTS default_model TEXT DEFAULT 'gemini-2.0-flash-exp';
ALTER TABLE user_gemini_settings ADD COLUMN IF NOT EXISTS usage_limits JSONB DEFAULT '{
  "monthly_credits": 500,
  "burst_limit": 10
}'::jsonb;
```

## Data Relationships

```
workspaces (1) ──── (N) asset_analysis
    │                       │
    │                       └── analysis_result (JSON)
    │
    └── (N) ai_job_results
                │
                └── result (JSON)
                └── asset_ids (array)

users (1) ──── (N) user_gemini_settings
                    │
                    └── ai_features_enabled (JSON)
                    └── usage_limits (JSON)
```

## Migration Strategy

### Safe Migration Script

```sql
-- Migration: 010_ai_powered_features
BEGIN;

-- Extend asset_analysis table
ALTER TABLE asset_analysis
ADD COLUMN IF NOT EXISTS ai_provider TEXT,
ADD COLUMN IF NOT EXISTS ai_model TEXT,
ADD COLUMN IF NOT EXISTS analysis_result JSONB,
ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS analysis_error TEXT;

-- Create indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_analysis_ai_completed
ON asset_analysis(workspace_id, analysis_completed_at)
WHERE analysis_completed_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_analysis_ai_provider
ON asset_analysis(ai_provider)
WHERE ai_provider IS NOT NULL;

-- Create ai_job_results table
CREATE TABLE IF NOT EXISTS ai_job_results (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    job_type TEXT NOT NULL,
    asset_ids UUID[] NOT NULL,
    ai_provider TEXT NOT NULL,
    ai_model TEXT NOT NULL,
    result JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT chk_job_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Create indexes for ai_job_results
CREATE INDEX CONCURRENTLY idx_ai_job_results_workspace_status
ON ai_job_results(workspace_id, status);

CREATE INDEX CONCURRENTLY idx_ai_job_results_created_at
ON ai_job_results(created_at);

CREATE INDEX CONCURRENTLY idx_ai_job_results_type
ON ai_job_results(job_type);

-- Extend user_gemini_settings
ALTER TABLE user_gemini_settings
ADD COLUMN IF NOT EXISTS ai_features_enabled JSONB DEFAULT '{
  "photo_analysis": true,
  "caption_generation": true,
  "hashtag_generation": true,
  "story_generation": true,
  "smart_curation": true
}'::jsonb,
ADD COLUMN IF NOT EXISTS default_model TEXT DEFAULT 'gemini-2.0-flash-exp',
ADD COLUMN IF NOT EXISTS usage_limits JSONB DEFAULT '{
  "monthly_credits": 500,
  "burst_limit": 10
}'::jsonb;

COMMIT;
```

## Data Validation

### JSON Schema for `analysis_result`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "description": {"type": "string"},
    "tags": {"type": "array", "items": {"type": "string"}},
    "hashtags": {"type": "array", "items": {"type": "string"}},
    "quality_score": {"type": "number", "minimum": 0, "maximum": 100},
    "sharpness": {"type": "number", "minimum": 0, "maximum": 100},
    "exposure": {"type": "number", "minimum": 0, "maximum": 100},
    "composition": {"type": "number", "minimum": 0, "maximum": 100},
    "dominant_colors": {"type": "array", "items": {"type": "string"}},
    "lighting": {"type": "string", "enum": ["natural", "artificial", "mixed", "studio", "dramatic"]},
    "mood": {"type": "string"},
    "improvements": {"type": "array", "items": {"type": "string"}},
    "best_for": {"type": "array", "items": {"type": "string"}}
  },
  "required": ["quality_score"]
}
```

### Constraints and Triggers

- **Workspace Isolation**: All queries filter by `workspace_id`
- **Data Integrity**: Foreign key constraints on `workspace_id`
- **Audit Trail**: All changes logged via existing audit system
- **Cleanup**: Old analysis results archived after 1 year

## Performance Considerations

### Indexing Strategy
- Composite indexes on `(workspace_id, analysis_completed_at)` for time-based queries
- Partial indexes for null filtering
- JSONB indexes for common query patterns

### Query Optimization
- Use `EXPLAIN ANALYZE` for complex queries
- Implement pagination for large result sets
- Cache frequently accessed analysis results

### Monitoring
- Track query performance
- Monitor table growth
- Alert on constraint violations

## Rollback Plan

```sql
-- Rollback migration
BEGIN;

-- Drop new table
DROP TABLE IF EXISTS ai_job_results;

-- Remove added columns
ALTER TABLE asset_analysis
DROP COLUMN IF EXISTS ai_provider,
DROP COLUMN IF EXISTS ai_model,
DROP COLUMN IF EXISTS analysis_result,
DROP COLUMN IF EXISTS analysis_completed_at,
DROP COLUMN IF EXISTS analysis_error;

ALTER TABLE user_gemini_settings
DROP COLUMN IF EXISTS ai_features_enabled,
DROP COLUMN IF EXISTS default_model,
DROP COLUMN IF EXISTS usage_limits;

-- Drop indexes
DROP INDEX IF EXISTS idx_asset_analysis_ai_completed;
DROP INDEX IF EXISTS idx_asset_analysis_ai_provider;
DROP INDEX IF EXISTS idx_ai_job_results_workspace_status;
DROP INDEX IF EXISTS idx_ai_job_results_created_at;
DROP INDEX IF EXISTS idx_ai_job_results_type;

COMMIT;
```