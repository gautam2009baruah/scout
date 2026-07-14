# Service and HTTP API Inventory

This repository now separates deployable runtime units into:

- service/
- http-api/

## Services

1. Email Trigger Poller
- Folder: service/email-trigger-poller
- Entrypoint: service/email-trigger-poller/src/worker.mjs
- NPM command: npm run triggers:email

2. Document Job Worker
- Folder: service/document-job-worker
- Entrypoint: service/document-job-worker/src/worker.mjs
- NPM command: npm run jobs:documents

3. Schedule Trigger Worker
- Folder: service/schedule-trigger
- Entrypoint: service/schedule-trigger/src/worker.ts
- NPM command: npm run triggers:schedule

## HTTP APIs

1. Chatbot API
- Folder: http-api/chatbot-api
- Entrypoint: http-api/chatbot-api/src/server.ts
- NPM commands: npm run chatbot-api:dev, npm run chatbot-api:start

2. Recorder Sync API (training plugin step sync)
- Folder: http-api/recorder-sync-api
- Entrypoint: http-api/recorder-sync-api/src/server.ts
- NPM commands: npm run recorder-sync-api:dev, npm run recorder-sync-api:start
- Endpoint: POST /v1/recorder/actions

3. Smart Finder API (save healed choice)
- Folder: http-api/smart-finder-api
- Entrypoint: http-api/smart-finder-api/src/server.ts
- NPM commands: npm run smart-finder-api:dev, npm run smart-finder-api:start
- Endpoint: POST /v1/healing-suggestions

4. HTTP Trigger API
- Folder: http-api/http-trigger-api
- Entrypoint: http-api/http-trigger-api/src/server.ts
- NPM commands: npm run http-trigger-api:dev, npm run http-trigger-api:start
- Endpoint: /apitrigger/:shortName/*

## Notes and Counterpoints

- The training plugin sync and smart finder save were already API routes in Next.js, not direct browser-to-database writes. This extraction makes them independently deployable.
- The HTTP trigger ingress already existed as a route handler under app/apitrigger; now it is also available as an independent API runtime.

## Potential Additional Extractions (if needed)

- app/api/session/* (if separate auth/session gateway is required)
- app/api/chatbot/settings (if you want to centralize this into chatbot-api only)
- app/api/orchestrations/* admin/runtime endpoints (if orchestration control plane must be independently deployed)

For tomorrow's deployment, the core services/apis you listed are now isolated under service/ and http-api/ with dedicated startup commands.
