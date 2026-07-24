# ScoutChatbot Implementation and Operations Guide

**Document type:** Implementation handover  
**Audience:** Customer implementation teams, Scout platform administrators, DevOps, security, and support teams  
**Widget:** ScoutChatbot universal hosted widget  
**Widget loader version:** 1.1.1  
**Last updated:** 14 July 2026

---

## 1. Purpose

This guide explains how to deploy the standalone Scout Chatbot API and add the canonical ScoutChatbot to a customer application.

It covers:

- the deployment architecture;
- every installation setting;
- how to identify or provision the company, user, target application, and API key;
- installation in HTML, React, Angular, Vue, WordPress, Java, PHP, and .NET applications;
- local, Docker, Kubernetes, and production API operation;
- security, key rotation, monitoring, validation, and troubleshooting.

The integration uses one hosted ScoutChatbot implementation. Customers do not receive a separate simplified chatbot. The customer application loads a small JavaScript transport, which displays the canonical React chatbot in an isolated iframe. This prevents the customer's CSS and JavaScript from changing or breaking the widget.

---

## 2. Architecture

```text
Customer browser
  |
  | 1. Loads /scout-chatbot.js from the Scout web application
  v
Scout hosted widget iframe
  |
  | 2. Sends authenticated HTTPS requests
  v
Standalone Scout Chatbot API
  |
  | 3. Reads tenant configuration, permissions, RAG content,
  |    workflows, conversations, and telemetry
  v
Scout PostgreSQL database and configured AI services
```

There are three independently hosted URLs:

| Component | Local example | Production example | Responsibility |
|---|---|---|---|
| Customer application | `http://localhost:4173` | `https://portal.customer.com` | Hosts the customer's business application |
| Scout web application | `http://localhost:3000` | `https://scout.example.com` | Hosts the widget loader, iframe UI, and workflow player |
| Chatbot API | `http://localhost:4200` | `https://chat-api.scout.example.com` | Authenticates and executes chatbot requests |

The widget iframe is appended to the existing page. It does not replace the customer's `<body>` or application root.

---

## 3. Prerequisites

Before installation, confirm that:

1. The Scout database migrations have been applied, including `093_chatbot_api_keys.sql`.
2. The company exists in Scout.
3. At least one active Scout user belongs to the company and has chatbot access.
4. The customer application is registered as a target application if guided workflows are required.
5. The user has access to that target application.
6. The Scout web application and Chatbot API are reachable over HTTPS in production.
7. The company's RAG documents have been ingested, processed, and made available to the relevant company or target application.
8. A company-scoped browser API key has been issued.

Run database migrations from the Scout repository root:

```bash
npm run db:migrate
```

---

## 4. Configuration reference

### 4.1 Required widget settings

| Setting | Meaning | Source | Example |
|---|---|---|---|
| `scoutUrl` | Public base URL of the Scout web application that hosts the widget | Scout deployment configuration | `https://scout.example.com` |
| `apiUrl` | Public base URL of the standalone Chatbot API | Chatbot API deployment | `https://chat-api.scout.example.com` |
| `apiKey` | Revocable company-scoped browser key | `chatbot_api_keys`; plaintext is shown only when issued | `sk_browser_acme_...` |
| `companyId` | Stable UUID of the Scout company | `companies.id` | `f90d8652-d7ac-4cee-93e5-2d6ced72c6e7` |
| `companyName` | Exact active company name used for tenant resolution | `companies.name` | `Acme Corporation` |
| `userId` | Stable UUID of an active Scout user in that company | `users.id` | `2f0e8ed6-0e8b-4975-aafd-a053f47f8f57` |

### 4.2 Target-application settings

| Setting | Required? | Meaning |
|---|---|---|
| `targetAppId` | Required for guided workflows; recommended otherwise | UUID from `company_target_applications.id` |
| `targetAppName` | Required when target-app-scoped retrieval or workflows are used | Exact `company_target_applications.name` |

If both values are omitted, the chatbot operates at the company-global level. Content assigned only to a target application may not be available globally.

### 4.3 Optional presentation settings

| Setting | Example | Purpose |
|---|---|---|
| `assistantName` | `Acme Assistant` | Name displayed by the widget |
| `brandColor` | `#111827` | Primary header and action color |
| `accentColor` | `#0ea5e9` | Accent and focus color |
| `position` | `bottom-right` | Launcher position; use `bottom-right` or `bottom-left` |
| `placeholder` | `Ask about vendors or start a workflow...` | Input prompt |
| `quickPrompts` | `['Find a contract', 'Check vendor risk']` | Optional suggested questions |
| `zIndex` | `2147482000` | Optional stacking order override |

Do not include trailing slashes in `scoutUrl` or `apiUrl`. The loader tolerates them, but normalized URLs are easier to troubleshoot.

---

## 5. Understanding and obtaining identifiers

### 5.1 Company ID and company name

The company ID is the primary key of an existing Scout tenant. Do not invent a new UUID in the customer application. A company must be created through the normal Scout company-onboarding process so all required company records and permissions exist.

An administrator may look up the company as follows:

```sql
SELECT id, name, status, created_at
FROM companies
WHERE lower(name) = lower('Acme Corporation');
```

Use the returned `id` as `companyId` and the exact returned `name` as `companyName`.

The API resolves the company name and then verifies that the API key belongs to the resolved company. A key issued for one company cannot be used with another company.

### 5.2 User ID

`userId` identifies the person or service identity on whose behalf the chat request runs. It is used for authorization, conversations, workflow access, and telemetry.

It is not:

- the person's email address;
- a display name;
- a newly generated browser UUID;
- a random anonymous visitor ID;
- the customer application's unrelated internal user ID unless that ID is also the Scout `users.id`.

Find eligible users with:

```sql
SELECT
  u.id,
  u.email,
  u.status,
  u.can_view_chatbot,
  ucr.company_id,
  ucr.status AS company_role_status
FROM users u
JOIN user_company_roles ucr ON ucr.user_id = u.id
WHERE ucr.company_id = '<company_uuid>'
  AND u.deleted_at IS NULL
  AND u.status = 'active'
  AND u.can_view_chatbot = true
  AND ucr.deleted_at IS NULL
  AND ucr.status = 'active';
```

Recommended identity models:

1. **Named-user model:** Map each signed-in customer user to a corresponding Scout user UUID. This provides the best audit trail and per-user access control.
2. **Service-user model:** Use one dedicated, least-privileged Scout user for a controlled public or shared portal. Conversations and telemetry will be attributed to that service user, so assess this choice with security and compliance teams.

Never use an administrator's user ID as a generic public website identity.

### 5.3 Target application ID and name

A target application represents the customer site in Scout. It connects workflows and target-app-scoped content to the correct application.

Lookup:

```sql
SELECT id, company_id, name, base_url
FROM company_target_applications
WHERE company_id = '<company_uuid>'
ORDER BY name;
```

If it does not exist, create it through Scout's target-application administration UI. A database administrator may provision it directly only when following the project's normal audit requirements:

```sql
INSERT INTO company_target_applications (
  company_id,
  name,
  base_url,
  created_by,
  updated_by
)
VALUES (
  '<company_uuid>',
  'Customer Portal',
  'https://portal.customer.com',
  '<admin_user_uuid>',
  '<admin_user_uuid>'
)
RETURNING id;
```

### 5.4 User access to the target application

Target-app restrictions are stored in `user_target_app_access`. In this schema, no target-app access rows for a user within the company means the user is unrestricted. Once scoped rows are present, ensure the required target application has an active row.

```sql
INSERT INTO user_target_app_access (
  user_id,
  target_app_id,
  created_by,
  updated_by
)
VALUES (
  '<user_uuid>',
  '<target_app_uuid>',
  '<admin_user_uuid>',
  '<admin_user_uuid>'
)
ON CONFLICT (user_id, target_app_id) DO UPDATE
SET deleted_at = NULL,
    deleted_by = NULL,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
```

---

## 6. API keys

### 6.1 What the API key is

The key authenticates the hosted widget to the Chatbot API. Database-managed keys are:

- scoped to one company;
- stored as SHA-256 hashes, not plaintext;
- individually named, expirable, revocable, and auditable;
- accepted in `X-API-Key` or `Authorization: Bearer` headers.

The plaintext key is intentionally available only when it is generated. Scout cannot recover it from `key_hash` later. If it is lost, issue a replacement.

### 6.2 Browser-key security model

The key is delivered to a browser and can be inspected by a technically capable end user. Therefore:

- treat it as a **restricted publishable credential**, not a backend master secret;
- issue a separate key for every customer application and environment;
- never reuse database passwords, AI-provider keys, administrator tokens, or server secrets;
- combine company scoping with HTTPS, least-privileged users, CORS, rate limiting, monitoring, expiration, and rotation;
- revoke it immediately if the deployment is retired or abuse is detected.

### 6.3 Generate a strong key

Use an approved secrets-management or administrative process. This Node.js example prints a plaintext key, its prefix, and its SHA-256 hash:

```js
import { createHash, randomBytes } from 'node:crypto';

const secret = `sk_browser_${randomBytes(32).toString('base64url')}`;
console.log({
  secret,
  prefix: secret.slice(0, 20),
  hash: createHash('sha256').update(secret).digest('hex')
});
```

Run it only in a secure administrative environment. Copy the plaintext key directly into the customer's secret/configuration delivery process and store only the hash in Scout:

```sql
INSERT INTO chatbot_api_keys (
  company_id,
  name,
  key_prefix,
  key_hash,
  expires_at,
  created_by
)
VALUES (
  '<company_uuid>',
  'customer-portal-production',
  '<generated_prefix>',
  '<generated_sha256_hash>',
  '2027-07-14T00:00:00Z',
  '<admin_user_uuid>'
)
RETURNING id, company_id, name, key_prefix, is_active, expires_at;
```

If PostgreSQL `pgcrypto` is enabled, the hash can instead be calculated with:

```sql
encode(digest('<plaintext_key>', 'sha256'), 'hex')
```

Avoid placing the plaintext key in SQL history, tickets, chat messages, screenshots, or source control.

### 6.4 Validate, revoke, and rotate keys

List keys without exposing secrets:

```sql
SELECT id, company_id, name, key_prefix, is_active, expires_at, created_at
FROM chatbot_api_keys
WHERE company_id = '<company_uuid>'
ORDER BY created_at DESC;
```

Revoke a key:

```sql
UPDATE chatbot_api_keys
SET is_active = false, updated_at = now()
WHERE id = '<api_key_record_uuid>';
```

Rotation procedure:

1. Issue a new key with a new name or version suffix.
2. Deploy the new plaintext key to the customer configuration.
3. Verify `/v1/context/resolve` and a real chatbot query.
4. Revoke the previous key.
5. Allow for the configured authentication cache TTL when validating revocation. The default is five minutes; restart the API for immediate cache removal during an emergency.

---

## 7. Running the Chatbot API

### 7.1 Environment variables

| Variable | Required | Default | Description |
|---|---:|---:|---|
| `DATABASE_URL` | Yes | None | PostgreSQL connection string for the Scout database |
| `CHATBOT_API_PORT` | No | `4200` | Listening port |
| `CHATBOT_API_HOST` | No | `0.0.0.0` | Listening interface |
| `CHATBOT_API_ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS allowlist |
| `CHATBOT_API_BODY_LIMIT_BYTES` | No | `262144` | Maximum JSON request size |
| `CHATBOT_API_COMPANY_CACHE_TTL_MS` | No | `300000` | Company-resolution cache TTL |
| `CHATBOT_API_TARGET_APP_CACHE_TTL_MS` | No | `300000` | Target-app cache TTL |
| `CHATBOT_API_AUTH_CACHE_TTL_MS` | No | `300000` | API-key authorization cache TTL |
| `CHATBOT_API_RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window |
| `CHATBOT_API_RATE_LIMIT_MAX_REQUESTS` | No | `60` | Requests per key, client IP, route, and window |
| `CHATBOT_API_KEY` | Legacy only | Empty | Optional global fallback key; avoid for new deployments |

Because API calls originate inside the Scout-hosted iframe, production CORS must include the public Scout widget origin. Depending on direct API consumers, additional approved origins may be added. Do not leave `*` in a hardened production environment.

Example:

```dotenv
DATABASE_URL=postgresql://scout_user:REDACTED@db.internal:5432/scout
CHATBOT_API_PORT=4200
CHATBOT_API_HOST=0.0.0.0
CHATBOT_API_ALLOWED_ORIGINS=https://scout.example.com
CHATBOT_API_RATE_LIMIT_WINDOW_MS=60000
CHATBOT_API_RATE_LIMIT_MAX_REQUESTS=60
```

### 7.2 Local development

From the Scout repository root:

```bash
npm install
npm run db:migrate
npm run dev
```

In a second terminal:

```bash
npm run chatbot-api:dev
```

Expected services:

- Scout: `http://localhost:3000`
- Chatbot API: `http://localhost:4200`

The API start scripts preload the repository `.env.local` or `.env` file.

### 7.3 Production Node process

Build and run Scout according to the main application deployment procedure. Run the API under a process supervisor such as systemd, PM2, a container orchestrator, or the platform's managed service runtime:

```bash
npm ci
npm run chatbot-api:start
```

Set `NODE_ENV=production`, inject secrets through the deployment platform, enable restart-on-failure, and send logs to centralized logging.

### 7.4 Docker Compose

The repository includes `http-api/chatbot-api/docker-compose.chatbot-api.yml` and `http-api/chatbot-api/Dockerfile`.

```bash
docker compose \
  -f http-api/chatbot-api/docker-compose.chatbot-api.yml \
  up -d --build
```

Provide `DATABASE_URL` and other values through a protected environment file or secrets facility. Do not commit production values.

Check status:

```bash
docker compose \
  -f http-api/chatbot-api/docker-compose.chatbot-api.yml \
  ps
```

View logs:

```bash
docker compose \
  -f http-api/chatbot-api/docker-compose.chatbot-api.yml \
  logs -f chatbot-api
```

### 7.5 Kubernetes

The repository includes `http-api/chatbot-api/k8s-deployment.yaml`. Before applying it:

1. publish the image to the approved registry;
2. update the image reference;
3. create the `scout-chatbot-api-secrets` Secret;
4. replace the wildcard CORS value;
5. configure an Ingress with TLS;
6. review replica count and resource limits.

Apply:

```bash
kubectl apply -f http-api/chatbot-api/k8s-deployment.yaml
```

Check:

```bash
kubectl get deployment,pods,service -l app=scout-chatbot-api
kubectl logs -l app=scout-chatbot-api --tail=200
```

The supplied in-memory rate limiter is instance-local. Multi-replica deployments should use a shared external limiter, such as Redis or an API gateway, when a globally consistent limit is required.

### 7.6 Reverse proxy and TLS

Expose the API through HTTPS. The proxy should:

- forward the request body and `Origin`, `Authorization`, `X-API-Key`, `X-Request-Id`, `X-Forwarded-For`, and `Host` headers;
- preserve the API's CORS and rate-limit response headers;
- set appropriate connection and response timeouts for AI requests;
- restrict request sizes consistently with `CHATBOT_API_BODY_LIMIT_BYTES`;
- route `/health`, `/ready`, and `/v1/*` to port `4200`.

---

## 8. API health and validation

### 8.1 Liveness

```bash
curl https://chat-api.scout.example.com/health
```

Expected:

```json
{"ok":true,"service":"chatbot-api"}
```

### 8.2 Readiness

```bash
curl https://chat-api.scout.example.com/ready
```

Expected:

```json
{"ok":true,"ready":true}
```

`/health` proves that the process is running. `/ready` also performs a database check.

### 8.3 Resolve tenant context

```bash
curl -X POST https://chat-api.scout.example.com/v1/context/resolve \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <plaintext_company_browser_key>" \
  -d '{
    "companyName": "Acme Corporation",
    "targetAppName": "Customer Portal"
  }'
```

Expected:

```json
{
  "company": { "id": "<company_uuid>", "name": "Acme Corporation" },
  "targetApp": { "id": "<target_app_uuid>", "name": "Customer Portal" }
}
```

### 8.4 Execute a query

```bash
curl -X POST https://chat-api.scout.example.com/v1/chat/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <plaintext_company_browser_key>" \
  -H "X-Request-Id: implementation-test-001" \
  -d '{
    "companyName": "Acme Corporation",
    "targetAppName": "Customer Portal",
    "userId": "<active_scout_user_uuid>",
    "question": "What is our vendor onboarding policy?",
    "topK": 8
  }'
```

The response includes the request ID, resolved company and target application, execution time, answer, conversation ID, citations, and workflow information when applicable. Retain `conversation_id` and send it as `conversationId` on subsequent messages in the same conversation.

Record the `X-Request-Id` response header during support investigations.

---

## 9. Universal customer installation

### 9.1 Exactly what the customer implementation team must add

The customer does **not** copy `public/scout-chatbot.js`, the React component, or the iframe page into its own repository. Scout hosts those files at `scoutUrl`.

The customer implementation requires only:

1. a customer-owned configuration file;
2. a customer-owned installation file; and
3. two `<script>` references in the application's shared HTML shell.

Recommended customer-side file layout:

```text
customer-application/
  public/
    scout-chatbot-config.js       Customer/environment configuration
    scout-chatbot-install.js      Loads and installs the Scout-hosted widget
  index.html                      References both customer-side files
```

The folder name may differ by technology. Use the framework's normal publicly served static-assets directory, such as `public`, `wwwroot`, `static`, or a shared web-content folder.

#### File 1: `scout-chatbot-config.js`

Create this file inside the customer's publicly served static-assets directory:

```js
window.CustomerScoutChatbotConfig = {
  scoutUrl: "https://scout.example.com",
  apiUrl: "https://chat-api.scout.example.com",
  apiKey: "<company-scoped-browser-key>",
  companyId: "<company-uuid>",
  companyName: "Acme Corporation",
  userId: "<active-scout-user-uuid>",
  targetAppId: "<target-app-uuid>",
  targetAppName: "Customer Portal",
  assistantName: "Acme Assistant",
  brandColor: "#111827",
  accentColor: "#0ea5e9",
  position: "bottom-right",
  autoLoadLifecycleSettings: true
};
```

Replace every placeholder before deployment. When values differ by environment, generate or supply this file through the customer's deployment pipeline.

#### File 2: `scout-chatbot-install.js`

Create this second file in the same static-assets directory:

```js
(function installScoutChatbot() {
  var config = window.CustomerScoutChatbotConfig;

  if (!config) {
    console.error("ScoutChatbot configuration was not loaded.");
    return;
  }

  if (document.getElementById("scout-chatbot-loader")) {
    return;
  }

  var loader = document.createElement("script");
  loader.id = "scout-chatbot-loader";
  loader.src = config.scoutUrl.replace(/\/$/, "") +
    "/scout-chatbot.js?v=1.1.1";
  loader.async = true;

  loader.onload = function () {
    window.CustomerScoutChatbot = window.ScoutChatbot.install(config);
  };

  loader.onerror = function () {
    console.error(
      "ScoutChatbot could not load. Confirm that the Scout host is reachable."
    );
  };

  document.head.appendChild(loader);
})();
```

This file loads `scout-chatbot.js` from Scout. The URL must point to the Scout web application, not the Chatbot API and not the customer application.

#### Inject these references into the shared HTML shell

Add the following immediately before the closing `</body>` tag:

```html
<!-- Existing customer application content and scripts remain unchanged. -->
<script src="/scout-chatbot-config.js"></script>
<script src="/scout-chatbot-install.js"></script>
</body>
```

The order is mandatory: configuration first, installer second.

For a traditional multi-page website, add these references to the common layout or footer so they appear once on every required page. For a single-page application, add them once to the one shared `index.html` or application shell. Do not inject them again during client-side route changes.

#### Complete HTML example

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Customer Portal</title>
  </head>
  <body>
    <div id="app-root"></div>

    <!-- Customer application scripts -->
    <script src="/customer-app.js"></script>

    <!-- ScoutChatbot: configuration must load before installer -->
    <script src="/scout-chatbot-config.js"></script>
    <script src="/scout-chatbot-install.js"></script>
  </body>
</html>
```

#### NexusVendor reference mapping

The NexusVendor reference application uses the same pattern:

```text
nexusvendor-enterprise-portal/index.html
  -> /scout-chatbot-config.local.js
  -> /scout-chatbot-install.js
  -> http://localhost:3000/scout-chatbot.js?v=1.1.1
  -> http://localhost:3000/embed/scout-chatbot
  -> http://localhost:4200/v1/chat/query
```

Reference files:

- `nexusvendor-enterprise-portal/index.html` contains the two customer-side script references.
- `nexusvendor-enterprise-portal/scout-chatbot-config.local.js` contains generated local configuration and is intentionally excluded from source control.
- `nexusvendor-enterprise-portal/scout-chatbot-config.local.js.example` is the safe configuration template.
- `nexusvendor-enterprise-portal/scout-chatbot-install.js` loads the Scout-hosted loader.

### 9.2 Single-block alternative

If the customer does not want two local files, the configuration and installation may be placed directly in the shared HTML template. Add this immediately before `</body>`:

Add the loader after the customer's primary application markup, immediately before the closing `</body>` tag. This ensures the page is available before the widget is installed and avoids blocking the application startup.

```html
<script src="https://scout.example.com/scout-chatbot.js?v=1.1.1"></script>
<script>
  window.ScoutChatbot.install({
    scoutUrl: "https://scout.example.com",
    apiUrl: "https://chat-api.scout.example.com",
    apiKey: "<company-scoped-browser-key>",
    companyId: "<company-uuid>",
    companyName: "Acme Corporation",
    userId: "<active-scout-user-uuid>",
    targetAppId: "<target-app-uuid>",
    targetAppName: "Customer Portal",
    assistantName: "Acme Assistant",
    brandColor: "#111827",
    accentColor: "#0ea5e9",
    position: "bottom-right"
  });
</script>
```

Install the widget once per browser page. Do not add it separately to every routed page in a single-page application.

### 9.3 Alternative three-script configuration pattern

For environments that inject configuration during deployment, keep values outside the main application bundle:

```html
<script src="/scout-chatbot-config.js"></script>
<script src="https://scout.example.com/scout-chatbot.js?v=1.1.1"></script>
<script>
  window.ScoutChatbot.install(window.CustomerScoutChatbotConfig);
</script>
```

Example `scout-chatbot-config.js`:

```js
window.CustomerScoutChatbotConfig = {
  scoutUrl: "https://scout.example.com",
  apiUrl: "https://chat-api.scout.example.com",
  apiKey: "<company-scoped-browser-key>",
  companyId: "<company-uuid>",
  companyName: "Acme Corporation",
  userId: "<active-scout-user-uuid>",
  targetAppId: "<target-app-uuid>",
  targetAppName: "Customer Portal",
  assistantName: "Acme Assistant"
};
```

The browser can still inspect this file. Its purpose is deployment separation and easier rotation, not secret concealment.

When `autoLoadLifecycleSettings` is omitted or set to `true`, the hosted Scout widget will automatically call `/v1/chat/settings` on the standalone chatbot API and apply the effective rolling-context and inactivity rules configured in Scout Admin for the matching company and target app. You can still override values manually by supplying `lifecycleConfig` in the install configuration.

This alternative loads the Scout-hosted loader directly from HTML and then invokes it with a separate configuration file. The two-local-file pattern in section 9.1 is preferred when the implementation team wants all startup logic in a customer-owned installer.

### 9.4 Content Security Policy

If the customer uses Content Security Policy, allow at least:

```text
script-src https://scout.example.com
frame-src https://scout.example.com
connect-src https://chat-api.scout.example.com https://scout.example.com
```

Merge these sources into the existing policy; do not replace the customer's full CSP. Inline-script restrictions may require moving installation code into an approved external JavaScript file or applying the customer's nonce/hash policy.

---

## 10. Framework-specific placement

All frameworks use the same `scout-chatbot.js` loader. No framework-specific chatbot build is required.

### 10.1 React or Next.js

Mount once in the top-level application shell or root layout client component:

```tsx
'use client';

import { useEffect } from 'react';

export function ScoutChatbotInstall() {
  useEffect(() => {
    const existing = document.getElementById('scout-chatbot-loader');
    if (existing) return;

    const script = document.createElement('script');
    script.id = 'scout-chatbot-loader';
    script.src = 'https://scout.example.com/scout-chatbot.js?v=1.1.1';
    script.async = true;

    let widget: { destroy(): void } | undefined;
    script.onload = () => {
      widget = window.ScoutChatbot.install({
        scoutUrl: 'https://scout.example.com',
        apiUrl: 'https://chat-api.scout.example.com',
        apiKey: '<company-scoped-browser-key>',
        companyId: '<company-uuid>',
        companyName: 'Acme Corporation',
        userId: '<active-scout-user-uuid>',
        targetAppId: '<target-app-uuid>',
        targetAppName: 'Customer Portal',
        assistantName: 'Acme Assistant'
      });
    };

    document.head.appendChild(script);
    return () => {
      widget?.destroy();
      script.remove();
    };
  }, []);

  return null;
}
```

Optional TypeScript declaration:

```ts
declare global {
  interface Window {
    ScoutChatbot: {
      install(config: Record<string, unknown>): {
        id: string;
        version: string;
        destroy(): void;
      };
      version: string;
    };
  }
}
```

### 10.2 Angular

Load the script in `index.html`, then call `window.ScoutChatbot.install(...)` once from the root component after view initialization. Destroy the returned handle only when the entire application shell is destroyed, not on route changes.

### 10.3 Vue or Nuxt

Create a client-only plugin or mount from the root application component. Guard against server-side execution with `typeof window !== 'undefined'` and install only once.

### 10.4 WordPress or PHP

Enqueue the Scout loader in the theme or plugin footer and print the installation configuration after it. In WordPress, use `wp_enqueue_script` and a small dedicated initialization file. Do not edit WordPress core files.

### 10.5 Java, .NET, server-rendered applications, and static HTML

Add the universal script block to the shared base template immediately before `</body>`:

- Java/JSP/Thymeleaf: shared layout template;
- ASP.NET/Razor: `_Layout.cshtml`;
- PHP: shared footer template;
- static HTML: each document or a common build-time include.

The backend technology does not affect the browser widget.

---

## 11. Dynamic signed-in users

When each customer user has a corresponding Scout identity, set `userId` from trusted, server-rendered session context rather than user-editable query parameters or local storage.

Recommended flow:

1. Customer authenticates the user.
2. The customer backend maps that identity to the correct Scout user UUID.
3. The page receives only the mapped UUID required by the widget.
4. The widget installs after the authenticated user context is available.
5. On logout or account switching, call `destroy()` and install a new instance with the next user ID.

Never allow a browser user to choose an arbitrary `companyId`, `targetAppId`, or `userId`.

---

## 12. NexusVendor reference implementation

The repository's `nexusvendor-enterprise-portal` is a working reference.

From that project directory:

```bash
npm run configure:chatbot
npm run dev
```

The configuration script:

- finds an active Scout company user with chatbot access;
- finds or creates the NexusVendor target application;
- aligns the workflow target record required by telemetry;
- grants target-app access when the user is operating in scoped mode;
- revokes the previous active NexusVendor key;
- generates and hashes a new browser key;
- writes `scout-chatbot-config.local.js` with restrictive file permissions where supported.

The generated local configuration is excluded from source control. This script contains NexusVendor-specific company and URL values and is a reference, not a general customer provisioning command.

---

## 13. Production security checklist

- [ ] Scout, Chatbot API, and customer application use trusted HTTPS certificates.
- [ ] `CHATBOT_API_ALLOWED_ORIGINS` does not use `*`.
- [ ] Each customer application and environment has a separate API key.
- [ ] Keys have owners, descriptions, expiration dates, and rotation schedules.
- [ ] Only key hashes are stored in the database.
- [ ] Customer source repositories do not contain plaintext production keys.
- [ ] The configured user is active, least-privileged, and approved for chatbot access.
- [ ] Target-app access is correctly scoped.
- [ ] Rate limits are appropriate; distributed deployments use a shared limiter when required.
- [ ] Logs do not print `X-API-Key`, authorization headers, database URLs, or request secrets.
- [ ] CSP allows only the required Scout domains.
- [ ] Database and AI-provider secrets remain server-side.
- [ ] Health endpoints are monitored.
- [ ] Alerts exist for elevated `401`, `403`, `429`, and `5xx` rates.
- [ ] Key revocation and incident-response procedures have been tested.

---

## 14. Troubleshooting

### 14.1 Widget is not visible

Check:

1. Browser developer console for script or CSP errors.
2. `https://scout.example.com/scout-chatbot.js?v=1.1.1` returns JavaScript with HTTP 200.
3. Installation runs after `document.body` exists.
4. The loader is installed only once.
5. The configured `zIndex` is higher than the customer's overlays.
6. `frame-src` permits the Scout domain.
7. The iframe is not removed by a consent manager or DOM sanitizer.

### 14.2 Widget launcher appears but chat does not open

Check the iframe request for `/embed/scout-chatbot`. Confirm the Scout application is running, publicly reachable, and permitted by CSP. Hard-refresh after loader upgrades to remove a cached older script.

### 14.3 Customer page disappears after installation

Use `ScoutChatbot.install(...)` from the universal loader. Do not mount a React application directly into `document.body`, replace `body.innerHTML`, or reuse the customer's application root element. The supported loader appends an isolated iframe.

### 14.4 Chatbot cannot be dragged or resized

1. Confirm loader version `1.1.1` or later.
2. Hard-refresh the page and clear any CDN cache for `scout-chatbot.js`.
3. Drag using the chatbot header, not the message area.
4. Resize using the bottom-right resize control.
5. Confirm no customer CSS applies `pointer-events: none` to iframes.
6. Confirm a transparent overlay is not covering the widget.
7. Use Restore in the chatbot header to return to the default size and corner.

The loader clamps the iframe to the browser viewport so it cannot grow beyond the visible page.

### 14.5 Next.js development “N” indicator overlaps the widget

Scout disables Next.js development indicators in `next.config.mjs`. Restart the Scout development server after changing that configuration. The indicator is development-only and is not expected in a production build.

### 14.6 CORS error

Symptoms include a browser message that the request was blocked by CORS or a failed preflight request.

Check:

- `CHATBOT_API_ALLOWED_ORIGINS` contains the exact Scout widget origin, including scheme and port;
- the reverse proxy forwards `OPTIONS` requests;
- the proxy preserves `Access-Control-Allow-*` response headers;
- `X-API-Key`, `Authorization`, `Content-Type`, and `X-Request-Id` are allowed;
- the API was restarted after environment changes.

### 14.7 `401 Missing API key`

The widget did not send `apiKey`. Confirm configuration loading order and spelling. The supported property is `apiKey`, and the API accepts it as `X-API-Key`.

### 14.8 `401 Invalid API key`

Possible causes:

- copied key is incomplete or contains whitespace;
- database contains the plaintext instead of its SHA-256 hash;
- key was revoked;
- key has expired;
- widget is using a key from another environment;
- authentication cache has not yet refreshed after a change.

Generate the SHA-256 hash of the exact plaintext and compare it securely with `chatbot_api_keys.key_hash`.

### 14.9 `401 API key is not allowed for this company`

The key belongs to a different `company_id` than the company resolved from `companyName`. Correct the configuration or issue a key for the intended company. Never bypass this check.

### 14.10 `400 companyName is required` or company not found

Provide the exact active company name. Confirm it with the `companies` lookup query. Do not place the company UUID in `companyName`.

### 14.11 Target application is not resolved

Confirm:

- `targetAppName` exactly matches `company_target_applications.name` for that company;
- it was not created under another company;
- the API cache has refreshed;
- `targetAppId` and `targetAppName` describe the same record.

Use `/v1/context/resolve` before testing chat.

### 14.12 User is unauthorized or workflows are missing

Confirm that the user:

- exists in `users`;
- is active and not soft-deleted;
- has `can_view_chatbot = true`;
- has an active `user_company_roles` row for the company;
- has the required `user_target_app_access` row when access is scoped;
- is allowed to use the relevant workflow and content.

### 14.13 Chat answers but provides no relevant content

Check the ingestion and retrieval pipeline:

1. Documents belong to the correct company and folder.
2. Processing, parsing, chunking, and embedding jobs completed successfully.
3. Folder-to-target-app mappings are correct.
4. The configured target application matches the content scope.
5. The question is supported by indexed content.
6. Citations and `no_answer_reason` in the API response are reviewed.
7. Required AI-provider and embedding configuration is available to the API runtime.

### 14.14 Guided workflow does not start

Check:

- both `targetAppId` and `targetAppName` are configured;
- the target app's `base_url` and `allowed_origins_json` match the customer site;
- the user has access;
- `https://scout.example.com/scout-orchestration-player.js` loads successfully;
- workflow selectors correspond to the deployed customer application;
- CSP permits the Scout script and required connections.

### 14.15 `429 Rate limit exceeded`

Wait until `X-RateLimit-Reset`, reduce request frequency, or review the configured limits. Do not automatically retry in a tight loop. Limits are calculated per API key, client IP, route, and window on each API instance.

### 14.16 `/health` works but `/ready` fails

The process is alive but cannot query PostgreSQL. Validate `DATABASE_URL`, DNS, firewall rules, TLS requirements, credentials, database availability, and connection limits.

### 14.17 API returns `500`

Capture:

- UTC timestamp;
- request URL and method;
- response status and body;
- `X-Request-Id`;
- company and target application names, without the API key;
- relevant API logs and database status.

Never include plaintext keys, authorization headers, database passwords, personal content, or AI-provider secrets in a support ticket.

### 14.18 Port already in use (`EADDRINUSE`)

Another process is listening on the configured port. Either stop the duplicate process or assign a different port with `CHATBOT_API_PORT`. Update `apiUrl` and reverse-proxy configuration accordingly.

### 14.19 Browser shows an old widget after deployment

Use a versioned loader URL, such as `scout-chatbot.js?v=1.1.1`, invalidate the CDN cache, and hard-refresh. Maintain controlled cache headers and increment the version query when publishing loader behavior changes.

---

## 15. Operational monitoring

Monitor:

- `/health` and `/ready` availability;
- p50, p95, and p99 request duration;
- request volume and active conversations;
- `400`, `401`, `404`, `429`, and `5xx` rates;
- database connection usage;
- AI-provider latency and failures;
- no-answer rate and citation coverage;
- key expiry dates;
- workflow-start failures.

Use `X-Request-Id` as the correlation identifier across the proxy, API, retrieval pipeline, and support records. Customers may send their own unique `X-Request-Id`; otherwise the API generates one.

---

## 16. Implementation acceptance checklist

The integration is ready for release when:

- [ ] `/health` and `/ready` return HTTP 200.
- [ ] `/v1/context/resolve` returns the intended company and target application.
- [ ] An authenticated query returns an answer and conversation ID.
- [ ] Relevant questions return appropriate citations.
- [ ] The widget opens, closes, drags, resizes, restores, and remains within the viewport.
- [ ] Customer pages and routing remain unchanged after installation.
- [ ] The widget works at supported desktop and mobile viewport sizes.
- [ ] Signed-in user attribution is correct.
- [ ] Target-app-scoped content and workflows obey access rules.
- [ ] CSP, CORS, proxy, and HTTPS behavior are verified in the production-like environment.
- [ ] Rate-limit behavior is tested.
- [ ] Key rotation and revocation are tested.
- [ ] Logs and support evidence do not expose secrets.
- [ ] The customer implementation owner and Scout operations owner are documented.

---

## 17. Handover information template

Complete this section for each customer deployment. Deliver plaintext keys through an approved secrets channel, not inside this document.

| Item | Value |
|---|---|
| Customer/company name | |
| Company ID | |
| Scout URL | |
| Chatbot API URL | |
| Customer application URL | |
| User identity model | Named user / Service user |
| Service user ID, if applicable | |
| Target application name | |
| Target application ID | |
| API key record ID | |
| API key prefix | |
| API key expiry date | |
| Key secret delivery channel | |
| Allowed origins | |
| Rate limit | |
| Scout implementation owner | |
| Customer implementation owner | |
| Support contact and escalation route | |
| Production go-live date | |

---

## 18. Repository references

- Universal widget loader: `public/scout-chatbot.js`
- Hosted widget route: `app/embed/scout-chatbot/page.tsx`
- Canonical chatbot component: `components/scout-chatbot.tsx`
- Chatbot API: `http-api/chatbot-api/src/server.ts`
- Authentication: `http-api/chatbot-api/src/auth.ts`
- Tenant resolution: `http-api/chatbot-api/src/tenant-resolution.ts`
- Dockerfile: `http-api/chatbot-api/Dockerfile`
- Docker Compose: `http-api/chatbot-api/docker-compose.chatbot-api.yml`
- Kubernetes manifest: `http-api/chatbot-api/k8s-deployment.yaml`
- API-key migration: `db/migrations/093_chatbot_api_keys.sql`
- Target-app migration: `db/migrations/036_guided_workflow_training_sessions.sql`
- User target-app access: `db/migrations/085_user_target_app_access.sql`
- NexusVendor reference installer: `nexusvendor-enterprise-portal/scout-chatbot-install.js`
- NexusVendor provisioning example: `nexusvendor-enterprise-portal/scripts/configure-scout-chatbot.mjs`

---

**End of document**
