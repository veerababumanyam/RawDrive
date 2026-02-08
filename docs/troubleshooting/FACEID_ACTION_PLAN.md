# FaceID Action Plan – Free Test User & Root Cause

**Goal:** Get faces detected for the free test user’s photos and pin down any failure with logs and tests.

---

## 1. Do NOT delete/reload photos

- Keep existing photos. Re-queueing is enough.
- If jobs are `failed`, reset them to `pending` (see Step 4). Only consider delete/re-upload if we need a clean slate for a specific test.

---

## 2. Enable logs and debug

### 2.1 Face-worker log level (Docker)

The face-worker respects `LOG_LEVEL` (INFO or DEBUG). To get verbose logs:

In `infrastructure/docker/docker-compose.yml`, under `face-worker` → `environment`, add:

```yaml
LOG_LEVEL: "DEBUG"
```

Then recreate the container: `docker compose -f infrastructure/docker/docker-compose.yml up -d face-worker`. Remove or set back to `INFO` for production.

### 2.2 Log points that are already in place (use these to trace)

- **Worker:** `Processing detection job` (job_id, photo_id) → then either `Detection job completed` (faces_detected) or `Failed to process job` (error).
- **Worker:** Job failure path: `_handle_job_failure` → `Job scheduled for retry` or `Job failed after max retries`.
- **Detection service:** `Starting face detection` (photo_id, workspace_id, image_size) → `Face detection complete` (faces_detected) or exception.
- **Consent:** If detection is blocked you get `DetectionDisabledError`; if allowed you get `Starting face detection` right after.

Watch for:

- No `Starting face detection` → consent/config blocked.
- `Starting face detection` but then `Failed to download/decrypt photo` → R2 or decryption issue.
- `Starting face detection` then `Face detection complete` with 0 faces → provider returned no faces or all filtered.
- `Detection job completed` with N faces → success; then check DB for `faces` / `face_groups`.

### 2.3 Check worker logs (evidence first)

```bash
# Last 100 lines
docker logs rawdrive-face-worker --tail 100

# Follow live (do not restart worker while testing)
docker logs -f rawdrive-face-worker
```

---

## 3. Action plan (step-by-step)

### Step A – Baseline state (in Docker)

Run inside backend container (same DB as worker):

```bash
docker exec rawdrive-backend python src/scripts/verify_free_user_faceid.py
```

Note: photo count, job counts by status (pending/processing/completed/failed), faces count, face_groups count.

### Step B – Ensure jobs are queued (no delete/reload)

If there are no pending jobs or you want to re-queue all free-user photos:

```bash
docker exec rawdrive-backend python src/scripts/verify_free_user_faceid.py --queue
```

If you prefer to reset only **failed** jobs to pending (and leave completed as-is), use the reset script in Step 4.

### Step C – Do not restart the face-worker

- Let the worker run. Restarting kills in-flight jobs.
- If you must restart (e.g. after a code change), run Step B again after restart to re-queue if needed.

### Step D – Wait and sample logs

- Wait at least 2–3 minutes (first job may do model download).
- Then:

```bash
docker logs rawdrive-face-worker --tail 150
```

Look for:

- `Processing detection job` → `Starting face detection` → `Face detection complete` → `Detection job completed` (with faces_detected).
- Or the first log line that shows an error (e.g. download/decrypt, or DetectionDisabledError).

### Step E – Re-check state

```bash
docker exec rawdrive-backend python src/scripts/verify_free_user_faceid.py
```

- If **faces** increased and some jobs are **completed** → pipeline is working; root cause for earlier issues was likely restarts or consent/config (now fixed).
- If jobs are still **processing** → wait longer or check logs for timeout/errors.
- If jobs are **failed** → use Step F and logs to identify root cause (error_message in DB + worker log stack trace).

### Step F – If jobs are failed: inspect DB and logs

- Get last error from DB (e.g. query `face_detection_jobs` for `status='failed'`, `error_message`, `photo_id`).
- Correlate with worker logs (photo_id / job_id) for stack trace and provider/consent messages.
- Then: fix the underlying issue, reset those jobs to pending (Step 4), and run again without restarting the worker mid-run.

---

## 4. Reset failed or stuck jobs (no delete/reload)

**Failed jobs to pending (re-run after fixing root cause):**

```bash
docker exec rawdrive-backend python src/scripts/reset_failed_face_jobs.py
```

**Stuck jobs (stuck in `processing`) to pending:**

```bash
docker exec rawdrive-backend python src/scripts/reset_stuck_jobs.py
```

---

## 5. End-to-end test in Docker (single photo)

To verify the full pipeline in the same environment as production (backend + DB + worker, no reethu.jpg in R2):

1. Use the diagnostic script **inside** the backend container with an **existing** asset (so R2 and decrypt path are used):

   - Either: add a small script that picks one existing photo from the free workspace and calls the same pipeline (reusing existing job or creating one), then checks faces.
   - Or: upload one new photo (e.g. reethu.jpg) via the app, then run `verify_free_user_faceid.py` and watch worker logs until that job completes and faces appear.

2. Confirm in logs: `Processing detection job` → `Starting face detection` → `Face detection complete` → `Detection job completed` (faces_detected &gt; 0) and then see rows in `faces` for that workspace.

---

## 6. Known root cause: OpenCV DNN not thread-safe (fixed)

If logs show:

- `Embedding generation failed: OpenCV ... error: (-215:Assertion failed) memHosts.find(lp) == memHosts.end() in function 'addHost'`
- or `refIt->second > 0 in function 'releaseReference'`

**Cause:** OpenCV’s DNN backend is not thread-safe. With `CONCURRENT_JOBS=2`, two threads used the same FaceEmbedder net at once and triggered internal assertions.

**Fix (in code):** Face embedder now uses an `_inference_lock` so only one inference runs at a time. No need to change CONCURRENT_JOBS unless you want to reduce load.

---

## 7. Root cause checklist (use with logs + DB)

- **No “Starting face detection”** → consent or config blocked (check `workspace_biometric_settings` and `_is_detection_enabled` / config_service).
- **“Failed to download/decrypt photo”** → R2 key, permissions, or decryption (object_key, ENCRYPTION_MASTER_KEY, variant).
- **“Face detection complete” with 0 faces** → provider returned nothing or all below confidence; check provider (Cloud Vision / Gemini / local) and min_confidence.
- **“Detection job completed” with N &gt; 0 but no rows in `faces`** → bug in store/cluster or wrong workspace_id in query.
- **Worker restarts mid-run** → check `docker inspect` (OOMKilled, ExitCode) and whether someone ran `docker restart`; do not assume OOM without evidence.

---

## 8. Summary

1. Do **not** delete/reload photos unless you need a clean slate; re-queue or reset failed jobs.
2. Enable **DEBUG** (or keep INFO) and use the **existing** log lines to trace each job.
3. **Do not restart** the face-worker while verifying; run `verify_free_user_faceid.py` before/after and `docker logs` in between.
4. Use **verify_free_user_faceid.py** for state; use **logs + DB error_message** for root cause.
5. Confirm end-to-end in Docker with one job from upload (or existing asset) through to `faces` rows and logs.
