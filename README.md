# Scout Chatbot

A standalone, configurable chatbot that can be installed on any website.

## Database Configuration

The application has one database contract: `DATABASE_URL`. It does not branch on whether the database is bundled or externally managed.

### Mode 1: Bundled PostgreSQL With pgvector

Copy `.env.example` to `.env.local`, keep the bundled default `DATABASE_URL`, then start the database:

```bash
docker compose up -d postgres
```

The bundled service uses `pgvector/pgvector:pg16` and runs `docker/postgres/init/001-enable-pgvector.sql` on first database creation to enable the `vector` extension.

Default local URL:

```txt
postgresql://scout:scout_password@localhost:5432/scout
```

### Mode 2: External PostgreSQL With pgvector

Set `DATABASE_URL` in the deployment environment to the client-provided PostgreSQL connection string:

```txt
DATABASE_URL="postgresql://app_user:strong_password@db.example.com:5432/scout?sslmode=require"
```

The external database must have pgvector available and the `vector` extension enabled for the target database.

## Admin Authentication Setup

Run the admin auth schema migration:

```bash
npm run db:migrate
```

Seed the first company and first owner admin from environment variables:

```bash
npm run db:seed:first-admin
```

Required seed variables:

- `SEED_COMPANY_NAME`
- `SEED_COMPANY_SLUG`
- `SEED_ADMIN_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

The migration creates:

- `companies`
- `roles`
- `users`
- `admin_sessions`

Admin sessions are stored in PostgreSQL, issued as HTTP-only cookies, and expire after 15 minutes.

## User Registration

Users are stored in `users` with company and role assignments. Registration creates an activation token and records an activation email in `email_outbox`; the email body contains `/admin/activate?token=...`.

If `SMTP_HOST` is configured, the activation email is sent through SMTP and the outbox record is marked `sent`. Without SMTP, the email remains queued in `email_outbox` for local development and testing.

The user list uses database-level filtering and pagination. Filters are applied in SQL and records are fetched with `LIMIT` and `OFFSET`, so the UI does not load every user for large companies.

## Universal HTML Embed

Use this option for clients whose websites are built with WordPress, PHP, Laravel, Django, Rails, plain HTML, Webflow, Shopify, or any other non-React stack.

```html
<div id="scout-chatbot"></div>
<script src="/scout-chatbot-embed.js"></script>
<script>
  ScoutChatbot.init({
    mount: "#scout-chatbot",
    assistantName: "Acme Assistant",
    brandColor: "#111827",
    accentColor: "#0ea5e9",
    position: "bottom-right",
    heightRatio: 0.75,
    apiUrl: "/api/chat"
  });
</script>
```

Open the plain HTML demo at:

```txt
http://localhost:3000/embed-demo.html
```

The universal embed file is [public/scout-chatbot-embed.js](public/scout-chatbot-embed.js). It exposes `window.ScoutChatbot.init(config)` and injects its own CSS, so the client site does not need React, Next.js, or Tailwind.

## React Or Next.js Component

Import the component and mount it near the root of a customer app:

```tsx
import { ScoutChatbot } from "@/components";

export function AppShell() {
  return (
    <>
      <YourApplication />
      <ScoutChatbot
        variant="floating"
        position="bottom-right"
        assistantName="Acme Assistant"
        theme={{ brandColor: "#111827", accentColor: "#0ea5e9" }}
        onSendMessage={async (message, history) => {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, history })
          });

          return response.json();
        }}
      />
    </>
  );
}
```

## Main React Props

- `variant`: `floating` for a fixed launcher widget, or `inline` for embedding inside a page layout.
- `position`: `bottom-right` or `bottom-left` when using the floating variant.
- `assistantName`, `badge`, `subtitle`, `placeholder`: customer-facing copy.
- `theme`: brand and accent colors.
- `quickPrompts`: suggested prompt buttons.
- `initialMessages`: preloaded conversation messages.
- `onSendMessage`: async handler for your future backend API.
- `modeNotice`: optional message shown at the top of the chat.

## Backend Hook Shape

`onSendMessage` receives the latest user message and the visible message history:

```ts
onSendMessage?: (
  message: string,
  history: ScoutChatMessage[]
) => Promise<ScoutChatMessage | string | void>;
```

Return a string for a simple assistant reply, or a `ScoutChatMessage` if you need richer message metadata.

## Universal Embed Config

- `mount`: CSS selector or DOM element where the widget should mount.
- `assistantName`, `badge`, `subtitle`, `placeholder`: customer-facing copy.
- `brandColor`, `accentColor`: customer branding.
- `position`: `bottom-right` or `bottom-left`.
- `width`: default widget width in pixels.
- `heightRatio`: default widget height as a ratio of viewport height. The default is `0.75`.
- `quickPrompts`: suggested prompt buttons.
- `initialMessages`: preloaded conversation messages.
- `apiUrl`: backend endpoint that receives `{ message, history }`.
- `headers`: optional extra request headers for the API call.
- `modeNotice`: optional message shown at the top of the chat.

The universal widget can be dragged by its header, resized from the bottom-right handle, minimized, closed, and restored to its default size and position.
