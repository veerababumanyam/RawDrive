# RawDrive Production Launch Checklist

## Go / No-Go Gates

- Backend tests pass with Docker available: `npm run test:backend`.
- Frontend gates pass: `npm run lint`, `npm run test:frontend`, `npm run build`.
- Dependency gates pass: `pnpm --dir frontend audit --audit-level high` and `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` from `backend/`.
- Dockerized E2E passes inside the project Playwright service after the API and frontend are running.
- Backend and frontend container images build from `backend/Dockerfile` and `frontend/Dockerfile`.

## Required Production Configuration

- `APP_ENV=production`.
- `FRONTEND_URL` set to the exact public app origin.
- `DATABASE_URL` points to managed Postgres 16 with pgvector enabled.
- `VALKEY_URL` points to managed Valkey/Redis for rate limiting.
- `EVENT_BROKER=nats` and `NATS_URL` points to JetStream-capable NATS.
- `PLATFORM_SETTINGS_KEK` is a 32-byte hex value from the secret manager.
- `TRUSTED_PROXY_MODE=true` only when TLS is terminated by a trusted upstream proxy; otherwise set `TLS_CERT_PATH` and `TLS_KEY_PATH`.
- All required Backblaze B2 storage variables are set: `B2_BUCKET_NAME`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_ENDPOINT`, `B2_REGION`. The S3-compatible endpoint has the form `https://s3.<region>.backblazeb2.com`. `B2_KEY_ID` maps to `AccessKeyID`; `B2_APPLICATION_KEY` maps to `SecretAccessKey`.
- SMTP is configured with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM`. Optional: `SMTP_FROM_NAME` (defaults to "RawDrive").
- Google OAuth uses a callback URL on the same site as the app/API session cookie plan.

## Release Sequence

1. Build both images from a clean commit.
2. Run migrations against a staging clone.
3. Smoke test login, OAuth login, MFA step-up, registration activation, gallery upload, WebP derivatives, and authenticated download.
4. Promote the same image digests to production.
5. Watch API error rate, upload processing failures, auth refresh failures, queue depth, Postgres connections, Valkey availability, and NATS publish errors for the first hour.

## Rollback

- Keep the previous frontend and backend image digests available.
- Roll back application images first.
- Do not roll back database migrations unless a tested down migration exists and no production writes depend on the new schema.
- Revoke or rotate exposed credentials immediately if any launch incident involves logs, screenshots, or leaked environment output.
