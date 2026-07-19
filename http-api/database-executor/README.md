# Scout Database Executor

This standalone service connects Scout to a client-hosted PostgreSQL, MySQL, or
SQL Server database. Keep this service inside the client's network and expose
its URL to Scout through the client's normal firewall or reverse-proxy rules.

## Requirements

- Node.js 20.6 or newer, or Docker Desktop / Docker Engine
- Network access from this service to the client's database
- A database account with only the permissions required by the Scout workflows

## Option A: Windows (easiest)

1. Unzip `scout-database-executor.zip`.
2. Double-click `start.cmd`.
3. The first run creates `.env`. Open `.env` and enter the database settings.
4. Double-click `start.cmd` again.

The launcher installs dependencies on its first successful start. Later starts
only launch the service.

## Option B: Linux or macOS

```bash
unzip scout-database-executor.zip
cd scout-database-executor
chmod +x start.sh
./start.sh
```

The first run creates `.env` and asks you to edit it. After saving the database
settings, run `./start.sh` again.

## Option C: Docker

1. Copy `.env.example` to `.env`.
2. Enter the database settings in `.env`.
3. Run:

```bash
docker compose up -d --build
```

Check status with:

```bash
docker compose ps
docker compose logs -f
```

## Database configuration

Set `DB_TYPE` to one of:

- `postgresql`
- `mysql`
- `sqlserver`

For PostgreSQL, `DATABASE_URL` is recommended:

```dotenv
DB_TYPE=postgresql
DATABASE_URL=postgresql://username:password@database-host:5432/database-name
DB_SCHEMA=public
DB_SSL=false
```

If a password contains characters such as `@`, `:`, `/`, `#`, or `%`,
URL-encode it before putting it in `DATABASE_URL`. Alternatively, leave
`DATABASE_URL` empty and use `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
and `DB_NAME`.

Only the settings for the selected `DB_TYPE` are used.

## Verify the installation

Open these URLs from a machine that can reach the service:

```text
http://SERVER_HOST:4300/health
http://SERVER_HOST:4300/ready
http://SERVER_HOST:4300/v1/database/metadata
```

Expected `/health` response:

```json
{"ok":true,"service":"scout-database-executor"}
```

Expected `/ready` response:

```json
{"ok":true,"databaseType":"postgresql"}
```

Use the metadata URL in Scout's Database Schema Manager after `/ready`
succeeds.

## Endpoints

- `GET /health` — service process health
- `GET /ready` — database connectivity health
- `GET /v1/database/metadata` — database metadata for schema synchronization
- `POST /v1/sql/execute` — execute SQL and return rows and metadata

## Execute SQL

Send `POST /v1/sql/execute` with the `Content-Type: application/json` header.
Do not add a trailing slash to the endpoint URL.

The endpoint accepts the Database node's default output directly:

```json
{
  "databaseQuery": {
    "schemaId": "schema-id",
    "schemaName": "scout",
    "databaseType": "postgresql",
    "generatedQuery": "SELECT * FROM users LIMIT 10",
    "sqlValidation": {
      "valid": true,
      "mode": "select_only"
    },
    "notExecuted": true
  }
}
```

If the Database node uses a custom output-variable name instead of
`databaseQuery`, that top-level name is also accepted as long as its object
contains a `generatedQuery` string.

The shorter `sql` payload remains supported:

Request:

```json
{
  "sql": "SELECT * FROM users LIMIT 10"
}
```

A JSON string containing SQL is also accepted:

```json
"SELECT * FROM users LIMIT 10"
```

cURL:

```bash
curl -X POST http://localhost:4300/v1/sql/execute \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT * FROM users LIMIT 10"}'
```

PowerShell:

```powershell
$body = @{ sql = "SELECT * FROM users LIMIT 10" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri http://localhost:4300/v1/sql/execute `
  -ContentType "application/json" `
  -Body $body
```

Successful response:

```json
{
  "rows": [
    { "id": 1, "name": "First row" },
    { "id": 2, "name": "Second row" }
  ],
  "rowCount": 2,
  "durationMs": 12,
  "databaseName": "scout",
  "databaseType": "postgresql",
  "httpStatusCode": 200
}
```

If the request body is empty, null, or does not contain usable SQL, it returns
HTTP 400 with `rows: []`, `rowCount: 0`, `httpStatusCode: 400`, an `errorCode`,
and a precise JSON `message`. A valid SELECT that simply matches no records is
not an error; it returns HTTP 200 with `rows: []` and `rowCount: 0`.

The endpoint executes the supplied statement using the configured database
account. Restrict port 4300 to Scout and authorized internal systems, and give
the database account only the permissions required by Scout workflows.

## Troubleshooting

- `client password must be a string`: ensure the file is named `.env`, is in
  the same folder as `package.json`, and restart the service.
- `password authentication failed`: verify the username/password and database
  access rules.
- `ECONNREFUSED`: verify the database host/port and firewall.
- Docker with a database on the same computer: `localhost` means the container
  itself. Use `host.docker.internal` on Windows/macOS or the appropriate Docker
  network hostname.
- After every `.env` change, restart with `start.cmd`, `./start.sh`, or
  `docker compose restart`.
