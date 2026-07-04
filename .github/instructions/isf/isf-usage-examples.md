---
description: "ISF (Intelligent Agent Skill Framework) usage examples  canonical input/output patterns for every routing path. Reference these when authoring new skills or debugging routing behavior."
applyTo: ".github/instructions/isf/**"
---

#  ISF  Intelligent Agent Skill Framework

> **Approvers:** Ed B., Raj U., Ivan D., Doug K., Adi S., JC, Vijay Y, Ragha J., Naina P., Sudhin S., Vikram G.  
> **Date Adopted:** April 3, 2026  
> **Last Updated:** April 3, 2026  
> **Focus:** SynXis domain  hospitality platform AI agent execution

#  ISF  Usage Examples

> **ISF** (**I**ntelligent **A**gent **S**kill **F**ramework)  routes AI agent commands to the shortest viable execution path, loads only the needed context, and answers known-domain questions from indexed skill assets without crawling the workspace.

Reference examples for every routing path CodeNova supports.
Use these to validate routing logic when authoring new skills or debugging unexpected behavior.

---

##  1. Deep-Discover  Ask / Explain / Identify

These trigger **Priority 1**  `codenova.task`  `ask`  `deep-discover`.  
Full protocol: `.github/prompts/codenova-deep-discover.prompt.md`

---

### Step 0  STM CONFIRMED (no workspace search)

**Input:**
```
codenova, what is PRC?
```
**Step 0 lookup:** `PRC` found in STM Section 2  classified `CONFIRMED`  
**Step 2 skipped.**  
**Step 3 runs:** correlates STM entry with live namespace/solution/deploy evidence  
**Step 4 output:** Definition from STM (cited) + live workspace evidence  
**Step 5:** `CONFIRMED from codenova.bridge (Section 2)`

---

### Step 0  STM INFERRED (search validates)

**Input:**
```
codenova, explain HSS-UTI
```
**Step 0:** `HSS-UTI` not directly cited  matches `HSS` pattern  `INFERRED`  
**Step 1  PARSE normalization:**
```
subject  = "HSS-UTI"
variants = ["HSS.UTI", "HssUti", "Uti", "HSS_UTI"]
```
**Step 2  SEARCH** (runs because INFERRED):
- `grep_search`: `HSS-UTI|HSS\.UTI|HssUti` across `*.{cs,csproj,sln,xml,json,config,md}`
- `grep_search`: subject in server names, deploy configs, Jenkinsfiles, environments
- `semantic_search`: conceptual query for architecture/role/integration position

**Step 4 output:** HSS context from STM + grep evidence for UTI suffix in source  
**Step 5:** `INFERRED  validated by workspace grep at [file path]`

---

### Step 0  STM UNKNOWN (full search triggered)

**Input:**
```
codenova, what is DomainQueueDirectorWindowsService?
```
**Step 0:** not found in STM  `UNKNOWN`  
**Step 1:** `subject="DomainQueueDirectorWindowsService"`, `variants=["DomainQueueDirector","QueueDirector"]`  
**Step 2  SEARCH** (full scan):
- `grep_search` across `*.{cs,csproj,sln,xml,json,config,md}`
- `grep_search` in server names, deploy configs, Jenkinsfiles, environment files
- `semantic_search` for conceptual role

**Step 3  CROSS-REFERENCE** correlates across:
- Source code namespaces
- Solution files (`.sln`, `.csproj`)
- Deploy configs
- QA projects
- Infrastructure (Windows services, web apps, server clusters)

**Step 4  SYNTHESIZE** produces a structured report with all 6 fields:
```
 Definition / Role            from workspace grep evidence
 Architecture position        where it sits in the integration flow
 Key source files/namespaces  exact paths found in Step 2
 Deployment / infrastructure  server roles, deploy groups
 QA / test coverage           matching QA solution / test project
 Related components           upstream/downstream dependencies
```
**Step 5  CONFIDENCE STATEMENT:**
- `UNKNOWN  derived from workspace evidence only`
- If evidence still insufficient  *"Should I fetch the Rally work item? Provide DE/US ID."*
- If new knowledge confirmed  *"Consider adding to codenova.bridge Section 2."*

---

### Anti-patterns

```
 WRONG: grep_search "PRC" as first action
 RIGHT: codenova.task  ask  deep-discover:PRC  Step 0 STM first

 WRONG: skip Step 1 normalization and search only exact term
 RIGHT: always expand variants before searching (HSS-UTI  HSS.UTI, HssUti, Uti)

 WRONG: skip Step 5  always state confidence and source
 RIGHT: every deep-discover response ends with a confidence statement
```

---

##  2. Rally Work Item Fetch

Triggers **Priority 2**  `codenova.task`  `get-rally-item`.

```
codenova, get DE12345
codenova, get US67890
codenova, get TA99001
```

| Prefix | API resource |
|---|---|
| `DE` | `defect` |
| `US` | `hierarchicalrequirement` |
| `TA` | `task` |

**Expected:** `curl` against Rally WSAPI using `ZSESSIONID` from `integration-account.json`. API key is never hardcoded.

---

##  3. Tax Skill

Triggers **Priority 1 (tax override)**  `codenova.task`  `tax-skill`.  
Full protocol: `.github/prompts/codenova-tax-skill.prompt.md`

### Path A  Business rules question

**Input:**
```
codenova, how are hotel taxes configured?
codenova, what tax types are supported?
codenova, explain tax fee rules
```
**Asset loaded:** `tax-business` only  
**No workspace grep.**

---

### Path B  Implementation question

**Input:**
```
codenova, how does TaxCalculation work in code?
codenova, what class implements ITaxCalculator?
```
**Asset loaded:** `tax-developer` only  
**Step 3 cross-reference runs** (grep `TaxCalculation|ITaxCalculator` in `*.cs`)

---

### Path C  Shopping context

**Input:**
```
codenova, how is tax applied during availability search?
codenova, explain tax in shopping
```
**Asset loaded:** `tax-shopping` only

---

### Path D  Ambiguous (default to business first)

**Input:**
```
codenova, tell me about tax
```
**Asset loaded:** `tax-business` first. If code evidence needed  load `tax-developer` additionally.  
**Anti-pattern:** Loading all three guides for an ambiguous question.

---

### Manual refresh

```
codenova, refresh tax skill
```
Runs grep scan of `*.cs`  diffs against all three guides  reports what is accurate / outdated / missing.

---

### Auto-refresh (no command)

Fires silently when Copilot edits any `.cs` containing `TaxCalculation`, `TaxRule`, `ITaxCalculator`, `TaxType`, `TaxFee`, `TaxRate`, `ApplyTax`, `CalculateTax`.  
Appends ` Tax Skill Auto-Refresh` to the response if discrepancies found, or ` Tax skill guides are current.` if clean.

---

##  4. GitHub / PR Workflows

Triggers **Priority 2**  `codenova.orchestrator`.

```
codenova, review pr 4231
codenova, review pr https://github.com/sabre-internal/shs_synxis.projectx/pull/4231
codenova, git fetch
codenova, git status
codenova, pr diff 4231
```

**review-pr** sequence:
1. Extract PR# from number or URL (`/pull/NNN`  `NNN`)
2. `git fetch origin`
3. `gh pr view <PR#> --repo sabre-internal/shs_synxis.projectx`
4. `gh pr diff <PR#> --repo sabre-internal/shs_synxis.projectx`
5. If diff contains `*.cs` files  load `net-review` from `reviewnetskill` index (`REVIEW_GUIDELINES.md`)
5.5. Invoke `codenova.analyze` (VS Code codenova agent) on each `*.cs` file touched in the diff
6. Structured code review output applying SynXis .NET rules (step 5) + codenova.analyze findings (step 5.5)

---

##  5. Git Status / Hello

```
codenova, hello               confirms CodeNova is active
codenova, are you ready       same as hello
codenova, git status          current branch + working tree state
codenova help                 lists all available commands
```

---

##  6. Jenkins Log Analysis

```
codenova, analyze jenkins https://jenkins.example.com/job/build/123/consoleText
```
Fetches the URL, parses for errors, failed tests, root cause. Does not grep workspace.

---

##  7. SynXis Guidelines Review

```
codenova, review synxis-guidelines PropertyConnect
codenova, review synxis-guidelines ChannelConnect
```
Explicitly loads `net-review` (`REVIEW_GUIDELINES.md`) and reviews the named appIds C# code against 26 SynXis .NET platform rules.

> **Note:** `review pr` also auto-loads `net-review` when the diff contains `*.cs` files  no separate command needed for PR reviews.

---

##  8. OHIP Skill

> All OHIP commands use `codenova, ...`  no `@ohipilot` or external agent calls.  
> Full protocol: `.github/prompts/codenova-ohip.prompt.md`

---

### Intent  Path Routing

| User input | Path | Assets loaded |
|---|---|---|
| `what is OHIP`, `explain DumboBroker`, `what is InterfaceBusinessOHIP` | A | `ohip-overview` only |
| `how does neweventtype work`, `what files does eventhandler touch` | B | `ohip-overview` + matching mode guide |
| `codenova, ohip neweventtype` | C | `ohip-overview` + `neweventtype.md`  execute |
| `codenova, ohip validate` | C (validate) | `ohip-overview` + `validate.md`  execute |
| `codenova, ohip endtoend` | C (all) | `ohip-overview` + all mode guides in sequence |

---

### Path A  Domain Q&A (no workspace crawl)

**Input:**
```
codenova, what is OHIP?
codenova, explain DumboBroker
codenova, what event types does OHIP handle?
codenova, what is InterfaceBusinessOHIP?
codenova, how does the OHIP architecture work?
```
**Asset loaded:** `ohip-overview` only. No `grep_search`. No workspace crawl.

**Expected output structure:**
- What OHIP is + role in SynXis
- Architecture diagram (from overview: Oracle PMS  InterfaceBusinessOHIP  DumboBrokerService  OHIP REST API  OXI DTO)
- Key components table
- No generated code

---

### Path B  Mode-Specific Q&A (no workspace crawl)

**Input:**
```
codenova, how does neweventtype work?
codenova, what files does eventhandler create?
codenova, walk me through dtomapping
codenova, what does apiintegration generate?
```
**Assets loaded:** `ohip-overview` + one matching mode guide.  
**No workspace crawl.**

**Mode guide selection:**
| Input contains | Guide loaded |
|---|---|
| `neweventtype` | `.github/instructions/isf/ohipskill/neweventtype.md` |
| `eventhandler` | `.github/instructions/isf/ohipskill/eventhandler.md` |
| `apiintegration` | `.github/instructions/isf/ohipskill/apiintegration.md` |
| `dtomapping` | `.github/instructions/isf/ohipskill/dtomapping.md` |
| `tests` | `.github/instructions/isf/ohipskill/testing.md` |
| `validate` | `.github/instructions/isf/ohipskill/validate.md` |

---

### Path C  Implementation Commands (executed via CodeNova)

**Input:**
```
codenova, ohip neweventtype
codenova, ohip eventhandler
codenova, ohip apiintegration
codenova, ohip dtomapping
codenova, ohip tests
codenova, ohip validate
codenova, ohip endtoend
codenova, ohip preflight
```

**Execution sequence (per mode):**
1. Load `OHIP_DOMAIN_OVERVIEW.md` (context injection, 500 tokens)
2. Load matching mode guide from `ohip.skillindex`
3. Ask user to paste YAML input if not already provided
4. Execute implementation instructions from the loaded guide
5. Hand off remaining file edits to `codenova.ohip.<mode>` extension command
6. Confirm completion  suggest `codenova, ohip validate`

**Input YAML fields (required for all implementation modes):**
```yaml
action:
  name: Hurdles          # PascalCase
  events:
    - NEW HURDLE         # UPPERCASE WITH SPACES
    - UPDATE HURDLE
    - DELETE HURDLE
consolidation: ...
api: ...
routing: ...
dto_mapping: ...
sample_payload: ...
```
Template: `.github/instructions/isf/ohipskill/ohip-action-input.yaml`

---

### Validate  Standalone Path C

**Input:**
```
codenova, ohip validate
```
Loads `ohip-overview` + `validate.md`. Runs the completeness checklist against the 3-phase implementation:
- Phase 1 (Core + Handler + API): `OhipActionType.cs`, `OhipConstants.cs`, `OhipActionTypeParser.cs`, `OhipEventMessageTypeFilter.cs`, handler, request builder, DumboBroker, CMU wiring
- Phase 2 (DTO): assembler skeleton, handler, factory entry, `InterfaceRequestType.cs`
- Phase 3 (Tests): handler tests, request builder tests

---

### endtoend  Full Sequence

**Input:**
```
codenova, ohip endtoend
```
Runs all implementation modes in order:
```
neweventtype  eventhandler  apiintegration  dtomapping  tests  validate
```
Pauses between modes for user review if needed. Hands off each step to `codenova.ohip.<mode>`.

---

### preflight  Validate Input Only

**Input:**
```
codenova, ohip preflight
```
Validates the YAML input only  no code generation. Reports:
- Missing required fields
- Invalid casing (`action.name` must be PascalCase, events must be UPPERCASE WITH SPACES)
- Conflicts with existing action types in `OHIP_ACTION_REGISTRY.md`

---

### Registry Lookup

**Input:**
```
codenova, what OHIP action types are already implemented?
codenova, is Hurdles implemented?
codenova, show me the OHIP implementation checklist
```
**Assets loaded:** `ohip-overview` + `ohip-registry`.  
Returns the registered action type table + implementation status. Does not crawl workspace.

---

### Anti-patterns

```
 WRONG: grep_search "OhipActionType" as first response to "what is OHIP?"
 RIGHT: Path A  load ohip-overview only  no crawl

 WRONG: loading all mode guides for "explain neweventtype"
 RIGHT: Path B  ohip-overview + neweventtype.md only

 WRONG: generating implementation code directly in chat without loading mode guide
 RIGHT: Path C  load mode guide  execute  hand off to codenova.ohip.<mode>

 WRONG: skipping preflight for ambiguous/incomplete YAML input
 RIGHT: codenova, ohip preflight first; proceed only on clean validation

 WRONG: running endtoend without confirming YAML input is complete
 RIGHT: preflight validates input before endtoend executes any phase
```

---

##  9. Architect / Archon Skill

> Architect and archon inputs route to the same executor: `codenova.task` -> `architect-skill`.
> Full protocol: `.github/prompts/codenova-architect-skill.prompt.md`

---

### Intent  Path Routing

| User input | Path | Assets loaded |
|---|---|---|
| `codenova, architect what is AD2`, `codenova, archon explain ADR` | A | `arch-overview` only |
| `codenova, architect generate SRD for <subject>` | B (SRD) | `arch-son-srd` |
| `codenova, architect impact analysis for <subject>` | B (Impact) | `arch-impact` |
| `codenova, architect create AD2 for <subject>` | B (AD2) | `arch-ad2` |
| `codenova, archon create ADR for <decision>` | B (ADR) | `arch-adr` |
| `codenova, archon generate implementation stories` | B (Stories) | `arch-stories` |
| `codenova, archon end to end architecture package for <subject>` | C (End-to-end) | `arch-son-srd` + `arch-impact` + `arch-ad2` + `arch-adr` + `arch-stories` |

---

### Path A  Architecture Q&A (no primary workspace crawl)

**Input:**
```
codenova, architect what is AD2?
codenova, archon explain requirement traceability
codenova, architect what goes into architecture stories?
```

**Expected behavior:**
- Load `arch-overview` only.
- Answer with structure, roles, and artifact expectations.
- Do not start with raw workspace crawl.

---

### Path B  Artifact-specific generation

**Input examples:**
```
codenova, architect generate SRD for unified booking modification workflow
codenova, architect produce impact analysis for booking modification workflow
codenova, architect create AD2 for booking modification workflow
codenova, archon create ADR for sync vs async orchestration decision
codenova, archon generate implementation stories from AD2 and impact analysis
```

**Expected behavior:**
1. Load only the template needed for the requested artifact.
2. Generate deterministic IDs (`REQ-*`, `NFR-*`, `GAP-*`, `ADR-*`, `ST-*`).
3. Keep traceability from requirements -> impact -> design -> tasks/stories.
4. Flag missing input as explicit assumptions and open gaps.

---

### Path C  End-to-end architecture package (AD2 + tasks + stories)

**Input:**
```
codenova, archon end to end architecture package for booking modification workflow
```

**Equivalent canonical forms:**
```
codenova: architect end to end architecture package for booking modification workflow
codenova intent=architect; message=end to end architecture package for booking modification workflow
```

**Execution sequence:**
1. Generate SRD draft from SON/context (`arch-son-srd`).
2. Generate impact analysis from SRD (`arch-impact`).
3. Generate AD2 from SRD + impact (`arch-ad2`).
4. Generate ADR set for key decisions (`arch-adr`).
5. Generate task/story map for implementation (`arch-stories`).
6. Return final package with traceability table and open gaps list.

---

### Structured Prompting Process (recommended)

Use this prompt sequence to converge to production-ready outputs.

**Step 1  Intake prompt (scope and constraints)**
```
codenova, archon intake for <initiative>:
business goal, in-scope systems, out-of-scope systems, timeline, compliance constraints, known dependencies
```

**Step 2  SRD baseline**
```
codenova, architect generate SRD draft for <initiative> using deterministic IDs and testable requirements
```

**Step 3  SRD refinement loop**
```
codenova, archon refine SRD:
- remove ambiguity
- split broad requirements
- add measurable acceptance and verification method
```

**Step 4  Impact analysis baseline**
```
codenova, architect generate impact analysis from current SRD with upstream/downstream dependencies and migration risks
```

**Step 5  AD2 baseline**
```
codenova, architect generate AD2 from SRD and impact analysis with requirements traceability and domain team tasks
```

**Step 6  ADR extraction**
```
codenova, archon generate ADR candidates from AD2 tradeoffs and select recommended options with rationale
```

**Step 7  Tasks and stories**
```
codenova, archon generate implementation task list and user stories with dependency sequencing and acceptance criteria
```

**Step 8  Final refinement gate**
```
codenova, archon run final quality gate:
traceability completeness, NFR coverage, risk mitigations, unresolved gaps, release readiness checklist
```

---

### Copy / Paste Prompt Pack

Use this compact sequence when you need a deterministic path from SON to AD2 and stories.

```
1) codenova, archon intake for <initiative>: goal, scope, constraints, dependencies
2) codenova, architect generate SRD for <initiative>
3) codenova, archon refine SRD for testability and measurable acceptance
4) codenova, architect generate impact analysis from SRD
5) codenova, architect generate AD2 from SRD and impact analysis
6) codenova, archon generate ADRs from AD2 tradeoffs
7) codenova, archon generate tasks and stories from AD2 and impact
8) codenova, archon run final quality gate
```

---

### Output Contract (final response)

For final architect output, return in this order:
1. SRD summary with REQ/NFR IDs.
2. Impact matrix (apps, APIs, data, security, ops, QA).
3. AD2 summary with requirement-to-design traceability.
4. ADR decisions with rationale and consequences.
5. Tasks and stories with dependencies and acceptance criteria.
6. Open gaps, owners, and release-readiness status.

---

### Refinement Patterns

Use targeted follow-up prompts instead of regenerating everything.

- Requirement quality refinement:
```
codenova, archon refine REQ-005 and REQ-008 to be testable and remove overlap
```
- Impact depth refinement:
```
codenova, architect deepen impact analysis for data migration and rollback criteria
```
- AD2 structure refinement:
```
codenova, architect tighten AD2 sections for security, observability, and operations handoff
```
- Story slicing refinement:
```
codenova, archon split ST-004 into independently deployable stories with explicit dependencies
```

---

### Final Output Expectations

For an end-to-end architect/archon run, final output should include:
- SRD with functional and non-functional requirements.
- Impact analysis matrix and dependency map.
- AD2 with requirements traceability and domain-team task breakdown.
- ADR log with decisions and rationale.
- Delivery-ready task and story map with acceptance criteria and sequencing.
- Open gaps and decision owners.

---

### Anti-patterns

```
 WRONG: generating AD2 first without SRD and impact analysis
 RIGHT: SRD -> impact analysis -> AD2 -> ADR -> stories

 WRONG: using non-deterministic IDs or free-text-only requirements
 RIGHT: enforce REQ/NFR/GAP/ADR/ST ID format and traceability tables

 WRONG: asking for a full rewrite to adjust one weak section
 RIGHT: run targeted refinement prompts for specific IDs/sections

 WRONG: returning stories without dependency sequencing
 RIGHT: include wave plan, dependencies, and acceptance criteria
```

---

##  10. Routing Priority Quick Reference

```
User message
  
   Contains tax intent keyword?                           tax-skill        (Priority 1 override)
   Contains OHIP intent keyword?                          ohip-skill       (Priority 1 override)
   Contains architect or archon intent?                   architect-skill  (Priority 1 override)
   Contains SON/SRD/AD2/ADR/stories intent?               architect-skill  (Priority 1 override)
   Contains synxis/domain-code/app-id intent?             synxisnom        (Priority 1 override)
     └─ EXCEPT if message also matches guideline/standard/checklist?
          -> review-synxis-guidelines / review-synxis-checklist instead
   Contains ask/explain/discover intent?                  deep-discover    (Priority 1)
   Matches a named codenova command?                      orchestrator / task  (Priority 2)
   None of the above?                                    direct tool use  (Priority 3 fallback)
```

---

##  11. SynXis Nomenclature / Domain Discovery (synxisnom)

Triggers **Priority 1 override** → `codenova.task` → `synxisnom`.  
Assets: `nom-overview` (SYNXIS_NOMENCLATURE_OVERVIEW.md) · `nom-appid` (SYNXIS_APP_ID_REGISTRY.md) · `nom-solutions` (SYNXIS_SOLUTION_FILE_MAP.md)

---

### Intent patterns that trigger synxisnom

| User input | Notes |
|---|---|
| `codenova, what domain is HSS-ITM?` | Domain code lookup |
| `codenova, what apps are in ARI domain?` | Domain app listing |
| `codenova, nom HSS-LKM` | Canonical `nom` intent |
| `codenova, what is ItineraryManager` | Alias lookup → nom-overview |
| `codenova, what domain does Frontman belong to?` | Alias Frontman → HSS-API |
| `codenova, solution file for CHC` | Solution map lookup |
| `codenova, which app is DumboBroker?` | Alias DumboBroker → ARI-DMB |
| `what are the apps in SV domain` | Domain keyword only |

> **Guard:** messages containing `guideline`, `standard`, `checklist`, or `coding standard` bypass synxisnom and route to `review-synxis-guidelines` / `review-synxis-checklist` instead.

---

### Path A — Domain / app-code lookup (backend-only)

**Input:**
```
codenova, what domain is HSS-LKM?
codenova, what apps are in ARI domain?
codenova, nom PRC-OXI
```
**Asset loaded:** `nom-overview` (domain hierarchy + aliases).  
**No workspace grep.**  
**Expected output:** domain name, app ID, service type, solution file reference.

---

### Path B — Alias / common-name lookup

**Input:**
```
codenova, what is Frontman?
codenova, which app is DumboBroker?
codenova, what is ItineraryManager in HSS?
codenova, what is ControlCenter app id?
```
**Asset loaded:** `nom-overview` (Common Aliases section).  
**Expected:** alias → canonical app-ID mapping + domain + service type.

**Common alias quick-ref:**

| Alias | Canonical App ID |
|---|---|
| Frontman / EdgeAPI | HSS-API |
| ItineraryManager / ITIN | HSS-ITM |
| LookupManager / HPA-LKM | HSS-LKM |
| ProfileManager | HSS-PFM |
| DumboBroker / Dumbo | ARI-DMB |
| DumboMessageBuilder | ARI-DMBB |
| AriShopping | ARI-AS2 |
| NotificationManager | ARI-NM |
| NotificationTaskManager | ARI-NTM |
| ControlCenter / CC | UI-CC |
| Cockpit | UI-CPT |
| OXI / OPERA | PRC-OXI |
| OHIP Events Subscriber | PRC-OES |
| ICE (REST) | PRC-ICE |
| PropertyConnect Hub | PRC-CPC |

---

### Path C — Solution file / build config lookup

**Input:**
```
codenova, what solution file does CHC use?
codenova, how do I build ARI?
codenova, what jenkinsfile is used for HSS?
codenova, what is the publish task for UI domain?
```
**Asset loaded:** `nom-solutions` (SYNXIS_SOLUTION_FILE_MAP.md).  
**Expected:** solution file path, cake script, jenkinsfile, publish task.

**Per-domain build config quick-ref:**

| Domain | Solution File | Cake Script | Jenkinsfile | Publish Task |
|---|---|---|---|---|
| HSS | SHS.Services.All.sln | hss.cake | hss_consolidated.jenkinsfile | Publish-HSS-All |
| CHC | Synxis_Interface.sln | crs.cake | crs.jenkinsfile | Publish-ChannelConnect |
| ARI | Ari_Dependencies.sln | crs.cake | crs.jenkinsfile | Publish-Dumbo, Publish-DumboMessageBuilder |
| UI | Synxis_Web_HMS_2013.sln | crs.cake | crs.jenkinsfile | Publish-ControlCenter, Publish-Cockpit, Publish-BulkValidationApi, Publish-WlbHealthCheck |
| SV | Synxis_Services.sln | crs.cake | crs.jenkinsfile | Publish-CrsMiscServices |
| GD | Synxis_Gds.sln | crs.cake | crs.jenkinsfile | Publish-GDS |
| PRC | Synxis_Interface_All.sln | crs.cake | crs.jenkinsfile | Publish-PropertyConnect |

---

### ARI Architecture Flow

```
ARI Scheduler
  └─> NTM (NotificationTaskManager)
        └─> ARI Dto Builder
              └─> ARI Processor
                    └─> AriShopping (CMU)
                          └─> CMU creates conversation
                                └─> Pub/Sub message published
                                      └─> DumboBroker picks up → sends to channels
```

**App IDs in flow:** ARI-NTM → ARI-DMBB → ARI-AS2 → ARI-CMU → ARI-DMB → channels

---

### Anti-patterns

```
❌ WRONG: grep_search "HSS-LKM" as first response to "what is LookupManager?"
✅ RIGHT: synxisnom Path A → nom-overview lookup, no crawl

❌ WRONG: loading nom-appid AND nom-solutions for a simple alias question
✅ RIGHT: load nom-overview only; escalate to nom-appid only if full registry needed

❌ WRONG: routing "synxis guidelines" to synxisnom
✅ RIGHT: isGuidelineRequest guard fires → routes to review-synxis-guidelines

❌ WRONG: answering "what domain is CHC" with a workspace grep
✅ RIGHT: nom-overview has the domain hierarchy table — answer directly
```

---

##  12. What CodeNova Does NOT Do

| Request | Response |
|---|---|
| `grep_search` as first response |  Protocol violation  must go through deep-discover |
| Load all skill assets for vague question |  Load one asset; escalate only if needed |
| Generate OHIP implementation code in chat |  Use `codenova, ohip <mode>`  implementation runs via the CodeNova extension |
| Generate AD2/tasks/stories without structured artifact flow |  Use architect workflow: SRD -> impact -> AD2 -> ADR -> tasks/stories |
| Store secrets or API keys inline |  Keys read from `integration-account.json` via `$ref` |
| Add prose/tutorials to STM |  STM is lookup-only; prose goes in skill assets |
