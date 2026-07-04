---
description: "ISF (Intelligent Skill Framework) governance  STM file discipline, skill index rules, token efficiency guidelines. Apply when authoring or reviewing any ISF file."
applyTo: ".github/instructions/isf/**"
---

#  ISF  Intelligent Agent Skill Framework

> **Approvers:** Ed B., Raj U., Ivan D., Doug K., Adi S., JC, Vijay Y, Ragha J., Naina P., Sudhin S., Vikram G.  
> **Date Adopted:** April 3, 2026  
> **Last Updated:** April 3, 2026  
> **Focus:** SynXis domain  hospitality platform AI agent execution

#  ISF  Intelligent Agent Skill Framework Governance

This file defines authoring rules for all files under `.github/instructions/isf/`.  
Violating these rules increases token costs and degrades CodeNova response quality.

**See also:** [`isf-usage-examples.md`](isf-usage-examples.md)  canonical input/output examples for every routing path.

---

##  1. STM File Discipline

The STM (`codenova.bridge`) is injected into **every chat turn** in this workspace via `applyTo: "**"`.
It is the most expensive file in the system  every byte appears in every context window.

### Rules

| Rule | Why |
|---|---|
| **Lookup keys only  no prose** | The STM is a lookup table, not a tutorial. Rows and cells, not paragraphs. |
| **No code templates or examples** | Templates belong in skill assets, loaded on demand. |
| **No step-by-step protocols** | Protocols belong in `.github/prompts/*.prompt.md`, referenced by name. |
| **No narrative explanations** | If it reads like documentation, it does not belong in the STM. |
| **Max ~200 lines total** | Beyond 200 lines the per-turn cost outweighs lookup benefit. |
| **One concept per row** | Acronym  definition  domain. Nothing else in that row. |
| **No duplication with skill assets** | If a term is fully covered in a skill guide, put only the key + pointer in STM. |

### STM-Eligible Content

 Acronym expansions (`CRS`  Central Reservation System)  
 Server name segment decoders (single-row per segment code)  
 Domain  namespace mappings (one row per domain)  
 Architecture flow summaries (25 lines max per flow)  
 Solution  source project mappings (table rows)  
 Confidence classification rules (3 rows)

### Not STM-Eligible

 Full dispatch protocols ( `.github/prompts/`)  
 Curl command examples ( instructions file or prompt)  
 Skill asset content ( `isf/<skill>/`)  
 Auto-refresh rules ( relevant `.prompt.md` file)  
 Any block longer than 10 lines on a single topic  

---

##  2. Skill Index Rules

Each skill folder **must** contain a `*.skillindex` file as the sole entry point.
CodeNova reads the index first and loads only the matched asset  never all assets at once.

### Index Format

```
  RootPath: ${workspaceRoot} -> c:\Dev\synxis\shs_synxis.projectx
  All asset paths below are relative to RootPath.
  [Description | type | intent-tag]::relative-path-from-RootPath
[Tax Calculation Business Guide | *.md | tax-business]::.github/instructions/isf/taxskill/TAX_CALCULATION_BUSINESS_GUIDE.md
```

**Path resolution order:**
1. `${workspaceRoot}`  VS Code workspace root (preferred)
2. `c:\Dev\synxis\shs_synxis.projectx`  explicit fallback if workspace root is unavailable or cannot be determined
3. `c:\Dev\synxis`  parent fallback if the project folder itself cannot be located

### Subject-to-Asset Mapping Rules

| Situation | Load |
|---|---|
| Question maps clearly to one asset | That asset only |
| Question is ambiguous between two assets | Start with the broader one; load the second only if needed |
| Question explicitly asks for full overview | All assets  this is the **last resort**, not the default |
| Code-generation request | Domain overview asset (for context)  hand off to extension command |

**Never load all assets by default for an ambiguous question.** Prefer the broader/business asset first.

---

## 3. Token Budget Targets per Skill

| Asset Type | Target Token Ceiling |
|---|---|
| Domain overview (e.g. `OHIP_DOMAIN_OVERVIEW.md`) |  500 tokens |
| Business guide |  800 tokens |
| Developer guide |  1200 tokens |
| Skill index file |  30 tokens |
| STM total (all sections) |  1500 tokens |

---

## 4. Protocol Extraction Rule

Any block in an instructions file longer than **15 lines describing a step-by-step procedure** MUST be extracted to a `.github/prompts/*.prompt.md` file.

The instructions file retains only a single trigger line:

```markdown
 Full protocol: `.github/prompts/codenova-deep-discover.prompt.md`
```

This ensures the protocol is loaded only when the relevant intent fires  not on every turn.

### Currently Extracted Protocols

| Protocol | Prompt File |
|---|---|
| deep-discover (5-step) | `.github/prompts/codenova-deep-discover.prompt.md` |
| tax-skill dispatch + auto-refresh | `.github/prompts/codenova-tax-skill.prompt.md` |

### When a New Skill Adds a Protocol

If a new skill (e.g. OHIP, PRC) introduces a multi-step dispatch protocol, create `.github/prompts/codenova-<skill>.prompt.md` and add a row to this table. Update `isf-framework.md` Section 4 and the `promptFiles` block in `.codenova-config.json`.

---

## 5. `applyTo` Scoping Rules

| File | Scope | Rationale |
|---|---|---|
| `codenova.instructions.md` | `**` | CodeNova commands fire from any file context |
| `codenova.bridge` | `**` | Step 0 lookup needed on every turn |
| `copilot-instructions.md` | `**` | Session initialization fires on every session |
| `isf-framework.md` (this file) | `.github/instructions/isf/**` | Only needed when authoring skill assets |
| Skill guide files | Not injected  loaded on demand via skill index | Must NOT have `applyTo` |
| Prompt files (`*.prompt.md`) | Not injected  loaded on trigger | Must NOT have `applyTo: "**"` |
> **`codenova.bridge` extension note:** This file has no `.instructions.md` extension after the rename to convey its "bridge" identity. Copilot still injects it via the `applyTo: "**"` frontmatter. If Step 0 BRAIN LOOKUP ever stops working, verify Copilot still discovers extension-less files in `.github/instructions/`. Mitigation: rename to `codenova.bridge.instructions.md`. See `isf-mvp-roadmap.md` Gap 5.
---

## 6. Registered Skills

| Skill | Folder | Index File | Status | Prompt File | External Dependency |
|---|---|---|---|---|---|
| Tax | `taxskill/` | `tax.skillindex` |  Active | `codenova-tax-skill.prompt.md` | None |
| OHIP | `ohipskill/` | `ohip.skillindex` |  Active | `codenova-ohip.prompt.md` | None |
| SynxisNom | `synxisnomskill/` | `synxisnom.skillindex` |  Active | None (reference-only skill) | `Synxis VS solutions` (CI/CD generated) |
| ReviewNet | `reviewnetskill/` | `reviewnet.skillindex` |  Active | None (review-on-demand skill) | `net-standards.instructions.md` (general C  standards) |
| Architect | `architectskill/` | `architect.skillindex` |  Active | `codenova-architect-skill.prompt.md` | SON or requirement sources |

Commands for OHIP: all dispatched via `codenova, ohip <mode>`. No `@ohipilot` or external agent calls.
Handoff for implementation goes to `codenova.ohip.<mode>` extension command after injecting context from indexed knowledge.

Commands for ReviewNet: dispatched via `codenova, review synxis-guidelines <appId>` or automatically loaded during `review-pr` when C  diffs are detected.

---

##  7. Reference Files

| File | Purpose |
|---|---|
| `isf-framework.md` (this file) | Authoring governance and rules |
| `isf-usage-examples.md` | Canonical input/output examples for every routing path || `isf-mvp-roadmap.md` | MVP roadmap + GitHub model alignment gaps (Gap 15) || `.github/instructions/isf-instructions-guide.md` | ISF instructions overview  GUIDE principle, 4 tiers, governance, quick self-check |
| `.github/prompts/isf-prompts-guide.md` | ISF prompts overview  CHAIN principle, anatomy, governance, quick self-check |
| `.github/prompts/codenova-deep-discover.prompt.md` | Full deep-discover 5-step protocol |
| `.github/prompts/codenova-tax-skill.prompt.md` | Tax skill dispatch + refresh protocol |
| `.github/prompts/codenova-architect-skill.prompt.md` | Architect skill dispatch for SON to SRD to impact to AD2 to stories |
| `.github/instructions/net-standards.instructions.md` | C  coding standards  scoped to `**/*.cs`, general rules; used by OHIP code generation |
| `reviewnetskill/REVIEW_GUIDELINES.md` | 26 SynXis-platform-specific .NET rules with autofix examples  loaded by `review-synxis-guidelines` |
| `reviewnetskill/PR_CHECKLIST.md` | Quick PR gate checklist  pass/fail table for rapid C  PR scans |
| `intel_ohip_skill_guide.md` | Technical intelligence doc  OHIP skill architecture, dispatch mechanics, token model, mode delivery, limitations |
| `intel_tax_skill_guide.md` | Technical intelligence doc  Tax skill architecture, dispatch mechanics, 3-layer freshness system, guide content map, limitations |
| `intel_synxisnom_skill_guide.md` | Technical intelligence doc  SynxisNom skill architecture, dispatch mechanics, asset map, token model, STM relationship, limitations |
| `intel_reviewnet_skill_guide.md` | Technical intelligence doc  ReviewNet skill architecture, dispatch mechanics, review modes (AL), token cost model, blocking gates, limitations |
| `architectskill/ARCHITECT_DOMAIN_OVERVIEW.md` | Architect skill playbook for SRD, impact analysis, AD2, ADR, and story generation |
| `.codenova-config.json` | Machine-readable config registry (skills, commands, prompt file refs) |

---

## 8. File Placement Decision Tree

```
New content to add to CodeNova knowledge?
  
   Is it a short lookup key (acronym, segment code, mapping)?
       Add a row to codenova.bridge
  
   Is it a step-by-step execution protocol (>15 lines)?
       Create .github/prompts/<name>.prompt.md
       Add a single reference line in the triggering instructions file
  
   Is it domain knowledge for a specific topic (tax, OHIP, PRC, etc.)?
       Create or update the skill guide in isf/<skill>/
       Register in the skill's *.skillindex
       Add intent triggers in codenova.instructions.md (trigger line only)
  
   Is it general CodeNova routing / command behavior?
        codenova.instructions.md (keep it to trigger rules, not full protocols)
```
