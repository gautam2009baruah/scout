# Production `.env` Setup

Brief guide for configuring environment variables when deploying to production
(AWS Lightsail + PM2).

## 1. Create the file

`.env.example` is a template. Copy it to `.env.local` on the server and edit the
values. `.env.local` is gitignored, so your secrets never end up in git.

```bash
cp .env.example .env.local
nano .env.local
```

The app (Next.js) and the workers both read `.env.local` (then `.env`).

## 2. Change these for production

| Variable | Set to |
|----------|--------|
| `DATABASE_URL` | Your production Postgres URL (add `?sslmode=require` for an external DB) |
| `APP_BASE_URL` | `https://your-real-domain` |
| `LOG_LEVEL` | `info` |
| `LOG_FORMAT` | `json` |
| `SMTP_HOST` / `SMTP_*` | Real SMTP for user activation & password-reset emails (leave blank to keep them queued, unsent) |
| `CHATBOT_API_ALLOWED_ORIGINS` | Your real embed origins (not `*`) |
| `POSTGRES_PASSWORD` (+ user/db) | Strong values, if using the bundled Docker Postgres |
| `*_API_URL` / hosts / ports | Only if standalone services run on other hosts (localhost defaults are fine on one box) |

## 3. Generate strong secrets

Generate a fresh random value for each of these:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

| Secret | Notes |
|--------|-------|
| `CHATBOT_API_KEY` | Long random key for the standalone Chatbot API |
| `RECORDER_SYNC_INTERNAL_SECRET` | Shared secret for the recorder-sync service |
| `SMART_FINDER_INTERNAL_SECRET` | Shared secret for the smart-finder service |
| `CONNECTOR_INTERNAL_SECRET` | **Must be identical** in the app and the document worker |

## 4. Apply the changes

```bash
pm2 restart all --update-env
```

## Notes

- **Not** configured here: LLM / embedding providers (set per company in-app
  under AI Configuration) and per-client email (stored in the database). `SMTP_*`
  is only for Scout's own system emails (activation, password reset).
- `load-env.mjs` only sets a variable if it isn't already present, so anything
  exported in the shell / PM2 config overrides the file.
- Keep `.env.local` out of git and back it up somewhere safe (e.g. a password
  manager) — it holds all your secrets.
