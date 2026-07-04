# Archon — Copilot Instructions (DEPRECATED)

> **⚠️ This file is deprecated.**  
> All content has been merged into `.github/instructions/isf/architectskill/archon/SKILL.md`.  
> Use that file as the single authoritative source for Archon workflow, questioning protocol, and command reference.
>
> This stub remains for compatibility only and will be removed in a future cleanup pass.

---

## Clarifying Questions for Design Prompts

Whenever a design-related prompt is made — including `/archon Design`, `/archon Deconstruct`, creating or updating any `AD2_` document, or any prompt asking about architecture, system design, or technical approach — **always ask clarifying questions before generating content**.

### Rules

- **Use the `ask_user` tool for every clarifying question.** Never list questions as plain text in your response.
- Ask **one question at a time**. Do not bundle multiple questions into a single `ask_user` call.
- **Always provide `choices`** when the answer can be predicted (most common answers, options, or values). The CLI automatically adds a freeform input option — do **not** add "Other", "Custom", or "Something else" as a choice yourself.
- Use **freeform-only** (no choices) only when the answer genuinely cannot be predicted (e.g., a feature name, a free-text description, a deadline).
- If you recommend a specific option, make it the **first choice** and append `(Recommended)` to its label.
- Always include `"Unknown / Gap"` as a choice when the architect may not yet have the answer — treat any such response as a signal to create a GAP entry rather than block or guess.
- After each answer, immediately ask the next question before proceeding to generation.
- **Exception for design phases:** After the final question in a design phase, you **must** present a structured checkpoint summary and request confirmation (via `ask_user`) before proceeding to the next phase. Do not skip or compress checkpoints. See the Design phase in the Archon skill for the required checkpoint format.

### Example — well-formed question

```
ask_user(
  question: "Is there a DB schema change required for this feature?",
  choices: ["Yes — new tables needed", "Yes — modifying existing tables", "No — works with existing schema (Recommended)", "Unknown / Gap"]
)
```

### Example — poorly formed (do NOT do this)

```
Please answer the following:
1. Is there a DB change?
2. Which teams are involved?
3. What are the deadlines?
```

---

## Slash Commands

| Command | What it does |
|---|---|
| `/archon initialize FEAXXXXX-<Name>` | Scaffolds the full folder structure for a new feature |
| `/archon Deconstruct the requirements for FEAXXXXX-<Name>` | Asks clarifying questions, then generates `Requirements_FEAXXXXX.md` (with a GAPS section for unknowns) |
| `/archon Design FEAXXXXX-<Name>` | Asks clarifying questions, then generates `AD2_FEAXXXX.md` design doc |
| `/archon Split up FEAXXXXX-<Name> into AD2 Subsections` | Splits a large `AD2_FEAXXXX.md` into per-domain-team files |

After `/archon Deconstruct` generates a GAPS section, the architect fills those gaps manually before running `/archon Design`.

---

## Feature Folder Structure

```
/FEAXXXXX-<Name>/
  /.github/
  /DesignDocs/
    /Requirements/
      Requirements_FEAXXXXX.md
      Requirement_GAPS.md
    /ADR/
      ADR_FEAXXX_<Topic>.md
    AD2_FEAXXXX.md              ← single doc, OR split into files below
    AD2_FEAXXXX_Index.md
    AD2_FEAXXXX_Overview.md
    AD2_FEAXXXX_PaymentFlows.md
    AD2_FEAXXXX_Security.md
    AD2_FEAXXXX_Database.md
    AD2_FEAXXXX_Estimates.md
    AD2_FEAXXXX_QA.md
    AD2_FEAXXXX_DomainTeam_HSS.md
    AD2_FEAXXXX_DomainTeam_ControlCenter.md
    AD2_FEAXXXX_DomainTeam_SynxisBookingEngine.md
    AD2_FEAXXXX_DomainTeam_SynxisVoiceAgent.md
    AD2_FEAXXXX_DomainTeam_IntegrationPropertyConnect.md
    AD2_FEAXXXX_DomainTeam_JavaPaymentService.md
    AD2_FEAXXXX_DomainTeam_JavaSecurityService.md
    AD2_FEAXXXX_DomainTeam_Reporting.md
  /Demo/
  /Context/                     ← human-authored reference files only
    DATABASE_SCHEMA.md
    REPO_SOURCES.md
    SON_FEAXXXXX.md
    SRD_FEAXXXXX.md
    EXTERNAL_<API_NAME>_API.md
```

Templates for all `AD2_FEAXXXX_*.md` files live at `.github/instructions/isf/architectskill/archon/assets/templates/`.

---

## Document Content Conventions

**`AD2_FEAXXXX_DomainTeam_XXX.md`** — per-team implementation guide:
- Overview
- Reference links to external sources (e.g., Stripe Checkout Documentation)
- Tech Tasks (e.g., "Create a v2/payments/stripe/checkout API")
- Code References (e.g., "Refer to PaymentsController.cs")

**`AD2_FEAXXXX_Database.md`** — schema changes:
- Overview
- DB Schema Additions or Changes with SQL Scripts

**`AD2_FEAXXXX_Estimates.md`** — sizing:
- Estimates in hours per domain team (table format)
- Summarized task list per domain team

---

## Context Files (`/Context/`)

These are **human-entered only** — do not auto-generate or overwrite them. They are the source of truth for Copilot to read from when deconstructing requirements or producing designs:
- `SON_FEAXXXXX.md` / `SRD_FEAXXXXX.md` — requirements source documents
- `EXTERNAL_*_API.md` — third-party API documentation
- `DATABASE_SCHEMA.md` / `REPO_SOURCES.md` — filled in by a separate Copilot/Codenova extension session that inspects source repos

---

## Naming Conventions

- Feature IDs: `FEAXXXXX` (uppercase, zero-padded, e.g., `FEA00123`)
- Design doc prefix: `AD2_` followed by the feature ID
- ADR prefix: `ADR_` followed by feature ID and topic slug
- Domain team files use `_DomainTeam_<TeamName>` suffix

---

## Developer Handoff

Once design docs are complete, developers consume them directly via Copilot:
```
"Complete Task 1.1 in AD2_FEAXXXX_DomainTeam_JavaPaymentService"
```
Task numbering within domain team docs must be stable — do not renumber after handoff.
