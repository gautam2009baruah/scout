# Database — FEAXXXX <Feature Name>

← Back to Index: [AD2_FEAXXXX_Index.md](AD2_FEAXXXX_Index.md)

## Overview

<!-- Brief description of what database changes are required and why. -->

## New Tables

<!-- Repeat this block for each new table. -->

### `<table_name>`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INT` | `PK, NOT NULL, IDENTITY` | Primary key |
| <!-- column --> | <!-- type --> | <!-- constraints --> | <!-- description --> |

**Indexes:**
- `IX_<table>_<column>` on `(<column>)`

---

## Modified Tables

<!-- Repeat this block for each modified table. Show additions/changes only — not the full schema. -->

### `<existing_table_name>`

**Additions:**

| Column | Type | Constraints | Description |
|---|---|---|---|
| <!-- new column --> | | | |

**Changes:**

| Column | Before | After | Reason |
|---|---|---|---|
| | | | |

---

## Migration Scripts

```sql
-- Migration: FEAXXXX_<FeatureName>
-- Description: 

BEGIN TRANSACTION;

-- Add your migration SQL here

COMMIT;
```

## Rollback Scripts

```sql
-- Rollback: FEAXXXX_<FeatureName>

BEGIN TRANSACTION;

-- Add your rollback SQL here

COMMIT;
```
