# Phase 3: AI Service Stabilization - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix ai-processing-service crash-loop so it starts reliably, passes health checks, and gracefully handles missing Milvus dependency.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure/stabilization phase. Specific targets:

- AIS-01: ai-processing-service container must start and /health/live returns 200
- AIS-02: Milvus dependency resolved — either fix health check or make optional with pgvector fallback
- AIS-03: Heavy ML imports (InsightFace, Real-ESRGAN) made lazy-loading to prevent startup crashes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/ai-processing-service/` — the service to fix
- `services/ai-processing-service/src/main.py` — entry point (previously investigated in #1580)
- `services/ai-processing-service/Dockerfile` — already switched to opencv-python-headless (#1578)
- `services/ai-processing-service/requirements.txt` — dependency list

### Established Patterns
- Health check endpoints: `/health/live`, `/health/ready`
- Docker container naming: `rawdrive-ai-processing`
- Service runs on PORT_AI_PROCESSING=8012

### Integration Points
- Phase 6 (AI/ML Pipeline) depends on this service being stable
- Milvus vector DB at :19530 (optional — pgvector fallback needed)
- Face worker service at :8001 shares some ML dependencies

</code_context>

<specifics>
## Specific Ideas

No specific requirements — stabilization phase with clear technical targets from REQUIREMENTS.md (AIS-01 through AIS-03).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
