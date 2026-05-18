# face-svc

Internal face detection + embedding sidecar for RawDrive.

## What it is

A FastAPI service that wraps [InsightFace](https://github.com/deepinsight/insightface)'s
`buffalo_l` model (RetinaFace detector + ArcFace r100 embedder). The Go API
posts image bytes to `/detect`; gets back face bounding boxes and L2-normalized
512-d embeddings that store directly into pgvector with `vector_cosine_ops`.

## Endpoints

| Method | Path       | Body                                  | Response                                        |
| ------ | ---------- | ------------------------------------- | ----------------------------------------------- |
| GET    | `/healthz` | —                                     | `{status, model, ready}`                        |
| POST   | `/detect`  | multipart form, field `image` (bytes) | `{faces:[{bbox,embedding,det_score}], image_width, image_height, model}` |

Embeddings are 512-floats, L2-normalized — cosine similarity equals dot product.

## Why a sidecar

The Go backend builds with `CGO_ENABLED=0` (static binary, alpine runtime ~30 MB).
Wiring dlib/ONNX directly would require CGo + ~200 MB of system libs. A Python
sidecar keeps the Go image untouched and lets us swap the model later without
redeploying the API.

face-svc is bound to the internal docker network only — it's NOT exposed to the
public internet. Embeddings are biometric data; only the Go API talks to it.

## Tunables

All via env var, all have safe defaults:

| Var                          | Default     | Purpose                                              |
| ---------------------------- | ----------- | ---------------------------------------------------- |
| `FACE_SVC_MODEL`             | `buffalo_l` | InsightFace model pack. Don't change without testing. |
| `FACE_SVC_DET_SIZE`          | `640`       | Detector input size (square). Lower = faster, less accurate. |
| `FACE_SVC_MIN_DET_SCORE`     | `0.5`       | Drop detections below this confidence.               |
| `FACE_SVC_MAX_IMAGE_BYTES`   | `20971520`  | Hard cap on upload bytes (20 MB).                    |
| `FACE_SVC_LOG_LEVEL`         | `INFO`      | Python logging level.                                |
| `INSIGHTFACE_HOME`           | `/home/facesvc/.insightface` | Model cache dir; persist via volume. |

## Model cache

First request triggers a ~280 MB download from InsightFace's model registry
into `$INSIGHTFACE_HOME`. The compose file mounts a named volume here so
restarts don't re-download.

## Smoke test

Once the service is up:

```bash
curl -fsS http://localhost:${FACE_SVC_PORT:-8085}/healthz
# {"status":"ok","model":"buffalo_l","ready":true}

curl -fsS -F "image=@tests/photos/Wedding (42).jpg" \
  http://localhost:${FACE_SVC_PORT:-8085}/detect | jq '.faces | length'
# e.g. 4
```

## Integration with Go

See `backend/internal/face/client.go`. The Go client reads `FACE_SVC_URL`
(typically `http://face-svc:8000` inside the compose network) and is the only
production consumer.

## Privacy / DPDP

Face embeddings are biometric data under Indian DPDP and EU GDPR. Workspace
opt-in is gated on the `workspaces.face_recognition_enabled` column (migration
110); the Go ingest worker checks the flag before calling face-svc. This service
itself is stateless — it doesn't persist images or embeddings.
