---
description: "OHIP skill dispatch protocol ⚡ loaded on demand when OHIP intent is detected. Never loaded on every turn."
mode: "agent"
---

# OHIP Skill Dispatch Protocol

---

## Progressive-Disclosure Routing

```
codenova.task.run("ohip-skill", subject)
  │
  ├─ Step 1: Load manifest
  │    → .github/instructions/pd/skills/ohip/manifest.md
  │
  ├─ Step 2: Load trigger map
  │    → .github/instructions/pd/skills/ohip/triggers.md
  │
  ├─ Step 3: Apply conditional loading rules
  │    → .github/instructions/pd/skills/ohip/loading-rules.md
  │    → Always load OHIP overview first, then one route file (registry OR one mode)
  │
  ├─ Step 4: Apply nested-load rules only if needed
  │    → .github/instructions/pd/skills/ohip/nested-loads.md
  │
  └─ Step 5: Format output using template
       → .github/instructions/pd/skills/ohip/response-templates.md
```

## Canonical Intent Source

Intent alias normalization is centralized in `.github/instructions/codenova.instructions.md`.
This prompt is execution-only after the route resolves to `ohip-skill`.

If route selection is ambiguous, ask one clarifying question before loading deep files.

## Cross-Skill Intake

If `ohip-skill` receives upstream packets from another skill in a compound workflow:

- treat rule/constraint packets as mandatory context, not optional commentary
- prefer mapping those constraints onto OHIP modes and action touchpoints
- return recommended file and mode changes as a compact evidence packet for the destination skill

Common example:

- `tax-skill` packet in -> identify which OHIP actions, DTOs, handlers, or tests must reflect tax constraints

---

## Intent → Path Routing

| User input pattern | Path |
|---|---|
| "what is OHIP", "explain OHIP", "how does DumboBroker work" | A |
| "how does neweventtype work", "what files does eventhandler touch" | B |
| "codenova, ohip neweventtype", "implement OHIP action type", "add event handler" | C |
| "codenova, ohip validate", "validate my OHIP implementation" | C (validate) |
| "codenova, ohip endtoend" | C ⚡ runs all modes in sequence: neweventtype → eventhandler → apiintegration → dtomapping → tests → validate |

---

## Implementation Command Execution (Path C)

When `codenova, ohip <mode>` is invoked:

1. Load `OHIP_DOMAIN_OVERVIEW.md` for context
2. Load the matching mode guide from `ohip.skillindex`
3. Read the YAML input (ask user to paste if not provided)
4. Execute implementation instructions from the loaded mode guide
5. Hand off remaining file edits to `codenova.ohip.<mode>` extension command
6. Confirm completion ⚡ suggest running `codenova, ohip validate` after implementation

**Input YAML required for all implementation modes.**  
Fields summary: `action.name`, `action.events[]`, `consolidation.*`, `api.*`, `routing.*`, `dto_mapping.*`, `sample_payload`.

---

## No-Crawl Guarantee

> OHIP skill MUST NOT call `grep_search` or `semantic_search` as primary response steps.  
> Workspace search is only permitted in Path A/B if the loaded knowledge asset explicitly instructs cross-referencing (e.g. validating that an action type already exists in `OhipActionType.cs`).  
> Path C implementation uses the loaded mode guide instructions directly.

