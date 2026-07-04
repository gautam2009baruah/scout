---
description: "Technical documentation for the OHIP Skill  architecture, dispatch mechanics, token model, and delivery outcomes. Reference for skill authors and contributors."
applyTo: ".github/instructions/isf/**"
---

# OHIP Skill  Technical Intelligence Document

> **Audience:** Skill contributors, CodeNova administrators, senior developers onboarding to OHIP.  
> **Scope:** How the OHIP skill is architected inside CodeNova, what each layer does, and what the skill concretely delivers when invoked.

---

## 1. What the OHIP Skill Is

The OHIP skill is a **knowledge-indexed, lazily-loaded AI execution layer** built on top of CodeNova's task executor. It replaces manual implementation of Oracle Hospitality Integration Platform (OHIP) action types in `SynXis.Application.InterfaceBusinessOHIP` and `DumboBrokerService`  turning a multi-hour, multi-file, cross-project development task into a driven, guided, validated workflow.

It is **not** a chatbot plugin. It is a structured code-assist system with indexed domain knowledge, a declared execution contract (8 implementation modes), an input schema (YAML), automatic preflight validation, a multi-phase checklist, and a handoff mechanism to the `codenova.ohip.<mode>` VS Code extension command.

---

## 2. System Architecture

```
User message (OHIP intent)
    
    
codenova.instructions.md  Intent Recognition
      Trigger keywords: ohip, DumboBroker, OhipActionType,
      oracle hospitality, InterfaceBusinessOHIP, etc.
    
    
codenova.task.run("ohip-skill", subject)
    
    
codenova-ohip.prompt.md  Dispatch Protocol (loaded on demand)
      Classifies: Path A / Path B / Path C
    
     Path A (Domain Q&A)
           
       ohip.skillindex  OHIP_DOMAIN_OVERVIEW.md
           
       Answer  no workspace crawl, 500 token load
    
     Path B (Mode Q&A)
           
       ohip.skillindex  OHIP_DOMAIN_OVERVIEW.md + <mode>.md
           
       Answer  no workspace crawl, 1000 token load
    
     Path C (Implementation)
            
        ohip.skillindex  OHIP_DOMAIN_OVERVIEW.md + <mode>.md
            
        Preflight validation (auto  reads YAML input)
            
        Mode execution (file edits, factory registrations, build commands)
            
        Handoff  codenova.ohip.<mode> (VS Code extension command)
            
        Suggest: codenova, ohip validate
```

---

## 3. File Layer Map

All OHIP skill assets live in one folder  no external dependencies.

```
.github/instructions/isf/ohipskill/
 ohip.skillindex              Index file  sole entry point for asset loading
 OHIP_DOMAIN_OVERVIEW.md      Domain context: architecture, key components, modes (~500 tokens)
 OHIP_ACTION_REGISTRY.md      Known action types + implementation status + checklist
 preflight.md                 Validation rules: YAML contracts, naming, routing completeness
 neweventtype.md              Mode guide: enums, constants, parser, event filter, factory
 eventhandler.md              Mode guide: handler class, consolidation, request builder, API model
 apiintegration.md            Mode guide: DumboBroker dispatcher + response handler + CMU wiring
 dtomapping.md                Mode guide: DTO assembler skeleton, handler, factory registration
 testing.md                   Mode guide: unit test patterns, coverage targets, factory/filter tests
 validate.md                  Mode guide: completeness checklist, build verification, code quality
 ohip-action-input.yaml       Input template: the schema contract for all implementation modes
```

**Dispatch protocol** (not in the skill folder  loaded separately):
```
.github/prompts/codenova-ohip.prompt.md   On-demand dispatch logic, path classification, no-crawl rule
```

---

## 4. Skill Index Mechanics

`ohip.skillindex` is the **only file CodeNova reads first** for any OHIP request. It never loads all assets at once.

```
# Format: [Description | type | intent-tag]::path
[OHIP Domain Overview | domain | ohip-overview]::.github/instructions/isf/ohipskill/OHIP_DOMAIN_OVERVIEW.md
[OHIP Action Registry | reference | ohip-registry]::.github/instructions/isf/ohipskill/OHIP_ACTION_REGISTRY.md
[NewEventType Mode    | implementation | ohip-neweventtype]::.github/instructions/isf/ohipskill/neweventtype.md
[EventHandler Mode    | implementation | ohip-eventhandler]::.github/instructions/isf/ohipskill/eventhandler.md
...
```

**Asset resolution rules:**
- `ohip-overview` is always loaded first  it is the minimum context for any OHIP answer
- `ohip-registry` is added only for registry-specific queries or validate mode
- Mode guides are exclusive  only the one matching the requested mode is loaded
- `ohip-input` (template YAML) is loaded only when the user has not provided input

This means a domain question costs ~500 tokens. An implementation command costs ~10001500 tokens (overview + one mode guide). Endtoend loads guides sequentially  not all at once.

---

## 5. Dispatch Paths  Technical Detail

### Path A  Domain Q&A
**Trigger:** Conceptual question about OHIP, components, or architecture  
**Assets loaded:** `OHIP_DOMAIN_OVERVIEW.md` only  
**Workspace access:** None  
**Token load:** ~500  
**Output:** Domain explanation with architecture context  no code

### Path B  Mode-Specific Q&A
**Trigger:** Question about how a specific mode works or what files it touches  
**Assets loaded:** `OHIP_DOMAIN_OVERVIEW.md` + one `<mode>.md`  
**Workspace access:** None  
**Token load:** ~1000  
**Output:** Mode-specific technical explanation  no code

### Path C  Implementation
**Trigger:** `codenova, ohip <mode>` command  
**Assets loaded:** `OHIP_DOMAIN_OVERVIEW.md` + matching `<mode>.md`  
**Workspace access:** Targeted  only what the mode guide explicitly instructs (e.g. read `OhipActionType.cs` to find enum insertion point)  
**Token load:** ~10001500  
**Output:** Code generation, file edits, build command, handoff to `codenova.ohip.<mode>`

### No-Crawl Guarantee
`grep_search` and `semantic_search` are **never called** as primary response steps. The knowledge assets replace workspace discovery. Workspace access is permitted only when a mode guide explicitly instructs a targeted file read (e.g., to locate the correct insertion point in an existing enum).

---

## 6. Implementation Modes  What Each Delivers

### `neweventtype`
**Phase:** 1  Core  
**Files created/modified:**
- `OhipActionType.cs`  new enum value
- `OhipConstants.cs`  action constant + event name constant(s)
- `OhipActionTypeParser.cs`  parser mapping (event name  action type)
- `OhipEventMessageTypeFilter.cs`  event type filter mapping
- `OhipEventFetcherFactory.cs`  registers the action type as supported

**Mandatory test updates** (often missed manually):
- `OhipEventFetcherTests.cs`  `TestCase` attribute added
- `OhipEventMessageTypeFilterTests.cs`  test section added

**Build target:** `InterfaceBusinessOHIP.csproj`

---

### `eventhandler`
**Phase:** 1  Handler  
**Files created/modified:**
- `BusinessEventHandlerFactory.cs`  factory registration
- `BusinessEvents/EventHandlers/{ActionName}EventHandler.cs`  new handler class
- `IOhipRequestBuilder.cs`  method signature added
- `OhipRequestBuilder.cs`  method implementation
- `InterfaceBusiness.Ohip.ApiModels/{RequestModel}.cs`  new API request model

**Key logic generated:** Consolidation strategy (MostRecent / Earliest / Custom) and processing pipeline (build request  send to CMU  resolve response)

**Build target:** `InterfaceBusinessOHIP.csproj`

---

### `apiintegration`
**Phase:** 1  DumboBroker  
**Files created/modified:**
- `DumboBrokerService/Broker/Ohip{ActionName}RequestDispatcher.cs`
- `DumboBrokerService/ResponseHandlers/Ohip/Ohip{ActionName}ResponseHandler.cs`
- `CommunicationUtilityWebSvcHost/MessageBrokerConfiguration.cs`  dispatcher + response handler wired (CMU)
- `DumboBrokerService/Bootstrapper.Outbound.RequestDispatchers.cs`  dispatcher registered
- `DumboBrokerService/Bootstrapper.Outbound.ResponseHandlers.cs`  response handler registered

**When to use:** Only when the action type requires calling an OHIP REST API endpoint. Skip if the action type processes events without outbound API calls.

**Build targets:** `CommunicationUtilityWebSvcHost.csproj` + `DumboBrokerService.csproj`

---

### `dtomapping`
**Phase:** 2  DTO  
**Files created:**
- `{AssemblerClassName}.cs`  assembler skeleton with `NotImplementedException` (field mapping is manual  by design)
- `{HandlerClassName}.cs`  fully implemented handler (infrastructure, Pub/Sub publishing)
- `OhipDtoRequestHandlerFactory.cs`  handler registration
- `InterfaceRequestType.cs`  new enum entry (required for routing)

**Important:** DTO field mapping is intentionally NOT auto-generated. The assembler skeleton is the scaffold; the developer implements the business-specific field translations.

---

### `tests`
**Phase:** 3  Tests  
**Files created:**
- `{ActionName}EventHandlerTests.cs`  covers consolidation (all branches) + processing (success + error)
- `OhipRequestBuilder{ActionName}Tests.cs`  covers all parameters and edge cases
- Updates `OhipEventFetcherTests.cs` and `OhipEventMessageTypeFilterTests.cs` if neweventtype was run

**Coverage target:** 80% on all new code  
**Test project:** `PropertyConnect.Tests.Unit`

---

### `validate`
**Phase:** 3  Validation  
**What it checks:**
- Phase 1 files all exist and are registered (enum, constants, parser, filter, factory, handler, request builder, dispatcher if required)
- Phase 2 files all exist and are registered (assembler, handler, factory, `InterfaceRequestType` entry)
- Build passes with no errors on both `InterfaceBusinessOHIP.csproj` and `DumboBrokerService.csproj`
- Tests pass at 80% coverage
- Code quality: no hardcoded strings, correlation IDs in all log messages, XML comments on public members, switch expressions used

**Output:** Structured validation report  pass/fail per checklist item

---

### `preflight`
**Phase:** Pre-implementation  
**What it validates:** YAML input contracts  PascalCase action name, UPPERCASE WITH SPACES event names, no TBD routing types, valid consolidation strategy, well-formed API endpoint, valid JSON sample payload  
**Note:** Preflight runs **automatically** before every implementation mode. Use `codenova, ohip preflight` only for a dry-run without implementing.

---

### `endtoend`
**Sequence:** `neweventtype`  `eventhandler`  `apiintegration`  `dtomapping`  `tests`  `validate`  
**Behavior:** Executes each mode in sequence, hands off each step to `codenova.ohip.<mode>`, pauses between phases for developer review. Begins with automatic preflight.

---

## 7. Input Contract (YAML Schema)

All implementation modes require a filled input file:

```yaml
action:
  name: Hurdles               # PascalCase  becomes enum value, class name prefix
  events:
    - NEW HURDLE              # UPPERCASE WITH SPACES  becomes OhipConstants entries
    - UPDATE HURDLE
    - DELETE HURDLE

consolidation:
  strategy: MostRecent        # MostRecent | Earliest | Custom
  key: HotelId                # Deduplication key field in the business event

api:
  integration_required: true  # If false, apiintegration mode is skipped in endtoend
  endpoint: /pms/v1/hurdles
  method: GET
  request_model: OhipHurdlesRequest

routing:
  AriRequestType: HurdleUpdate           # No TBD values allowed
  ConversationRequestType: HurdleUpdate
  SourceDataType: Hurdles

dto_mapping:
  handler: HurdlesOhipDtoHandler
  assembler: HurdlesOhipDtoAssembler
  oxi_dto_class: HurdleDto
  interface_request_type_id: 42

sample_payload: |
  { "HotelId": "DEMO", "RecordId": "HU001", "HurdleAmount": 500.00 }

git:
  create_feature_branch: false
```

Template: `.github/instructions/isf/ohipskill/ohip-action-input.yaml`

---

## 8. Token Cost Model

| Operation | Assets loaded | Approx. tokens |
|---|---|---|
| Domain Q&A (Path A) | `OHIP_DOMAIN_OVERVIEW.md` | ~500 |
| Mode Q&A (Path B) | Overview + one mode guide | ~1,000 |
| Implementation  single mode (Path C) | Overview + one mode guide | ~1,0001,500 |
| Implementation  endtoend | Overview + mode guides (sequential) | ~1,500 per phase |
| Registry lookup | Overview + `OHIP_ACTION_REGISTRY.md` | ~700 |
| Validate | Overview + `validate.md` + registry | ~1,200 |

**Baseline (no OHIP in message):** 0 tokens  the entire skill is dormant.

The skill injects **zero tokens on turns that don't mention OHIP**. The `codenova-ohip.prompt.md` dispatch file and all `ohipskill/` assets use `applyTo`-scoped or on-demand loading  they are never injected unconditionally.

---

## 9. Why It Exists  Benefits

### Without the OHIP Skill

Implementing a new OHIP action type manually requires:
- Knowing which 1015 files to touch across 3 Visual Studio projects
- Knowing the exact enum, constant, factory, handler, and Spring wiring patterns
- Remembering to update both the handler factory AND the event filter
- Writing tests for factory and filter tests (commonly skipped)
- Running the correct build targets in the correct order
- Running the DTO phase separately (Phase 2) after Phase 1 stabilizes

A typical implementation takes **36 hours** for a developer unfamiliar with the full pattern, and **12 hours** even for someone who has done it before.

### With the OHIP Skill

| Outcome | Detail |
|---|---|
| **Consistent implementation** | Every action type follows the same pattern  no missing registrations |
| **Automatic preflight** | Input errors caught before a line of code is written |
| **Guided multi-phase execution** | neweventtype  eventhandler  apiintegration  dtomapping  tests  validate in order |
| **Test generation** | Handler tests, request builder tests, and the commonly-missed factory/filter tests are generated automatically |
| **Validation report** | `codenova, ohip validate` produces a checklist confirming every file exists and every factory registration is present |
| **Zero workspace crawl** | No broad `grep_search` storms  all knowledge is pre-indexed |
| **Domain Q&A without implementation** | "What is DumboBroker?" answered in ~500 tokens from indexed knowledge  no codebase search |
| **Onboarding** | A developer new to OHIP can implement a new action type following the same process as a senior developer |

---

## 10. Known Limitations

| Limitation | Detail |
|---|---|
| DTO field mapping is manual | The assembler skeleton is generated but field-level OXI mapping requires business knowledge the skill cannot infer |
| Action registry is a baseline | `OHIP_ACTION_REGISTRY.md` event names and API details for implemented types are placeholders  verify from `OhipConstants.cs` and `OhipActionTypeParser.cs` |
| `apiintegration` is conditional | If `api.integration_required: false`, DumboBroker files are skipped; endtoend respects this flag |
| Build commands are per-project | The skill issues build commands per project  it does not run a solution-wide build |
| Git operations are optional | Branch creation (`git.create_feature_branch: true`) generates a feature branch; this is opt-in only |
