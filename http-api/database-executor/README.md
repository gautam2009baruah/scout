# Scout Database Executor

Standalone Node.js service that clients can host themselves. It accepts SQL, executes it against the client's database credentials, and returns rows plus execution metadata. It also exposes a database metadata endpoint that returns schema JSON for syncing.

## Endpoints

- `GET /health` - service health
- `GET /ready` - database connectivity check
- `POST /v1/sql/execute` - execute SQL and return results
- `GET /v1/database/metadata` - return database metadata and schema JSON

## Configuration

Copy `.env.example` to `.env` and fill in the client's database credentials. The Scout control panel never stores those credentials.

Supported drivers:

- PostgreSQL
- MySQL
- SQL Server

## Quick start

```bash
npm install
npm start
```

## Request examples

Execute SQL:

```json
POST /v1/sql/execute
{
  "sql": "SELECT TOP 10 * FROM Customers"
}
```

Database metadata:

```bash
GET /v1/database/metadata
```

## Docker

```bash
docker compose up --build
```

## Response shape

Metadata returns both a human-friendly summary and a `schema` object with `tables`, `columns`, and `foreignKeys`. That shape is compatible with the Scout schema manager sync flow.