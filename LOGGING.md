# Enabling Logging in Production

Step-by-step guide to turn on structured logging for the Scout app, workers, and
HTTP API services on the AWS Lightsail (Ubuntu + PM2) deployment.

The app already logs through a shared logging seam (`lib/logging`). This guide is
only about **configuring and accessing** those logs in production — no code
changes required.

---

## What you get

- **Structured JSON logs** (one object per line) — easy to filter and, later, to
  ship to CloudWatch / pino / any log platform.
- **Errors on a separate stream** — `error`-level logs go to `stderr`, so PM2
  writes them to a dedicated `*-error.log` file. Finding errors = read that file.
- **Secrets are redacted** automatically (API keys, tokens, passwords, etc.).
- **Log levels** (`debug|info|warn|error`) you can tune without redeploying.

---

## Step 1 — Set the logging environment variables

On the server, edit your production env file (e.g. `.env.local` or `.env`):

```bash
cd /path/to/scout
nano .env.local
```

Add (or set) these two lines:

```dotenv
# debug | info | warn | error   (production should use info)
LOG_LEVEL=info
# json | pretty                 (production should use json)
LOG_FORMAT=json
```

- `LOG_LEVEL=info` keeps normal operational logs but drops noisy `debug` lines.
- `LOG_FORMAT=json` emits machine-parseable JSON. (If unset, production defaults
  to JSON anyway, but set it explicitly so it's obvious.)

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

---

## Step 2 — Restart the PM2 processes so they pick up the env

PM2 caches environment variables, so you must restart with `--update-env`:

```bash
pm2 restart scout --update-env
pm2 restart scout-jobs --update-env
pm2 restart scout-triggers-schedule --update-env
pm2 restart scout-triggers-email --update-env
```

> Include any HTTP API services you run the same way, e.g.
> `pm2 restart scout-chatbot-api --update-env`.

Confirm they're online:

```bash
pm2 list
```

---

## Step 3 — Know where the logs live

PM2 writes each process's output to two files under `~/.pm2/logs/`:

| Stream | File | Contains |
|--------|------|----------|
| stdout | `scout-out.log` | `debug` / `info` / `warn` |
| stderr | `scout-error.log` | **`error` only** |

So the same split exists for every process: `scout-jobs-out.log` /
`scout-jobs-error.log`, `scout-triggers-email-out.log` /
`scout-triggers-email-error.log`, and so on.

**To see only errors, read the `*-error.log` files.**

---

## Step 4 — Enable log rotation (so logs don't fill the disk)

Install and configure the PM2 log-rotation module once:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M       # rotate a file when it hits 20 MB
pm2 set pm2-logrotate:retain 14          # keep 14 rotated files
pm2 set pm2-logrotate:compress true      # gzip old logs
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # also rotate daily at midnight
```

---

## Step 5 — View and filter logs

### Live tail (on the server)

```bash
pm2 logs scout                 # all output for the app
pm2 logs scout --err           # errors only
pm2 logs --lines 200           # last 200 lines across all processes
```

### Filter by level with `jq` (JSON logs)

```bash
# All errors from the app
cat ~/.pm2/logs/scout-error.log | jq 'select(.level=="error")'

# Everything for one company
cat ~/.pm2/logs/scout-out.log | jq 'select(.companyId=="<company-uuid>")'

# Errors from the email poller
cat ~/.pm2/logs/scout-triggers-email-error.log | jq '.'
```

### Filter from your local machine (no copying files)

```bash
ssh ubuntu@<your-static-ip> "cat ~/.pm2/logs/scout-error.log" | jq 'select(.level=="error")'
```

> Tip: pipe to a file locally to keep a copy —
> `ssh ubuntu@<ip> "cat ~/.pm2/logs/scout-error.log" > errors.log`.

---

## Step 6 — Verify it's working

Tail the app while you exercise it (make a request / trigger a job) and confirm
you see JSON lines like:

```json
{"ts":"2026-08-06T06:48:30.513Z","level":"info","scope":"chatbot-api","msg":"chat query received","requestId":"...","companyId":"..."}
```

Cause an error path and confirm the line appears in `scout-error.log` (not
`scout-out.log`) and that no secrets are present (they show as `"[REDACTED]"`).

---

## Reference: what each field means

| Field | Meaning |
|-------|---------|
| `ts` | ISO timestamp |
| `level` | `debug` / `info` / `warn` / `error` |
| `scope` | which service/module logged it (e.g. `chatbot-api`, `email-trigger-poller`) |
| `msg` | short human message |
| `err` | serialized error (`name`, `message`, `stack`) when logging an exception |
| `companyId`, `requestId`, … | contextual fields for tracing |

---

## Tuning tips

- **Temporarily see more detail:** set `LOG_LEVEL=debug`, restart with
  `--update-env`, reproduce the issue, then set it back to `info`.
- **Pretty logs for a manual debugging session:** `LOG_FORMAT=pretty` (human
  readable, not for permanent production use).
- **Never log secrets:** the logger redacts known secret keys automatically, but
  don't hand-format secrets into a `msg` string.

---

## Later: ship logs off the box (optional)

When you want to query/alert from your laptop without SSH, install the AWS
**CloudWatch agent** on the instance and point it at `~/.pm2/logs/*.log`. Because
the logs are already JSON, CloudWatch Logs Insights can filter fields directly:

```
fields @timestamp, level, msg, scope, companyId
| filter level = "error"
| sort @timestamp desc
```

No application code changes are needed — the JSON output stays the same.
(Lightsail has no instance IAM role, so the agent needs an IAM user with the
`CloudWatchAgentServerPolicy`.)
