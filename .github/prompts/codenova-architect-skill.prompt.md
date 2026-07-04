---
description: "Architect skill dispatch protocol for SON to SRD to impact analysis to AD2 to stories."
agent: "agent"
---

# Architect Skill Dispatch Protocol

## Progressive-Disclosure Dispatch Sequence

```
codenova.task.run("architect-skill", subject)
  |- Step 1: Load manifest
  |    -> .github/instructions/pd/skills/architect/manifest.md
  |
  |- Step 2: Load trigger map
  |    -> .github/instructions/pd/skills/architect/triggers.md
  |
  |- Step 3: Apply conditional loading rules
  |    -> .github/instructions/pd/skills/architect/loading-rules.md
  |    -> Select one target artifact first (SON/SRD, ADR, AD2, impact, stories)
  |
  |- Step 4: Apply nested-load rules only when needed
  |    -> .github/instructions/pd/skills/architect/nested-loads.md
  |
  |- Step 5: Load Archon orchestrator for question-first generation
  |    -> .github/instructions/isf/architectskill/archon/SKILL.md
  |
  `- Step 6: Format output using template
       -> .github/instructions/pd/skills/architect/response-templates.md
```

## Canonical Intent Source

Intent alias normalization is centralized in `.github/instructions/codenova.instructions.md`.
This prompt is execution-only after the route resolves to `architect-skill`.

## Upstream Evidence Intake

If `architect-skill` is the destination skill in a compound workflow, accept compact evidence packets from supporting skills first.

Common upstream packets:

- `tax-skill` -> rules, constraints, calculation edge cases, affected flows
- `ohip-skill` -> impacted action types, modes, file touchpoints, recommended implementation changes
- `synxisnom-skill` -> naming and solution-path constraints

Use upstream packets as design input for deconstruct, design, split, ADR, or story generation.
Do not reload the supporting skill's full guide set unless confidence is low or a cited constraint is incomplete.

## Phase Detection Rules

Detect phase from user message patterns:

| User Message Pattern | Detected Phase | Primary Template |
|---|---|---|
| `initialize FEAXXXXX-<Name>` | initialize | (no template — scaffolds folders only) |
| `deconstruct FEAXXXXX` or `requirements for FEAXXXXX` | deconstruct | (Archon SKILL.md workflow, generates Requirements_FEAXXXXX.md) |
| `design FEAXXXXX` or `create AD2 for FEAXXXXX` | design | AD2_FEAXXXX_FULL.md |
| `split FEAXXXXX` or `split AD2 into subsections` | split | (Archon SKILL.md workflow, uses split templates) |
| `create ADR for FEAXXXXX` or `decision for FEAXXXXX` | adr | ADR_FEAXXXX_Topic.md |
| `break down FEAXXXXX into stories` | stories | STORY_BREAKDOWN_TEMPLATE.md |
| `convert SON to SRD` (no feature ID) | son/srd | SON_TO_SRD_TEMPLATE.md |
| `impact analysis` (no feature ID) | impact | IMPACT_ANALYSIS_TEMPLATE.md |

If phase is ambiguous, ask the user to clarify: "What phase: initialize, deconstruct, design, split, adr, or stories?"

If phase is clear and upstream packets exist, proceed with architect questioning using those packets as pre-answered context.

## Question-First Flow (Mandatory)

Before generating any markdown artifact:

1. **Load archon/SKILL.md** — this is the canonical source for the question protocol.
2. **Ask clarifying questions one at a time** — never list all questions in bulk.
3. **Provide recommended choices** where predictable, always include "Unknown / Gap" option.
4. **Present phase checkpoint summary** after final question in each phase.
5. **Wait for approval** before generating markdown files.
6. **Do not skip questions** — if context is missing, ask; do not guess or assume.

See `.github/instructions/isf/architectskill/archon/SKILL.md` § "Questioning Convention" for full rules.

## No-Crawl-First Rule

Do not start with raw workspace crawl when request is architecture artifact generation.
Use templates first and request missing inputs only when required fields are not available.

## Output Location Rules

**Default output paths (feature context):**
- Requirements: `/FEAXXXXX-<Name>/DesignDocs/Requirements/Requirements_FEAXXXXX.md`
- AD2 artifacts: `/FEAXXXXX-<Name>/DesignDocs/AD2/AD2_FEAXXXX_*.md`
- ADRs: `/FEAXXXXX-<Name>/DesignDocs/ADR/ADR_FEAXXX_<Topic>.md`

**User-selected override:**
- If user specifies a custom output folder, write there instead of DesignDocs/AD2.
- Always confirm the output location before writing files.

**Re-run and overwrite behavior:**
- If a file already exists, ask whether to overwrite, merge, or skip.
- For `AD2_FEAXXXX_FULL.md` re-runs: warn if manual edits may be lost; suggest reviewing current content first.
- For split files: preserve manual edits in domain team task pseudocode unless explicitly instructed to regenerate.

## Output Quality Rules

1. Keep requirements testable and measurable.
2. Use deterministic IDs (REQ-XXX, NFR-XXX, GAP-XXX, ADR-XXX, ST-XXX).
3. Include functional and non-functional sections.
4. Explicitly identify impacted applications, interfaces, data, security, operations, and QA.
5. Include traceability table from requirement IDs to AD2 design sections.
6. Include open gaps and decision log pointers.
7. For ADRs: always apply the implicit cascade rule (update AD2_FULL and affected domain team files).

