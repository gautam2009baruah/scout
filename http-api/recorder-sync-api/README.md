# Recorder Sync API

Independent API for training-plugin step sync writes.

## Run

- Dev: `npm run recorder-sync-api:dev`
- Start: `npm run recorder-sync-api:start`

## Endpoint

- `POST /v1/recorder/actions`
- `OPTIONS /v1/recorder/actions`
- `GET /health`

This API mirrors the behavior currently exposed by `app/api/guided-workflow-recorder/actions/route.ts`.
