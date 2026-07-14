# HTTP Trigger API

Independent ingress API for orchestration HTTP/API triggers.

## Run

- Dev: `npm run http-trigger-api:dev`
- Start: `npm run http-trigger-api:start`

## Endpoint

- `GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS /apitrigger/:shortName/*`
- `GET /health`

This API mirrors the behavior currently exposed by `app/apitrigger/[shortName]/[[...pathSegments]]/route.ts`.
