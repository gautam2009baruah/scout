# Chatbot API Service

Standalone lightweight API for customer-facing chatbot integrations.

This service is intentionally separated from the Control Panel UI runtime and can be deployed independently. It still reads from the same Scout database for retrieval, workflows, and telemetry.

## Endpoints

- `GET /health` - liveness
- `GET /ready` - readiness (DB check)
- `POST /v1/context/resolve` - resolve `companyName` and optional `targetAppName`
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

## Customer drop-in React widget snippet

Use ready-to-share copy/paste component in:

- [services/chatbot-api/CUSTOMER_REACT_DROPIN_SNIPPET.tsx](services/chatbot-api/CUSTOMER_REACT_DROPIN_SNIPPET.tsx)

## Customer website script embed snippet

Use this for non-React websites that want a single copy-paste script block.

```html
<!-- Start Scout AI Chatbot Widget -->
<script>
  (function () {
    var SCOUT_BASE = "https://your-scout-domain.com";
    var SCOUT_HEAD = document.getElementsByTagName("head")[0];

    function loadScript(src, onLoad) {
      var s = document.createElement("script");
      s.type = "text/javascript";
      s.src = src;
      s.async = true;
      if (onLoad) s.onload = onLoad;
      SCOUT_HEAD.appendChild(s);
    }

    loadScript(SCOUT_BASE + "/scout-chatbot-embed.js", function () {
      // Optional if orchestration playback is required.
      loadScript(SCOUT_BASE + "/scout-orchestration-player.js");

      window.ScoutChatbot.init({
        mount: "body",
        assistantName: "Acme Assistant",
        brandColor: "#111827",
        accentColor: "#0ea5e9",
        position: "bottom-right",
        apiUrl: SCOUT_BASE + "/v1/chat/query",
        companyId: "acme-company-id",
        userId: "current-user-id",
        headers: {
          "X-API-Key": "your-restricted-public-key"
        }
      });
    });
  })();
</script>
<!-- End Scout AI Chatbot Widget -->
```

### Variant: static HTML with auto-generated anonymous user id

Use this when the client site does not have a logged-in user id yet.

```html
<!-- Start Scout AI Chatbot Widget (Anonymous Session Variant) -->
<script>
  (function () {
    var SCOUT_BASE = "https://your-scout-domain.com";
    var SCOUT_HEAD = document.getElementsByTagName("head")[0];

    function getAnonymousUserId() {
      var storageKey = "scout-chat-anon-user-id";
      var existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
      var generated = "anon-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(storageKey, generated);
      return generated;
    }

    function loadScript(src, onLoad) {
      var s = document.createElement("script");
      s.type = "text/javascript";
      s.src = src;
      s.async = true;
      if (onLoad) s.onload = onLoad;
      SCOUT_HEAD.appendChild(s);
    }

    loadScript(SCOUT_BASE + "/scout-chatbot-embed.js", function () {
      window.ScoutChatbot.init({
        mount: "body",
        assistantName: "Acme Assistant",
        brandColor: "#111827",
        accentColor: "#0ea5e9",
        position: "bottom-right",
        apiUrl: SCOUT_BASE + "/v1/chat/query",
        companyId: "acme-company-id",
        userId: getAnonymousUserId(),
        headers: {
          "X-API-Key": "your-restricted-public-key"
        }
      });
    });
  })();
</script>
<!-- End Scout AI Chatbot Widget (Anonymous Session Variant) -->
```

Security note for direct browser calls:

- Any key included in client-side JavaScript is visible to end users.
- Use a restricted, rate-limited, and revocable key.
- Prefer short-lived tokens if you later add a lightweight token-issuing backend.

## Separate deploy manifests

- Docker Compose: [services/chatbot-api/docker-compose.chatbot-api.yml](services/chatbot-api/docker-compose.chatbot-api.yml)
- Kubernetes: [services/chatbot-api/k8s-deployment.yaml](services/chatbot-api/k8s-deployment.yaml)

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
