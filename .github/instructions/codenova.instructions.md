---
description: "CodeNova Auto mode routing contract: shortest-path dispatch from Copilot to Rust backend executors."
applyTo: "**"
---

# CodeNova Routing Contract

CodeNova is the execution layer for this workspace. Prefer backend execution first and keep Copilot synthesis minimal.

## Auto Mode Objectives

- Shortest path from user intent to Rust backend executor.
- Deterministic routing for both Claude and GPT style prompts.
- No raw workspace crawl as first action.
- Keep always-on instruction footprint small.

## Global Dispatch Order

Evaluate each user message in this exact order:

1. Explicit CodeNova command (`codenova, ...`) -> dispatch directly to mapped executor.
2. Compound multi-skill intent (2+ domain skills with dependency or handoff language) -> `codenova.orchestrator` compound skill workflow.
3. Domain skill intent (tax, ohip, synxisnom, reviewnet, architect, archon) -> `codenova.task` domain task **with progressive-disclosure control flow** (see Progressive-Disclosure Mandatory Control Flow below).
4. Ask/explain/discover/search/scan intent -> `codenova.task` `ask` using deep-discover.
5. Multi-step workflow intent (PR review, branch review, impact review, git connect/fetch) -> `codenova.orchestrator` workflow.
6. No match -> direct tools as last resort only.

Rule: do not call `grep_search`, `semantic_search`, or `file_search` as the primary first move when steps 1-4 apply.

## Progressive-Disclosure Mandatory Control Flow

**All domain skill dispatch (step 2 above) must route through progressive-disclosure guards before loading guide content.**

Dispatch order for every skill intent:

1. Load `<skill>/manifest.md` (overview of skill scope)
2. Evaluate `<skill>/triggers.md` (classify the specific intent)
3. Load one primary concern file from `<skill>/loading-rules.md` (If-X-then-Y routing)
4. Load nested files only if `<skill>/nested-loads.md` conditions are met
5. Format output using `<skill>/response-templates.md`

Progressive-disclosure files location: `.github/instructions/pd/`

**Guards:**
- Never load all skill guide files by default; one primary file per request.
- Never load deep reference files without explicit user request or low-confidence flag.
- If ambiguous, load overview file before deep file.
- If no trigger matches, ask one clarifying question before searching.

See also: `.github/instructions/pd/shared/router-contract.md` for authoritative guard rules.

## Compound Multi-Skill Routing

Use compound routing when one message intentionally chains 2 or more domain skills and the output of an earlier skill is needed as input evidence for a later skill.

Trigger signals:

- Two or more domain terms appear in one request: `tax`, `ohip`, `synxisnom`, `reviewnet`, `architect`, `archon`
- Dependency verbs appear between them: `use`, `incorporate`, `feed`, `apply to`, `based on`, `then`, `before`, `for designing`, `for solutioning`, `as context`, `as input`
- The last clause requests a synthesis artifact such as `design`, `deconstruct`, `split`, `review`, `recommend`, or `impact`

Execution model:

1. Detect the primary destination skill from the final deliverable verb.
2. Detect supporting skills from earlier clauses.
3. Run supporting skills first, one primary file each via progressive-disclosure.
4. Produce a compact evidence handoff packet after each supporting skill.
5. Invoke the destination skill with those packets as extra context, not as raw file dumps.

Primary destination defaults:

- `design`, `deconstruct`, `split`, `adr`, `stories` -> `architect-skill`
- `implement`, `action`, `mode`, `validate ohip` -> `ohip-skill`
- `review`, `checklist`, `standards`, `impact review` -> `reviewnet`

Example:

- `codenova, check tax logic that can be incorporated to ohip flows and archon deconstruct or split needs to take it as extra context`
  - supporting skill 1: `tax-skill`
  - supporting skill 2: `ohip-skill`
  - destination skill: `architect-skill`
  - execution: `tax -> ohip -> architect`

The compound path is bounded:

- Max 3 skills in one pass.
- Max 1 primary file per supporting skill before destination skill starts.
- Escalate nested loads only when a supporting skill returns low confidence.
- If two destination skills compete, ask one clarifying question instead of running both.

## Command Canonicalization (Model-Agnostic)

Before dispatch, normalize user input into a canonical command shape so GPT and Claude variants route identically.

Accepted user forms:

- `codenova, <intent> <message>`
- `codenova: <intent> <message>`
- `codenova <intent> <message>`
- `codenova, intent=<intent>; message=<message>`
- `codenova, message=<message>; intent=<intent>`

Canonical extraction:

1. Strip prefix token: `codenova` with optional `,` or `:`.
2. Parse explicit key-value first (`intent=`, `message=`).
3. If no key-value exists, use first action token as intent and remaining text as message.
4. Lowercase intent; preserve message casing.
5. Trim punctuation-only wrappers and collapse repeated whitespace.

Canonical object:

```json
{
  "prefix": "codenova",
  "intent": "ask|explain|discover|review|get|git|analyze|tax|ohip|synxisnom|reviewnet|architect|archon|unknown",
  "message": "string",
  "raw": "original user text"
}
```

If intent is unknown but prefix is present, route to `codenova.task` `ask` using message as subject.

## Model-Agnostic Handoff Gate (Claude and GPT)

Copilot should be invoked only when backend output needs reasoning or synthesis.

Invoke Copilot synthesis only if one or more are true:

- Backend strategy is `backend-assisted-copilot`.
- Backend strategy is `backend-first` and complexity threshold is exceeded.
- Backend returns partial, conflicting, or low-confidence evidence.
- User explicitly asks for explanation, summary, rewrite, or recommendation.

Do not invoke Copilot when backend can return final answer directly (`backend-only` path).

## Execution Strategies

| Strategy | Backend Work | Copilot Work | Target Token Cost |
|---|---|---|---|
| `backend-only` | 100% | 0% | 0 |
| `backend-first` | Primary analysis and filtering | Conditional enhancement only | 0-150 |
| `backend-assisted-copilot` | Data retrieval and context prep | Synthesis and reasoning | 200-450 |

## Intent to Executor Mapping

| Intent Pattern | Dispatch |
|---|---|
| `codenova, get <DE/US/TA>` | `codenova.task` -> `get-rally-item` |
| `codenova, ask <question>` | `codenova.task` -> `ask` |
| `codenova, explain <topic>` | `codenova.task` -> `ask` |
| `codenova, discover <subject>` | `codenova.task` -> `ask` |
| `codenova, summarize <topic>` | `codenova.task` -> `ask` |
| `codenova, identify <subject>` | `codenova.task` -> `ask` |
| `codenova, review <PR URL>` | `codenova.orchestrator` -> `review-pr` |
| `codenova, review pr <number>` | `codenova.orchestrator` -> `review-pr` |
| `codenova, review <file.cs>` | `codenova.orchestrator` -> `review-file` |
| `codenova, review impact <method>` | `codenova.orchestrator` -> `review-impact` |
| `codenova, review branch <name>` | `codenova.orchestrator` -> `review-branch` |
| `codenova, pr diff <number>` | `codenova.task` -> `pr-diff` |
| `codenova, git fetch` | `codenova.orchestrator` -> `git-fetch` |
| `codenova, git status` | `codenova.task` -> `git-status` |
| `codenova, connect git` | `codenova.orchestrator` -> `connect-git` |
| `codenova, architect <subject>` | `codenova.task` -> `architect-skill` |
| `codenova, archon <subject>` | `codenova.task` -> `architect-skill` |
| `codenova, <multi-skill dependency chain>` | `codenova.orchestrator` -> `compound-skill` |
| `analyze jenkins <url>` | `codenova.task` -> `analyze-jenkins` |

Canonical intent aliases:

- `ask`, `explain`, `discover`, `summarize`, `identify`, `search`, `scan` -> `ask`
- `tax` -> `tax-skill`
- `ohip` -> `ohip-skill`
- `synxisnom` -> `synxisnom-skill`
- `reviewnet` -> `review-synxis-guidelines`
- `architect`, `archon` -> `architect-skill`

## Domain Skill Routing

Domain intents must route through indexed skills **with progressive-disclosure control flow** before any raw workspace crawl.

If the request contains 2+ domain intents with dependency language, do not force a single-skill match first.
Route to the compound workflow and use ordered evidence handoff.

- Tax intent -> `codenova.task` -> `tax-skill` **via progressive-disclosure** (see Global Dispatch Order above)
- OHIP intent -> `codenova.task` -> `ohip-skill` **via progressive-disclosure**
- SynXis nomenclature intent -> `codenova.task` -> `synxisnom-skill` **via progressive-disclosure**
- C# standards review intent -> `codenova.task` -> `review-synxis-guidelines` or `review-synxis-checklist` **via progressive-disclosure**
- Architecture design intent (`architect` or `archon`) -> `codenova.task` -> `architect-skill` **via progressive-disclosure**

Full protocols:

- `.github/prompts/codenova-tax-skill.prompt.md`
- `.github/prompts/codenova-ohip.prompt.md`
- `.github/prompts/codenova-architect-skill.prompt.md`
- `.github/prompts/codenova-deep-discover.prompt.md`

**Control flow files:**
- `.github/instructions/pd/skills/<skill>/manifest.md` — skill overview
- `.github/instructions/pd/skills/<skill>/triggers.md` — intent classifiers
- `.github/instructions/pd/skills/<skill>/loading-rules.md` — conditional load rules (If-X-then-Y)
- `.github/instructions/pd/skills/<skill>/nested-loads.md` — when to load secondary files
- `.github/instructions/pd/skills/<skill>/response-templates.md` — output formatting templates

## Ask/Explain/Discover Routing

Any ask/explain/discover/search/scan semantic intent must route to:

- `codenova.task` -> `ask` -> `deep-discover:<subject>`

Deep-discover protocol summary:

1. Step 0: `codenova.bridge` lookup (`CONFIRMED`, `INFERRED`, `UNKNOWN`).
2. Step 1: parse and normalize subject.
3. Step 2: search only if not `CONFIRMED`.
4. Step 3: cross-reference evidence.
5. Step 4: synthesize response.
6. Step 5: confidence statement.

## Unified Review Input Resolution

For `codenova, review`, resolve input type first:

- PR URL or PR number -> `review-pr`
- Local `.cs` file or attached file -> `review-file`
- Impact request -> `review-impact`
- Branch request -> `review-branch`

If ambiguous, ask one question:

- "What should I review: PR number, local file, branch, or method impact?"

---

## Categorical Validation (A-W) - 23 Categories

Comprehensive PR review uses **23 validation categories (A-W)** organized into **5 execution phases** for efficient, effective defect detection.

### Phase-Based Execution Model

| Phase | Priority | Categories | Execution | Blocking | Early Exit |
|-------|----------|------------|-----------|----------|------------|
| **1** | CRITICAL | N, O, C, S, A | Sequential | ✅ YES | ✅ YES |
| **2** | HIGH | K, T, L, M, W | Sequential | ✅ YES | ✅ YES |
| **3** | HIGH | Q, F, E, B | Parallel | ⚠️ PARTIAL | ❌ NO |
| **4** | MEDIUM | G, D, U, R | Parallel | ❌ NO | ❌ NO |
| **5** | MEDIUM | J, I, H, P, V | Parallel | ❌ NO | ❌ NO |

### Category List by Phase

**Phase 1 - CRITICAL (Structural & Safety):**
- **N** - Null Safety & Reference Handling
- **O** - Resource Management & Disposal
- **C** - Dependency Injection
- **S** - Database Schema & Migrations
- **A** - Async/Await Compliance

**Phase 2 - HIGH (Architecture & Contracts):**
- **K** - Breaking Changes
- **T** - API Versioning & Contract Evolution
- **L** - Impacted Endpoints
- **M** - Backward Compatibility
- **W** - External Integrations & Resilience

**Phase 3 - HIGH (Business Logic & Data):**
- **Q** - Data Validation & Business Rules
- **F** - NHibernate Patterns
- **E** - Collections Handling
- **B** - WCF Service Patterns

**Phase 4 - MEDIUM (Quality & Standards):**
- **G** - Code Quality
- **D** - Logging
- **U** - Error Handling & Fault Contracts
- **R** - Configuration & Feature Flags

**Phase 5 - MEDIUM (Non-Functional Requirements):**
- **J** - Performance
- **I** - Security
- **H** - Test Coverage
- **P** - Concurrency & Thread Safety
- **V** - Observability & Monitoring

### Execution Strategy

1. **Phase 1 (Critical)** runs first, sequentially
   - If ANY Phase 1 blockers detected → **STOP** and report (fail fast)
   - Do not proceed to Phase 2-5 until Phase 1 passes

2. **Phase 2 (Contracts)** runs if Phase 1 passes
   - If breaking changes detected → Flag for versioning review
   - If API surface changed → Load all Phase 2 categories

3. **Phase 3-5** run based on review type:
   - **Quick review** → Phase 1 only
   - **Contract review** → Phase 1-2
   - **Business review** → Phase 1, 3
   - **Comprehensive review** → Phase 1-5

### Progressive Disclosure Rules

- **Quick review**: Load Phase 1 categories only
- **Contract review**: Load Phase 1-2 if API changes detected
- **Business review**: Load Phase 1, 3 if domain logic changed
- **Comprehensive review**: Load all phases (user explicitly requested)

### Category Reference Files

**Location:** `.github/instructions/pd/skills/reviewnet/categories/`

**Folders:**
- `critical/` - Phase 1 categories (N, O, C, S, A)
- `contracts/` - Phase 2 categories (K, T, L, M, W)
- `business/` - Phase 3 categories (Q, F, E, B)
- `quality/` - Phase 4 categories (G, D, U, R)
- `nfr/` - Phase 5 categories (J, I, H, P, V)

**Index:** `.github/instructions/pd/skills/reviewnet/CATEGORY_INDEX.md`

---

## Backend-to-Copilot Response Envelope

When backend calls Copilot for synthesis, pass normalized payload fields:

```json
{
  "intent": "ask|discover|review|analyze",
  "strategy": "backend-only|backend-first|backend-assisted-copilot",
  "confidence": "high|medium|low",
  "evidence": [],
  "files": [],
  "guidelines": [],
  "max_words": 350,
  "output_template": "ask|review|discover|analyze"
}
```

Copilot must honor `max_words` and use concise structured output.

## Response Budgets

- Ask/explain: <= 220 words.
- Discover: <= 300 words.
- Review: <= 420 words, top issues first.
- Analyze enhancement: <= 180 words.

## Telemetry Fields (for Auto Mode validation)

Track for each request:

- `intent_detected`
- `executor_selected`
- `strategy`
- `copilot_invoked` (true/false)
- `fallback_reason` (if fallback used)
- `first_token_latency_ms`
- `total_tokens`

## Non-Negotiable Rules

- Authentication is enforced by CodeNova extension; do not add extra auth blocking in instructions.
- Do not run primary raw search when intent already maps to task/orchestrator.
- Keep instruction files declarative; long procedures belong in prompt files.
- Preserve shortest backend path first, synthesis second.

