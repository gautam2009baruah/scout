from pathlib import Path
import re

workspace = Path(r"c:\AI_projects\scout")
root = workspace / "db" / "migrations"
out_file = root / "126_full_schema_bootstrap.sql"

files = sorted(
    [p for p in root.glob("*.sql") if p.name not in {"125_seed_initial_admin.sql", "126_full_schema_bootstrap.sql"}],
    key=lambda p: (int(re.match(r"(\d+)", p.stem).group(1)) if re.match(r"(\d+)", p.stem) else 999999, p.name),
)

ignore_prefixes = (
    "INSERT INTO",
    "UPDATE ",
    "DELETE ",
    "TRUNCATE ",
    "DROP ",
    "WITH ",
    "CREATE OR REPLACE",
    "CREATE FUNCTION",
    "CREATE TRIGGER",
    "CREATE EVENT TRIGGER",
    "CREATE TYPE",
)


def split_statements(sql_text: str):
    statements = []
    current = []
    i = 0
    in_single = False
    in_double = False
    in_dollar = False
    dollar_tag = None

    while i < len(sql_text):
        ch = sql_text[i]
        nxt = sql_text[i + 1] if i + 1 < len(sql_text) else ""

        if in_single:
            current.append(ch)
            if ch == "'" and sql_text[i - 1] != "\\":
                in_single = False
            i += 1
            continue

        if in_double:
            current.append(ch)
            if ch == '"':
                in_double = False
            i += 1
            continue

        if in_dollar:
            current.append(ch)
            if dollar_tag is None:
                if ch == '$' and nxt == '$':
                    in_dollar = False
                    i += 2
                    continue
            else:
                marker = f"${dollar_tag}$"
                if sql_text[i:i + len(marker)] == marker:
                    in_dollar = False
                    i += len(marker)
                    continue
            i += 1
            continue

        if ch == "'":
            in_single = True
            current.append(ch)
            i += 1
            continue

        if ch == '"':
            in_double = True
            current.append(ch)
            i += 1
            continue

        if ch == '$' and nxt == '$':
            current.append("$$")
            in_dollar = True
            dollar_tag = None
            i += 2
            continue

        if ch == '$':
            j = i + 1
            while j < len(sql_text) and (sql_text[j].isalnum() or sql_text[j] == '_'):
                j += 1
            if j < len(sql_text) and sql_text[j] == '$':
                tag = sql_text[i + 1:j]
                current.append(sql_text[i:j + 1])
                in_dollar = True
                dollar_tag = tag
                i = j + 1
                continue

        if ch == ';':
            stmt = ''.join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    tail = ''.join(current).strip()
    if tail:
        statements.append(tail)
    return statements


def is_schema_statement(stmt: str) -> bool:
    s = stmt.strip()
    if not s or s.startswith("--"):
        return False
    if s.startswith(ignore_prefixes):
        return False
    if s.startswith("DO $$") or s.startswith("DO $"):
        return False
    if s.startswith("CREATE EXTENSION"):
        return True
    if s.startswith("CREATE TABLE"):
        return True
    if s.startswith("CREATE INDEX") or s.startswith("CREATE UNIQUE INDEX"):
        return True
    if s.startswith("ALTER TABLE"):
        if "DROP " in s or "RENAME " in s or "SET SCHEMA" in s:
            return False
        return "ADD COLUMN" in s or "ADD CONSTRAINT" in s or "ALTER COLUMN" in s or "SET NOT NULL" in s or "SET DEFAULT" in s
    return False


lines_out = []
lines_out.append("-- Consolidated bootstrap migration for a fresh deployment.")
lines_out.append("-- Replays the schema DDL from the existing migration history and seeds modules.")
lines_out.append("")
lines_out.append("CREATE EXTENSION IF NOT EXISTS vector;")
lines_out.append("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
lines_out.append("")

seen_extension = False
for path in files:
    text = path.read_text(encoding="utf-8")
    for statement in split_statements(text):
        if not is_schema_statement(statement):
            continue
        normalized = statement.strip().rstrip()
        if normalized.endswith(";"):
            normalized = normalized[:-1].rstrip()
        if normalized.startswith("CREATE TABLE"):
            normalized = re.sub(r"\bCREATE TABLE\s+", "CREATE TABLE IF NOT EXISTS ", normalized, count=1, flags=re.IGNORECASE)
        if normalized.startswith("CREATE INDEX"):
            normalized = re.sub(r"\bCREATE INDEX\s+", "CREATE INDEX IF NOT EXISTS ", normalized, count=1, flags=re.IGNORECASE)
        if normalized.startswith("CREATE UNIQUE INDEX"):
            normalized = re.sub(r"\bCREATE UNIQUE INDEX\s+", "CREATE UNIQUE INDEX IF NOT EXISTS ", normalized, count=1, flags=re.IGNORECASE)
        if normalized.startswith("CREATE EXTENSION"):
            if seen_extension:
                continue
            seen_extension = True
        lines_out.append(normalized + ";")
        lines_out.append("")

lines_out.append("-- Seed the required modules table data for the admin UI.")
lines_out.append("INSERT INTO modules (key, name, href, sort_order, parent_key)")
lines_out.append("VALUES")
lines_out.append("  ('home', 'Home', '/admin', 1, NULL),")
lines_out.append("  ('users', 'Users', '/admin/users', 2, NULL),")
lines_out.append("  ('roles', 'Roles', '/admin/roles', 3, NULL),")
lines_out.append("  ('companies', 'Companies', '/admin/companies', 4, NULL)")
lines_out.append("ON CONFLICT (key) DO NOTHING;")

out_file.write_text("\n".join(lines_out).rstrip() + "\n", encoding="utf-8")
print(f"Wrote {out_file}")
