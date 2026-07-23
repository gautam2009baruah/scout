# Recorder Sync API

Independent API for training-plugin step sync writes.

## Run

- Dev: `npm run recorder-sync-api:dev`
- Start: `npm run recorder-sync-api:start`

## Endpoint

- `POST /v1/recorder/actions`
- `OPTIONS /v1/recorder/actions`
- `GET /health` — checks database connectivity; returns `503` if the pool can't reach Postgres. Suitable as a k8s liveness/readiness probe.

This API mirrors the behavior currently exposed by `app/api/guided-workflow-recorder/actions/route.ts`, which now proxies to this service via `RECORDER_SYNC_API_URL`.

## Operational notes

- Request bodies are capped at 256 KB; oversized payloads get a `413`.
- Handles `SIGTERM`/`SIGINT` for graceful shutdown (drains in-flight requests, closes the DB pool) — required for clean pod rollouts/restarts in Kubernetes.
- Logs unhandled request errors and uncaught exceptions to stderr so they surface in pod logs.
