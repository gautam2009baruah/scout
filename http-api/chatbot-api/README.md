# Chatbot API Service

Standalone authenticated API for customer-facing ScoutChatbot integrations.

This service is intentionally separated from the Control Panel UI runtime and can be deployed independently. It still reads from the same Scout database for retrieval, workflows, and telemetry.

## Endpoints

- `GET /health` - liveness
- `GET /ready` - readiness (DB check)
- `POST /v1/context/resolve` - resolve `companyName` and optional `targetAppName`
- `POST /v1/chat/settings` - resolve effective chatbot lifecycle settings for company/target app
- `POST /v1/chat/query` - run full chatbot query flow

## Authentication

Primary mode is company-scoped API keys stored in database table `chatbot_api_keys`.
The service hashes incoming keys and validates them against that table.

Optional fallback mode uses `CHATBOT_API_KEY` as a legacy global key.

Send key in either:

- `X-API-Key: <key>`
- `Authorization: Bearer <key>`

## Required Environment Variables

- `DATABASE_URL`

If you do not use DB-managed keys yet, set:

- `CHATBOT_API_KEY`

## Optional Environment Variables

- `CHATBOT_API_PORT` (default `4200`)
- `CHATBOT_API_HOST` (default `0.0.0.0`)
- `CHATBOT_API_ALLOWED_ORIGINS` (CSV, default `*`)
- `CHATBOT_API_BODY_LIMIT_BYTES` (default `262144`)
- `CHATBOT_API_COMPANY_CACHE_TTL_MS` (default `300000`)
- `CHATBOT_API_TARGET_APP_CACHE_TTL_MS` (default `300000`)
- `CHATBOT_API_AUTH_CACHE_TTL_MS` (default `300000`)
- `CHATBOT_API_RATE_LIMIT_WINDOW_MS` (default `60000`)
- `CHATBOT_API_RATE_LIMIT_MAX_REQUESTS` (default `60`)

## Company key setup (recommended)

Generate a strong secret key in your secure backend/admin process and store only its SHA-256 hash:

```sql
INSERT INTO chatbot_api_keys (company_id, name, key_prefix, key_hash, created_by)
VALUES (
  '<company_uuid>',
  'customer-app-prod',
  'sk_live_abcd',
  encode(digest('<full_secret_key>', 'sha256'), 'hex'),
  '<admin_user_uuid>'
);
```

Use PostgreSQL `pgcrypto` extension (`digest`) if you generate hash in SQL.

## Rate limiting

Rate limiting is in-memory per `api-key + client-ip + route`.
For distributed multi-instance deployments, prefer an external shared limiter (for example Redis) in a follow-up.

## Run

From repo root:

- Dev: `npm run chatbot-api:dev`
- Start: `npm run chatbot-api:start`

Both commands preload the repository `.env.local`/`.env` file. This API listens on port `4200` by default.

## Customer installation

All customer technologies use the same hosted React `ScoutChatbot` through the universal loader. There is no separate HTML or framework-specific chatbot implementation.

- [Customer installation guide](CUSTOMER_INSTALLATION.md)

## Separate deploy manifests

- Docker Compose: [http-api/chatbot-api/docker-compose.chatbot-api.yml](http-api/chatbot-api/docker-compose.chatbot-api.yml)
- Kubernetes: [http-api/chatbot-api/k8s-deployment.yaml](http-api/chatbot-api/k8s-deployment.yaml)

## Example request

`POST /v1/chat/query`

```json
{
  "companyName": "Acme Corp",
  "targetAppName": "Customer Portal",
  "userId": "2f0e8ed6-0e8b-4975-aafd-a053f47f8f57",
  "question": "What is the policy number for customer John Doe?",
  "conversationId": "",
  "topK": 8
}
```
