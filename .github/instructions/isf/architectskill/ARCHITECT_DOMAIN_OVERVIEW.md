# Architect Skill Overview

## Purpose

Convert a Statement of Need (SON) into architecture-ready and delivery-ready artifacts following the Archon workflow: **Requirements → Design → Tasks**.

**Primary orchestrator:** See [archon/SKILL.md](archon/SKILL.md) for the full workflow, questioning protocol, and command reference.

**Templates:** All feature templates are in [archon/assets/templates/](archon/assets/templates/)

**Invocation aliases:**
- architect
- archon

**Primary outputs:**
- Requirements (with GAPs)
- SRD (optional standalone)
- Impact Analysis (optional standalone)
- AD2 (Architecture Design Document)
- ADRs (Architecture Decision Records)
- Tasks and Stories (optional standalone)

**Default output location:**
- Requirements: `/FEAXXXXX-<Name>/DesignDocs/Requirements/`
- AD2 artifacts: `/FEAXXXXX-<Name>/DesignDocs/AD2/`
- ADRs: `/FEAXXXXX-<Name>/DesignDocs/ADR/`

---

## Workflow Phases

| Phase | Command | Output |
|---|---|---|
| **Initialize** | `/archon initialize FEAXXXXX-<Name>` | Feature folder structure |
| **Deconstruct** | `/archon deconstruct FEAXXXXX-<Name>` | Requirements_FEAXXXXX.md + Requirement_GAPS.md |
| **Design** | `/archon design FEAXXXXX-<Name>` | AD2_FEAXXXX_FULL.md |
| **Split** | `/archon split FEAXXXXX-<Name>` | AD2 split into Index, Overview, DataFlows, Security, Database, QA, Estimates, + DomainTeam_*.md files |
| **ADR** | Create ADR for decision | ADR_FEAXXX_<Topic>.md (with auto-cascade to AD2) |
| **Fill Stubs** | `/archon fill-code-placeholders FEAXXXXX-<Name>` | Populate pseudocode and Code References |

See `archon/SKILL.md` for detailed command specifications, question flows, and checkpoint protocols.

---

## Input Expectations

**Minimum required:**
- SON or problem statement (in `/FEAXXXXX-<Name>/Context/SON_FEAXXXXX.md`)
- Business objective
- In-scope domains/systems

**Optional context files:**
- `SRD_FEAXXXXX.md` — requirements refinement
- `DATABASE_SCHEMA.md` — current schema snapshot
- `REPO_SOURCES.md` — workspace repo paths
- `EXTERNAL_*_API.md` — third-party API documentation

All context files live in `/FEAXXXXX-<Name>/Context/` and are **human-entered only** — Archon reads them but does not overwrite them.

---

## Asset Selection Guide

When the user requests architecture artifacts without explicit feature context, use these focused templates:

| User Request Pattern | Asset to Load | Path |
|---|---|---|
| SON or SRD conversion (no feature ID) | SON to SRD Template | `SON_TO_SRD_TEMPLATE.md` |
| Impact or blast radius (no feature ID) | Impact Analysis Template | `IMPACT_ANALYSIS_TEMPLATE.md` |
| Story generation (no feature ID) | Story Breakdown Template | `STORY_BREAKDOWN_TEMPLATE.md` |

For feature-specific design work (with feature ID), always load [archon/SKILL.md](archon/SKILL.md) and follow the Archon workflow commands.

---

## Output Quality Rules

1. Use deterministic IDs: REQ-XXX, NFR-XXX, GAP-XXX, ADR-XXX, ST-XXX
2. Keep requirements testable and measurable
3. Include functional and non-functional sections
4. Explicitly identify impacted applications, interfaces, data, security, operations, and QA
5. Include traceability table from requirement IDs to AD2 design sections
6. Include open gaps and decision log pointers
7. Never use anonymous `TODO` — use `[GAP-XXX: OPEN]` markers instead
8. For ADRs: always apply the implicit cascade rule (update AD2_FULL and affected domain team files)

---

## Question-First Flow

Before generating any markdown artifact, Archon **must**:
1. Ask clarifying questions **one at a time** using `ask_user`
2. Provide recommended choices where predictable
3. Always include "Unknown / Gap" option
4. Present phase checkpoint summary after final question in each phase
5. Wait for approval before generating markdown files

See `archon/SKILL.md` § "Questioning Convention" for full rules.

---

## Do and Do Not

**Do:**
- Start from templates and tailor to project specifics
- Explicitly call out NFR coverage: security, reliability, performance, observability, compliance
- Keep cross-team ownership clear
- Apply the ADR cascade rule whenever an ADR is modified

**Do not:**
- Assume implementation details not present in evidence
- Skip impact analysis before story generation
- Collapse ADR rationale into one-line decisions
- Overwrite human-authored context files in `/Context/`
- Renumber task IDs after developer handoff
