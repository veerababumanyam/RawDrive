RawDrive Codebase Audit — From Actual Source Code
   ---
  ACTUAL State: What's Broken (from go test and tsc)

  Backend — 5 Failing Tests (all in photo domain)

  ┌────────────────────────────────────────┬──────────────────────────────┬─────────────────────────────────────────────────────────┐
  │                  Test                  │            Error             │                       Root Cause                        │
  ├────────────────────────────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ TestProcessor_ProcessPhoto             │ image: unknown format        │ Processor test uses test image that decoder can't parse │
  ├────────────────────────────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ TestService_GenerateUploadURLs_Success │ static credentials are empty │ S3/R2 presign needs real credentials                    │
  ├────────────────────────────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ TestService_ConfirmUpload_Success      │ static credentials are empty │ Same — S3 creds needed                                  │
  ├────────────────────────────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ TestSignedURL_GenerateGET_4HourTTL     │ static credentials are empty │ Same                                                    │
  ├────────────────────────────────────────┼──────────────────────────────┼─────────────────────────────────────────────────────────┤
  │ TestSignedURL_ValkeyCaching            │ static credentials are empty │ Same                                                    │
  └────────────────────────────────────────┴──────────────────────────────┴─────────────────────────────────────────────────────────┘

  PG integration tests SKIP (no DB available in test). All other 60+ test files PASS.

  Frontend — 1,706 TypeScript Errors

  Main categories:
  - @rawdrive/shared-types missing exports — ~1400+ errors from invitation types (UpdateRSVPRequest, RSVPSubmitResponse, etc.) not exported from shared package
  - vitest not found — Test files import vitest but it's not installed
  - JSX namespace errors — accessibility.tsx and rtl.tsx utility components

  ---
  5 Domains NOT Wired in main.go (code exists but unreachable)

  ┌──────────┬──────────────────┬────────────────┬────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────┐
  │  Domain  │   Has Handler    │  Has PG Repo   │                       Has Migration                        │                                Issue                                 │
  ├──────────┼──────────────────┼────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ contract │ NO handler.go    │ YES (full SQL) │ YES (016_m2_contracts.sql)                                 │ No handler, not imported                                             │
  ├──────────┼──────────────────┼────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ invoice  │ YES              │ YES (full SQL) │ YES (in 009_m1_billing.sql)                                │ Not imported in main.go                                              │
  ├──────────┼──────────────────┼────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ ratecard │ YES              │ YES (full SQL) │ NO migration — queries rate_cards table that doesn't exist │ Not imported, will crash                                             │
  ├──────────┼──────────────────┼────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ studio   │ YES              │ YES            │ Unclear                                                    │ 3 of 4 service methods return "not fully implemented"                │
  ├──────────┼──────────────────┼────────────────┼────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ health   │ YES (standalone) │ N/A            │ N/A                                                        │ Wired directly in router, not through main.go imports (this is fine) │
  └──────────┴──────────────────┴────────────────┴────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────────┘

  So 4 real dead domains: contract, invoice, ratecard, studio.

  ---
  Placeholder/Stub Features — What LOOKS done but ISN'T

  Backend Stubs (5):

  ┌─────────────────────┬──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────┐
  │       Feature       │       Location       │                                           What it does                                           │
  ├─────────────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Account Deletion    │ auth/handler.go:181  │ Returns success JSON with "30-day cooling-off" but does nothing — no DB update, no job scheduled │
  ├─────────────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Account Export      │ auth/handler.go:199  │ Returns "download link via email" but no data gathered, no email sent                            │
  ├─────────────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Studio UpdateStudio │ studio/service.go:82 │ Returns "not fully implemented"                                                                  │
  ├─────────────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Studio InviteMember │ studio/service.go:82 │ Returns "not fully implemented"                                                                  │
  ├─────────────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Studio RemoveMember │ studio/service.go:93 │ Returns "not fully implemented"                                                                  │
  └─────────────────────┴──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────┘

  Frontend Stub Pages (5):

  ┌───────────────────────────────────┬───────┬─────────────────────────────┐
  │               Page                │ Lines │           Content           │
  ├───────────────────────────────────┼───────┼─────────────────────────────┤
  │ admin/AuditLogsPage.tsx           │ 5     │ "Audit logs placeholder"    │
  ├───────────────────────────────────┼───────┼─────────────────────────────┤
  │ admin/DataSubjectRequestsPage.tsx │ 5     │ "DSR placeholder"           │
  ├───────────────────────────────────┼───────┼─────────────────────────────┤
  │ admin/GeminiModelsPage.tsx        │ 5     │ "Gemini models placeholder" │
  ├───────────────────────────────────┼───────┼─────────────────────────────┤
  │ admin/IncidentsPage.tsx           │ 5     │ "Incidents placeholder"     │
  ├───────────────────────────────────┼───────┼─────────────────────────────┤
  │ admin/LegalHoldsPage.tsx          │ 5     │ "Legal holds placeholder"   │
  └───────────────────────────────────┴───────┴─────────────────────────────┘

  Frontend Stub Services (6):

  ┌─────────────────────────┬───────┬─────────────────────────────┐
  │         Service         │ Lines │        What it does         │
  ├─────────────────────────┼───────┼─────────────────────────────┤
  │ askGalleryService.ts    │ 27    │ Single method, minimal      │
  ├─────────────────────────┼───────┼─────────────────────────────┤
  │ captionService.ts       │ 31    │ Single AI caption call      │
  ├─────────────────────────┼───────┼─────────────────────────────┤
  │ hashtagService.ts       │ 31    │ Single AI hashtag call      │
  ├─────────────────────────┼───────┼─────────────────────────────┤
  │ photoAnalysisService.ts │ 31    │ Single AI analysis call     │
  ├─────────────────────────┼───────┼─────────────────────────────┤
  │ storyService.ts         │ 31    │ Single AI story call        │
  ├─────────────────────────┼───────┼─────────────────────────────┤
  │ dashboardService.ts     │ 37    │ Single dashboard stats call │
  └─────────────────────────┴───────┴─────────────────────────────┘

  Dashboard Mock Data (hardcoded KPIs, not from API):

  - AdminDashboardPage.tsx — MOCK_ALERTS, QUICK_ACTIONS, KPIS, ACTIVITY_FEED
  - DealerDashboardPage.tsx — QUICK_ACTIONS, hardcoded activity badge
  - SuperAdminDashboardPage.tsx — MOCK_KPIS, MOCK_ESCALATIONS, MOCK_SERVICES, MOCK_FINANCIAL, QUICK_ACTIONS

  ---
  NIL Dependencies (potential runtime panics)

  ┌─────────────┬─────────────────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
  │  Location   │                              Code                               │                                   What's nil                                   │
  ├─────────────┼─────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ main.go:184 │ gallery.NewService(galleryRepo, nil, shareRepo)                 │ 2nd param (cache?)                                                             │
  ├─────────────┼─────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ main.go:227 │ photo.NewService(photoRepo, derivRepo, r2Client, nil, r2Bucket) │ 4th param (StorageQuotaChecker) — r2Client may also be nil if env vars missing │
  ├─────────────┼─────────────────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ main.go:268 │ client.NewService(clientRepo, nil)                              │ 2nd param (unknown dependency)                                                 │
  └─────────────┴─────────────────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

  ---
  Actually Missing from Codebase (PRD promises, zero code)

  ┌─────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┐
  │         Feature         │                                        Evidence of Absence                                        │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Email/SMS delivery      │ Zero SMTP/SendGrid/Twilio imports. OTP is stored in DB but never delivered to user                │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Password reset flow     │ No ForgotPassword/ResetPassword in auth service — only OTP flow exists                            │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Video transcoding       │ Entire PRD doc (Video_Transcoding_Delivery.md), zero backend code                                 │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ CLI tooling             │ Entire PRD doc (CLI_Tooling_Automation.md), zero code                                             │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Google Calendar sync    │ No Google Calendar API code anywhere                                                              │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Push notifications      │ No FCM/APNs code                                                                                  │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Full-text search engine │ Search domain exists but is basic CRUD on search_indexes table — no Meilisearch/Typesense/pg_trgm │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ PGvector integration    │ Container running but zero Go code references pgvector                                            │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ rate_cards table        │ Migration missing — ratecard domain queries a table that doesn't exist                            │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Background job queue    │ Worker pool exists for photos only — no general-purpose job queue (e.g., for email, cleanup)      │
  ├─────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Row-Level Security      │ Zero RLS policies in any migration — tenant isolation is purely application-layer WHERE clauses   │
  └─────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  Summary Scorecard (from real code)

  ┌──────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                         Category                         │                                           Real Status                                           │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Backend compiles                                         │ YES                                                                                             │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Backend tests pass                                       │ 60/66 packages pass, 5 fail (all photo/S3-related), 1 skip (no DB)                              │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Frontend compiles                                        │ NO — 1,706 TS errors (mostly shared-types gaps)                                                 │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Domains with full stack (handler+service+pg_repo+routes) │ 27 of 32                                                                                        │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Domains with code but not wired                          │ 4 (contract, invoice, ratecard, studio)                                                         │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Backend stub methods                                     │ 5 (3 studio + 2 DPDP placeholders)                                                              │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Frontend stub pages                                      │ 5                                                                                               │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Frontend stub services                                   │ 6                                                                                               │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Dashboards with hardcoded mock data                      │ 3                                                                                               │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Infrastructure packages (real code)                      │ R2 storage, Redis cache, worker pool, PhonePe, GST calc, EXIF, imaging, watermark, rate limiter │
  ├──────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Missing critical integrations                            │ Email, SMS, password reset, video, calendar sync, RLS                                           │
  └──────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────┘
