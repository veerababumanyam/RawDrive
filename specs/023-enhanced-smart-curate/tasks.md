# Tasks: Enhanced Smart Curate - AI Photo Culling System

**Input**: Design documents from `/specs/023-enhanced-smart-curate/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the specification. Implementation tasks only.

**Organization**: Tasks grouped by user story (20 stories across P1-P4 priorities).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US20) - only in story phases

## Path Conventions

- **Backend**: `backend/src/app/` (Python/FastAPI)
- **Frontend**: `frontend/src/` (TypeScript/React)
- **Migrations**: `backend/migrations/versions/`
- **Infrastructure**: `infrastructure/kubernetes/keda/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema, base types, and project scaffolding

- [x] T001 Create migration file `backend/migrations/versions/0085_enhanced_smart_curate.py` with all 9 tables from data-model.md
- [x] T002 [P] Create Pydantic schemas in `backend/src/app/api/curation_schemas.py` for all entities
- [x] T003 [P] Create TypeScript types in `frontend/src/types/curation.ts` mirroring backend schemas
- [x] T004 [P] Create API client service in `frontend/src/services/curationService.ts` with all endpoints
- [x] T005 [P] Add task type constants for quality_analysis, similarity, curation in `backend/src/app/services/task_queue.py`
- [x] T006 Seed default curation presets (Social Media, Print Album, Vendor, Documentary) in migration

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core repositories, base services, and workers that ALL user stories depend on

**CRITICAL**: No user story can begin until this phase completes

- [x] T007 Create `backend/src/app/repositories/curation_session_repository.py` with CRUD operations
- [x] T008 [P] Create `backend/src/app/repositories/photo_quality_repository.py` with bulk upsert
- [x] T009 [P] Create `backend/src/app/repositories/similarity_group_repository.py` with group operations
- [x] T010 Create `backend/src/app/services/curation_session_service.py` with session lifecycle management
- [x] T011 [P] Create `backend/src/app/workers/quality_analysis_worker.py` worker skeleton
- [x] T012 [P] Create `backend/src/app/workers/similarity_worker.py` worker skeleton
- [x] T013 [P] Create `backend/src/app/workers/curation_worker.py` worker skeleton
- [x] T014 Create `backend/src/app/api/v1/curation_sessions.py` with session CRUD endpoints
- [x] T015 [P] Create `frontend/src/hooks/useCurationSession.ts` for session state management
- [x] T016 [P] Create `frontend/src/components/features/ai/CurationProgress.tsx` progress indicator component
- [x] T017 Register curation routes in `backend/src/app/api/v1/__init__.py`

**Checkpoint**: Foundation ready - user story implementation can begin

---

## Phase 3: User Story 1 - AI Quality Scoring & Ranking (Priority: P1) MVP

**Goal**: AI scores each photo on technical/aesthetic quality (0-100) using Gemini Vision API

**Independent Test**: Upload 100 photos, run quality analysis, verify each has scores for sharpness, exposure, composition. Gallery sorts by score.

### Implementation for US1

- [x] T018 [US1] Implement Gemini batch analysis in `backend/src/app/services/photo_quality_service.py` with rate limiting
- [x] T019 [US1] Add quality analysis task logic in `backend/src/app/workers/quality_analysis_worker.py`
- [x] T020 [US1] Add `POST /galleries/{id}/quality-analysis` endpoint to start analysis in `backend/src/app/api/v1/smart_tagging.py`
- [x] T021 [US1] Add `GET /galleries/{id}/quality-analysis` endpoint for results in `backend/src/app/api/v1/smart_tagging.py`
- [x] T022 [US1] Add `GET /galleries/{id}/quality-analysis/progress` endpoint in `backend/src/app/api/v1/smart_tagging.py`
- [x] T023 [P] [US1] Create `frontend/src/hooks/useQualityAnalysis.ts` hook for analysis state
- [x] T024 [P] [US1] Create `frontend/src/components/features/ai/QualityScoreCard.tsx` score display component
- [x] T025 [US1] Create `frontend/src/components/features/ai/QualityResultsGrid.tsx` with filters and grid view

**Checkpoint**: US1 complete - photos can be analyzed and sorted by quality score

---

## Phase 4: User Story 4 - Sharpness & Motion-Blur Detection (Priority: P1) ✅ COMPLETE

**Goal**: Flag images with motion blur, camera shake, or focus issues for quick rejection

**Independent Test**: Upload mix of sharp and blurry photos, verify blur detection distinguishes motion blur from intentional bokeh.

### Implementation for US4

- [x] T026 [US4] Add blur detection logic to `backend/src/app/services/photo_quality_service.py` (blur_type, severity)
- [x] T027 [US4] Add `GET /galleries/{id}/blur-detection` endpoint in `backend/src/app/api/v1/smart_tagging.py`
- [x] T028 [US4] Add "Technical Rejects" filter to quality analysis results
- [x] T029 [P] [US4] Create blur indicator component in `frontend/src/components/features/ai/BlurIndicator.tsx`
- [x] T030 [US4] Add blur filter controls to `frontend/src/components/features/ai/SmartCurationPanel.tsx`

**Checkpoint**: US4 complete - blur/focus issues are flagged with severity

---

## Phase 5: User Story 2 - Duplicate & Near-Duplicate Grouping (Priority: P1)

**Goal**: Cluster similar photos (burst shots) and identify best shot per group

**Independent Test**: Upload 10 burst shots, verify system groups them and identifies best shot.

### Implementation for US2

- [ ] T031 [US2] Implement CLIP embedding computation in `backend/src/app/services/similarity_grouping_service.py`
- [ ] T032 [US2] Add clustering algorithm (cosine similarity + threshold) in similarity_grouping_service.py
- [ ] T033 [US2] Add best-shot selection logic (quality + expression) in similarity_grouping_service.py
- [ ] T034 [US2] Implement embedding worker in `backend/src/app/workers/similarity_worker.py`
- [ ] T035 [US2] Add `POST /galleries/{id}/similarity-groups` endpoint to start grouping in `backend/src/app/api/v1/smart_tagging.py`
- [ ] T036 [US2] Add `GET /galleries/{id}/similarity-groups` endpoint for results in `backend/src/app/api/v1/smart_tagging.py`
- [ ] T037 [US2] Add `PUT /galleries/{id}/similarity-groups/{group_id}/best-shot` for user override in `backend/src/app/api/v1/smart_tagging.py`
- [ ] T038 [P] [US2] Create `frontend/src/hooks/useSimilarityGroups.ts` hook
- [ ] T039 [P] [US2] Create `frontend/src/components/features/ai/PhotoGroupCard.tsx` for group display
- [ ] T040 [US2] Add "Group View" mode to SmartCurationPanel showing one photo per group

**Checkpoint**: US2 complete - similar photos are grouped with AI-recommended best shot

---

## Phase 6: User Story 20 - Persistent Curation Sessions (Priority: P1)

**Goal**: Save curation progress across browser sessions - pause and resume

**Independent Test**: Start curation, close browser, return later, resume exactly where left off.

### Implementation for US20

- [ ] T041 [US20] Add session auto-save on parameter changes in `backend/src/app/services/curation_session_service.py`
- [ ] T042 [US20] Add `GET /galleries/{id}/curation-sessions` list endpoint with history in `backend/src/app/api/v1/curation_sessions.py`
- [ ] T043 [US20] Add `POST /galleries/{id}/curation-sessions/{id}/start` and `/pause` endpoints
- [ ] T044 [US20] Add session resume logic with progress restoration
- [ ] T045 [P] [US20] Create `frontend/src/components/features/ai/CurationSessionManager.tsx` for session controls
- [ ] T046 [US20] Add "Resume previous curation?" prompt to SmartCurationPanel on gallery load
- [ ] T047 [US20] Add curation history view with dates and parameters

**Checkpoint**: US20 complete - sessions persist and can be resumed

---

## Phase 7: User Story 3 - Target-Count Culling (Priority: P1)

**Goal**: Specify "Cull 3,000 to ~500" and AI selects best diverse set

**Independent Test**: Gallery of 1,000 photos, request cull to 100, verify ~100 diverse high-quality photos.

### Implementation for US3

- [ ] T048 [US3] Implement lexicographic multi-objective algorithm in `backend/src/app/services/curation_selection_service.py`
- [ ] T049 [US3] Add MMR diversity enforcement in curation_selection_service.py
- [ ] T050 [US3] Implement selection worker in `backend/src/app/workers/curation_worker.py`
- [ ] T051 [US3] Add `POST /galleries/{id}/curation-sessions/{id}/curate` endpoint
- [ ] T052 [US3] Add `GET /galleries/{id}/curation-sessions/{id}/selections` endpoint with reasons
- [ ] T053 [US3] Add `PATCH /galleries/{id}/curation-sessions/{id}/selections` for user overrides
- [ ] T054 [P] [US3] Add target count slider and "Auto-Curate" button to SmartCurationPanel
- [ ] T055 [US3] Display selection reasons (quality rank, unique moment, key subject) in UI
- [ ] T056 [US3] Add recalculation on target count adjustment

**Checkpoint**: US3 complete - one-click gallery reduction with variety preservation

---

## Phase 8: User Story 5 - Face Detection & Expression Filtering (Priority: P2)

**Goal**: Detect faces, filter shots with closed eyes/awkward expressions

**Independent Test**: Upload 20 group shots, verify AI identifies best expression in each group.

### Implementation for US5

- [ ] T057 [US5] Create `backend/src/app/services/expression_analysis_service.py` integrating with face_detection_service
- [ ] T058 [US5] Add expression analysis (eyes open, smile, awkward) to quality analysis pipeline
- [ ] T059 [US5] Add `GET /galleries/{id}/expression-analysis` endpoint in `backend/src/app/api/v1/smart_tagging.py`
- [ ] T060 [US5] Integrate expression scores into best-shot selection in similarity_grouping_service.py
- [ ] T061 [P] [US5] Create expression indicator in `frontend/src/components/features/ai/ExpressionIndicator.tsx`
- [ ] T062 [US5] Add expression filter toggle to SmartCurationPanel

**Checkpoint**: US5 complete - expression issues flagged and deprioritized

---

## Phase 9: User Story 6 - Composition & Framing Analysis (Priority: P2)

**Goal**: Evaluate rule-of-thirds, subject centering, headroom

**Independent Test**: Upload photos with varying composition, verify AI scores correlate with best practices.

### Implementation for US6

- [ ] T063 [US6] Add composition analysis to `backend/src/app/services/photo_quality_service.py`
- [ ] T064 [US6] Add crop suggestion generation in photo_quality_service.py
- [ ] T065 [US6] Add composition sort option to quality-analysis endpoint
- [ ] T066 [P] [US6] Add composition score display to QualityBadge component

**Checkpoint**: US6 complete - composition scoring available

---

## Phase 10: User Story 7 - Lighting & Exposure Evaluation (Priority: P2)

**Goal**: Rate images on dynamic range, highlight clipping, shadow detail

**Independent Test**: Upload same scene with varying exposures, verify AI identifies optimal.

### Implementation for US7

- [ ] T067 [US7] Enhance exposure analysis in `backend/src/app/services/photo_quality_service.py`
- [ ] T068 [US7] Add highlight/shadow clipping detection
- [ ] T069 [US7] Add recovery potential assessment
- [ ] T070 [P] [US7] Add exposure indicators to QualityBadge component

**Checkpoint**: US7 complete - exposure issues flagged with recovery potential

---

## Phase 11: User Story 8 - Storyline / Moment Detection (Priority: P2)

**Goal**: Identify key moments (vows, first kiss, first dance) for narrative preservation

**Independent Test**: Upload wedding gallery, verify AI identifies and labels key moments.

### Implementation for US8

- [ ] T071 [US8] Create `backend/src/app/services/scene_detection_service.py` with moment classifier
- [ ] T072 [US8] Add scene category persistence to photo_scene_categories table
- [ ] T073 [US8] Add `GET /galleries/{id}/scenes` endpoint in `backend/src/app/api/v1/smart_tagging.py`
- [ ] T074 [US8] Integrate story coverage into curation algorithm (at least one per moment)
- [ ] T075 [P] [US8] Add timeline/story arc visualization to SmartCurationPanel
- [ ] T076 [US8] Add "Only available shot of [moment]" warning in selections

**Checkpoint**: US8 complete - key moments preserved in curation

---

## Phase 12: User Story 9 - Diversity Enforcement (Priority: P2)

**Goal**: Prevent selection dominated by near-identical poses/angles

**Independent Test**: Portrait session curation ensures variety of poses, angles, settings.

### Implementation for US9

- [ ] T077 [US9] Add diversity metrics calculation in `backend/src/app/services/curation_selection_service.py`
- [ ] T078 [US9] Add diversity_contribution to curation_selections table usage
- [ ] T079 [US9] Add diversity weight parameter to curation session
- [ ] T080 [P] [US9] Display diversity metrics (locations, people, focal lengths) in selection results
- [ ] T081 [US9] Add diversity weight slider to SmartCurationPanel

**Checkpoint**: US9 complete - selections have enforced variety

---

## Phase 13: User Story 10 - Per-Person Coverage Balancing (Priority: P2)

**Goal**: Track and balance representation of VIP people (bride, groom, parents)

**Independent Test**: Wedding curation ensures bride, groom, party have proportional representation.

### Implementation for US10

- [ ] T082 [US10] Add VIP face group tagging in `backend/src/app/services/curation_selection_service.py`
- [ ] T083 [US10] Add per-person coverage tracking to selection algorithm
- [ ] T084 [US10] Add VIP coverage report to selections endpoint
- [ ] T085 [P] [US10] Add VIP tagging UI in SmartCurationPanel (link to face groups)
- [ ] T086 [US10] Add "Include more of underrepresented VIP" logic

**Checkpoint**: US10 complete - VIP coverage balanced

---

## Phase 14: User Story 11 - Emotion & Interaction Detection (Priority: P3)

**Goal**: Prioritize images with joy, hugs, eye contact, candid interactions

**Independent Test**: Among technically similar photos, AI correctly identifies emotional moments.

### Implementation for US11

- [ ] T087 [US11] Enhance `backend/src/app/services/expression_analysis_service.py` with emotion detection
- [ ] T088 [US11] Add emotion indicators (joy, tears, laughter, intimacy)
- [ ] T089 [US11] Add emotion-aware ranking in curation selection
- [ ] T090 [P] [US11] Add emotion indicators to PhotoGroupCard
- [ ] T091 [US11] Add emotion filter/search to SmartCurationPanel

**Checkpoint**: US11 complete - emotional moments prioritized

---

## Phase 15: User Story 12 - Auto-Tagging & Keywording (Priority: P3)

**Goal**: Auto-add tags for people, locations, events, objects, moods

**Independent Test**: Upload diverse photos, verify relevant tags auto-applied.

### Implementation for US12

- [ ] T092 [US12] Add auto-tagging to `backend/src/app/services/scene_detection_service.py`
- [ ] T093 [US12] Add `GET /galleries/{id}/auto-tags` endpoint
- [ ] T094 [US12] Add tag search integration
- [ ] T095 [P] [US12] Display auto-tags in photo detail view
- [ ] T096 [US12] Add tag removal feedback for AI learning

**Checkpoint**: US12 complete - searchable auto-tags

---

## Phase 16: User Story 13 - Scene & Location Clustering (Priority: P3)

**Goal**: Group images by scene (prep room, ceremony hall, reception)

**Independent Test**: Wedding gallery auto-segments into logical venue sections.

### Implementation for US13

- [ ] T097 [US13] Add scene clustering to `backend/src/app/services/scene_detection_service.py`
- [ ] T098 [US13] Add per-scene curation support
- [ ] T099 [US13] Add scene override/reassignment endpoint
- [ ] T100 [P] [US13] Add scene grouping view to SmartCurationPanel
- [ ] T101 [US13] Add per-scene target count in curation

**Checkpoint**: US13 complete - scene-based curation available

---

## Phase 17: User Story 14 - Style Consistency Suggestions (Priority: P3)

**Goal**: Detect white balance/color grading outliers

**Independent Test**: Gallery with mixed white balance, AI identifies outliers.

### Implementation for US14

- [ ] T102 [US14] Add style analysis to `backend/src/app/services/photo_quality_service.py`
- [ ] T103 [US14] Add `GET /galleries/{id}/style-analysis` endpoint
- [ ] T104 [P] [US14] Add style consistency warnings to SmartCurationPanel
- [ ] T105 [US14] Add "exclude or harmonize" recommendations

**Checkpoint**: US14 complete - style outliers flagged

---

## Phase 18: User Story 15 - Client-Goal Presets (Priority: P3)

**Goal**: Named presets (social media, album, vendor, documentary)

**Independent Test**: Same gallery curated with different presets produces different selections.

### Implementation for US15

- [ ] T106 [US15] Add preset application logic in `backend/src/app/services/curation_session_service.py`
- [ ] T107 [US15] Add custom preset creation endpoint
- [ ] T108 [P] [US15] Create `frontend/src/components/features/ai/PresetSelector.tsx`
- [ ] T109 [US15] Integrate preset selector into session creation flow

**Checkpoint**: US15 complete - presets available for different deliverables

---

## Phase 19: User Story 16 - Interactive Side-by-Side Comparison (Priority: P3)

**Goal**: Compare 2-6 photos side-by-side with quality deltas

**Independent Test**: View similarity group, trigger compare mode, see quality differences.

### Implementation for US16

- [ ] T110 [US16] Add `GET /galleries/{id}/similarity-groups/{id}/compare` endpoint
- [ ] T111 [US16] Add quality delta calculation
- [ ] T112 [P] [US16] Create `frontend/src/components/features/ai/ComparisonView.tsx`
- [ ] T113 [US16] Add comparison mode to PhotoGroupCard
- [ ] T114 [US16] Add winner selection and alternate marking

**Checkpoint**: US16 complete - efficient manual comparison

---

## Phase 20: User Story 17 - Learning Photographer Preferences (Priority: P4)

**Goal**: Learn keep/reject patterns and tune AI decisions

**Independent Test**: After 5 sessions with overrides, AI predictions align better.

### Implementation for US17

- [ ] T115 [US17] Create `backend/src/app/services/preference_learning_service.py`
- [ ] T116 [US17] Track user overrides in curation_selections
- [ ] T117 [US17] Add preference learning to curation algorithm
- [ ] T118 [US17] Add `GET/DELETE /curation-preferences` endpoints
- [ ] T119 [P] [US17] Add "Matched your style" / "Different from usual" indicators
- [ ] T120 [US17] Add "Reset AI Learning" button

**Checkpoint**: US17 complete - personalized recommendations

---

## Phase 21: User Story 18 - Smart Crop & Straightening Suggestions (Priority: P4)

**Goal**: Propose better crops and horizon corrections

**Independent Test**: Tilted horizon gets straightening suggestion.

### Implementation for US18

- [ ] T121 [US18] Enhance crop suggestion in `backend/src/app/services/photo_quality_service.py`
- [ ] T122 [US18] Add `GET /galleries/{id}/crop-suggestions` endpoint
- [ ] T123 [P] [US18] Add crop preview in photo detail view
- [ ] T124 [US18] Add crop application on export

**Checkpoint**: US18 complete - crop suggestions available

---

## Phase 22: User Story 19 - Automatic Safety Set (Priority: P4)

**Goal**: Hidden backup of near-keepers for quick restore

**Independent Test**: Cull aggressively, restore from safety set without re-analyzing.

### Implementation for US19

- [ ] T125 [US19] Add safety_set selection_type to curation algorithm
- [ ] T126 [US19] Add `GET /galleries/{id}/curation-sessions/{id}/safety-set` endpoint
- [ ] T127 [US19] Add `POST /galleries/{id}/curation-sessions/{id}/expand` endpoint
- [ ] T128 [P] [US19] Add "Safety Set" tab to selection results
- [ ] T129 [US19] Add "Expand Selection" button

**Checkpoint**: US19 complete - safety net for aggressive culling

---

## Phase 23: Polish & Cross-Cutting Concerns

**Purpose**: Infrastructure, scaling, and documentation

- [ ] T130 [P] Create `infrastructure/kubernetes/keda/analysis-worker-scaler.yaml` for quality analysis workers
- [ ] T131 [P] Create `infrastructure/kubernetes/keda/grouping-worker-scaler.yaml` for GPU embedding workers (15min cooldown)
- [ ] T132 [P] Create `infrastructure/kubernetes/keda/curation-worker-scaler.yaml` for curation workers
- [ ] T133 Add Prometheus metrics for analysis throughput in quality_analysis_worker.py
- [ ] T134 Add structured logging with correlation IDs across all services
- [ ] T135 Add error handling for API failures with retry and graceful degradation (FR-035)
- [ ] T136 Run quickstart.md validation and update as needed
- [ ] T137 Performance optimization: ensure <100ms session retrieval (SC-017)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) ─────┐
                     ├──> Phase 2 (Foundational) ──┬──> Phase 3 (US1) ──> Phase 4 (US4) ──> Phase 5 (US2) ──> Phase 6 (US20) ──> Phase 7 (US3)
                     │                             │
                     │                             ├──> [P1 Complete - MVP Ready]
                     │                             │
                     │                             └──> Phase 8-13 (P2 Stories) ──> Phase 14-19 (P3 Stories) ──> Phase 20-22 (P4 Stories)
                     │
                     └──> Phase 23 (Polish) - can start after Phase 7, completed by end
```

### User Story Dependencies

| Story | Phase | Depends On | Can Parallel With |
|-------|-------|------------|-------------------|
| US1 (Quality) | 3 | Phase 2 | None (first) |
| US4 (Blur) | 4 | US1 (quality service) | - |
| US2 (Grouping) | 5 | US1 (for quality-aware best shot) | - |
| US20 (Sessions) | 6 | Phase 2 | US1-US4 (infrastructure only) |
| US3 (Culling) | 7 | US1, US2 (quality + groups) | - |
| US5-US10 (P2) | 8-13 | US1-US3 foundation | Each other (different services) |
| US11-US16 (P3) | 14-19 | P2 base features | Each other |
| US17-US19 (P4) | 20-22 | P3 base features | Each other |

### Parallel Opportunities Within Stories

Stories with [P] tasks can parallelize:
- **US1**: T023, T024 (frontend hooks + component)
- **US2**: T038, T039 (hooks + component)
- **US3**: T054 (frontend) can parallel backend completion
- All frontend components marked [P] can be built while backend completes

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Total Tasks | 137 |
| Setup Tasks | 6 |
| Foundational Tasks | 11 |
| P1 Story Tasks | 39 (US1: 8, US4: 5, US2: 10, US20: 7, US3: 9) |
| P2 Story Tasks | 30 |
| P3 Story Tasks | 28 |
| P4 Story Tasks | 15 |
| Polish Tasks | 8 |
| Parallelizable [P] | 42 |

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (6 tasks)
2. Complete Phase 2: Foundational (11 tasks)
3. Complete Phase 3-7: All P1 Stories (39 tasks)
4. **STOP and VALIDATE**: Full AI curation workflow functional
5. Deploy/demo MVP

**MVP Scope**: 56 tasks for complete quality scoring, grouping, culling, sessions

### Incremental Delivery

Each phase after MVP adds value independently:
- P2 (Expression, Moment, Diversity): Enhanced curation intelligence
- P3 (Emotion, Tags, Presets, Compare): Professional workflow features
- P4 (Learning, Crop, Safety): Power user features

### Parallel Team Strategy

With 3 developers after Phase 2:
- Dev A: Backend services (quality, similarity, curation)
- Dev B: Frontend components (SmartCurationPanel enhancement, hooks)
- Dev C: Workers and infrastructure (Celery tasks, KEDA scaling)

---

## Notes

- All tasks include exact file paths for LLM execution
- [P] marks tasks safe for parallel execution
- [Story] labels enable per-story tracking and testing
- No tests included (not requested) - add via separate task if needed
- Verify each checkpoint before proceeding to next story
- Commit after each task or logical group
