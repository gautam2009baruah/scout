---
name: OHIP Preflight Validation
description: Validation-only mode  validates OHIP YAML input without generating any code
tags: [ohip, preflight, validation, yaml]
category: domain-skill
priority: 3
---

# OHIP Preflight Validation

Dry-run validation of the OHIP input template. No code is generated.

> **Preflight runs AUTOMATICALLY before every implementation mode.** Use `codenova, ohip preflight` only when you want to validate without implementing.

---

## Validation Rules

### Action Name
-  PascalCase (e.g., `Profiles`, `RatePlan`, `RoomTypes`)
-  Not camelCase, snake_case, or kebab-case
-  Not plural when singular is the convention (check existing patterns in `OHIP_ACTION_REGISTRY.md`)

### Event Names (`action.events[]`)
-  UPPERCASE WITH SPACES (e.g., `NEW PROFILE`, `UPDATE PROFILE`)
-  Not lowercase or mixed case
-  Not using underscores or hyphens

### Routing Types
-  All three defined: `AriRequestType`, `ConversationRequestType`, `SourceDataType`
-  No `TBD` values  all must reference existing enum values

### Consolidation
-  Strategy is one of: `MostRecent`, `Earliest`, `Custom`
-  If `Custom`: consolidation logic described, key field(s) identified
-  Deduplication key field(s) identified

### API Endpoint (`api.*`)
-  Path starts with `/` (e.g., `/pms/v1/profiles`)
-  HTTP method specified: `GET`, `POST`, or `PUT`
-  Query parameters clearly defined
-  Request model class name provided

### Sample Payload
-  Valid JSON
-  Contains all expected fields used in consolidation
-  Includes key identifiers: `HotelId`, `RecordId`, etc.

### Git Block (if `git.create_feature_branch: true`)
-  `user_story_id` present (defaults to `US11111` if omitted)
-  `branch_description` is kebab-case
-  `base_branch` defined (defaults to `master`)

---

## Output

| Result | Meaning |
|---|---|
|  **PASS** | Input is valid  proceed with implementation modes |
|  **FAIL** | Lists all errors with field paths and required fixes |

**If preflight fails:** Fix the input YAML before running any implementation mode.

---

## Template Reference

Input template: `.github/instructions/isf/ohipskill/ohip-action-input.yaml`
