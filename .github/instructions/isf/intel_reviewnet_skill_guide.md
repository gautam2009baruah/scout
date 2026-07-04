---
description: "Technical documentation for the ReviewNet Skill  architecture, dispatch mechanics, review modes, rule categories, and delivery outcomes. Reference for skill authors and contributors."
applyTo: ".github/instructions/isf/**"
---

# ReviewNet Skill  Technical Intelligence Document

> **Audience:** Skill contributors, CodeNova administrators, senior developers onboarding to the SynXis review process.  
> **Scope:** How the ReviewNet skill is architected inside CodeNova, what each review mode does, what the skill concretely delivers when invoked, and the full rule category map.

---

## 1. What the ReviewNet Skill Is

The ReviewNet skill is a **knowledge-indexed, lazily-loaded AI code review layer** built on top of CodeNova's orchestrator and task executor. It enforces SynXis-platform .NET coding standards (Categories AL) across all C# code entering the repository  turning a manual, inconsistent review process into a structured, automated, repeatable workflow with guaranteed test coverage auditing and non-functional concern enforcement.

It is **not** a generic linter. It is a structured code-review system with indexed domain knowledge, a declared execution contract (5 review modes + 1 checklist mode), a unified input resolution step, mandatory test coverage auditing (H1H6) on every invocation, and blocking gates for security (Category I) and resilience (L1, L4, L6) violations.

The skill replaces manual review of:
- Platform migration compliance (WCF removal, DI patterns, logging with ActivityId)
- Functional correctness concerns (Collections, NHibernate, Data Access patterns)
- Non-functional concerns (Security, Performance, SOLID, Maintainability)
- Test coverage gaps (per-method coverage audit with auto-generated stubs)

---

## 2. System Architecture

```
User message (review intent)
    
    
codenova.instructions.md  Intent Recognition
      Trigger keywords: review pr, review this file, review impact,
      blast radius, test coverage, ActivityId, WCF removal, etc.
    
    
codenova.instructions.md  Unified Input Resolution
      Resolve input type FIRST:
      PR URL  review-pr  |  PR#  review-pr
      file.cs / attachment  review-file
      impact <method>  review-impact
      branch  review-branch
      (ambiguous  ask one clarifying question)
    
     review-pr  
                                                                   
       codenova.orchestrator.run("review-pr")                      
                                                                   
       git fetch  gh pr view  gh pr diff                         
                                                                   
       reviewnet.skillindex  REVIEW_GUIDELINES.md (Categories AL) 
                                                                   
       codenova.analyze (per-file static analysis)                  
                                                                   
       test-coverage-audit (H1H6, per method, auto stubs)         
                                                                     
       structured review report                                       
                                                                      
     review-file   
                                                                      
       codenova.orchestrator.run("review-file")                        
                                                                      
       load file from workspace / attachment context                   
                                                                      
       reviewnet.skillindex  REVIEW_GUIDELINES.md (Categories AL)   
                                                                      
       test-coverage-audit 
           
       structured review report
    
     review-impact 
           
       codenova.orchestrator.run("review-impact")
           
       grep_search / semantic_search (caller map, 2-level transitive)
           
       risk assessment (High / Medium / Low per caller)
           
       test coverage check on impacted paths
           
       blast radius report
    
     review-branch 
           
       codenova.orchestrator.run("review-branch")
           
       git fetch  gh pr list (branch filter)  diff
           
       (same as review-pr from step 5 onward)
    
     review-synxis-checklist 
            
        codenova.task.run("review-synxis-checklist")
            
        reviewnet.skillindex  PR_CHECKLIST.md (net-checklist)
            
        quick gate scan  pass/fail table
```

---

## 3. File Layer Map

All ReviewNet skill assets live in one folder  no external dependencies.

```
.github/instructions/isf/reviewnetskill/
 reviewnet.skillindex          Index file  sole entry point for asset loading
 REVIEW_GUIDELINES.md          Full 12-category rule set (AL) with autofix examples (~3,500 tokens)
 PR_CHECKLIST.md               Quick gate checklist  blocking/warning per rule, test audit format

.github/instructions/isf/
 intel_reviewnet_skill_guide.md   This file  technical documentation for skill authors
```

**Dispatch and routing** (not in the skill folder  loaded separately):
```
.github/instructions/codenova.instructions.md   ReviewNet Skill section:
                                                 - Trigger intent patterns
                                                 - Unified input resolution table
                                                 - review-file workflow
                                                 - review-impact workflow
                                                 - ReviewNet Skill dispatch protocol
```

---

## 4. Skill Index Mechanics

`reviewnet.skillindex` is the **only file CodeNova reads first** for any review request. It never loads both assets at once unless the full depth of analysis escalates from checklist to guidelines.

```
# Format: [Description | type | intent-tag]::path
[SynXis .NET Review Guidelines | *.md | net-review]::.github/instructions/isf/reviewnetskill/REVIEW_GUIDELINES.md
[SynXis PR Review Checklist    | *.md | net-checklist]::.github/instructions/isf/reviewnetskill/PR_CHECKLIST.md
```

**Asset resolution rules:**

| Trigger | Asset loaded | Notes |
|---|---|---|
| `review-pr`, `review-file`, `review-branch`, `review-synxis-guidelines` | `net-review` | Full AL rule set, test audit, structured output |
| `review-synxis-checklist`, quick scan, pre-submit, pr checklist | `net-checklist` | Pass/fail table only; no autofix snippets |
| Ambiguous review intent | `net-checklist` first | Escalate to `net-review` only if violations are found or deeper analysis is requested |
| `review-impact` | Neither (workspace search) | Impact analysis uses `grep_search` / `semantic_search` directly  no rule-set asset needed |

This means a quick gate scan costs ~400 tokens. A full PR review costs ~3,500 tokens (guidelines) + diff tokens. Impact analysis cost scales with codebase caller depth.

---

## 5. Dispatch Paths  Technical Detail

### Path A  Full PR Review (`review-pr`)
**Trigger:** `codenova, review pr <number>` or `codenova, review <PR URL>`  
**Executor:** `codenova.orchestrator`  
**Assets loaded:** `REVIEW_GUIDELINES.md`  
**Workspace access:** `gh pr view`, `gh pr diff`  targeted GitHub CLI calls only  
**Token load:** ~3,500 (guidelines) + diff size  
**Steps:**
```
0. Extract PR# from URL if needed
1. git fetch origin           sync remote refs
2. gh pr view <PR#>           title, author, description, reviewers, check status
3. gh pr diff <PR#>           full unified diff
4. Load REVIEW_GUIDELINES.md  Categories AL
5. codenova.analyze           per-file static analysis on each *.cs in diff
6. test-coverage-audit        H1H6 per method in diff (grep *Tests.cs, generate stubs for )
7. Structured review report   violations by category, test audit, verdict
```
**Output:** Categorised violations (AL), test coverage audit table, blocking verdict

---

### Path B  Local File Review (`review-file`)
**Trigger:** `codenova, review <file.cs>` or `.cs` file attached as conversation context  
**Executor:** `codenova.orchestrator`  
**Assets loaded:** `REVIEW_GUIDELINES.md`  
**Workspace access:** File content from workspace or attachment  no broad crawl  
**Token load:** ~3,500 (guidelines) + file size  
**Steps:**
```
1. Load file from workspace path or attachment context
2. Load REVIEW_GUIDELINES.md  Categories AL
3. Apply all AL rules to file content
4. test-coverage-audit  search *Tests.cs for each public method
   - Report  covered /  partial /  no test found per method
   - Generate stubs for all  entries
5. Structured review report  violations, test audit, verdict
```
**Output:** Same structure as `review-pr` but scoped to a single file

---

### Path C  Impact Analysis (`review-impact`)
**Trigger:** `codenova, review impact <MethodName>` or `codenova, review impact of <change>`  
**Executor:** `codenova.orchestrator`  
**Assets loaded:** None (no rule-set  analysis is structural, not standards-based)  
**Workspace access:** `grep_search` + `semantic_search`  active workspace crawl  
**Token load:** Scales with caller depth and file count  
**Steps:**
```
1. Parse method/symbol name from input
2. grep_search / semantic_search  find all direct callers
3. Build caller map: direct callers  transitive callers (up to 2 levels)
4. Assess risk per impacted file: High / Medium / Low
5. Check for test coverage on impacted callers (grep *Tests.cs)
6. Output:
   - Blast radius summary (N direct callers, M files)
   - Risk table per caller
   - Missing test coverage for impacted paths
   - Recommended regression test areas
```
**Output:** Blast radius report  not a standards review; no AL rule checking

---

### Path D  Branch Review (`review-branch`)
**Trigger:** `codenova, review branch <name>`  
**Executor:** `codenova.orchestrator`  
**Assets loaded:** `REVIEW_GUIDELINES.md`  
**Workspace access:** `git fetch`, `gh pr list` (branch filter), `gh pr diff`  
**Token load:** ~3,500 (guidelines) + diff size  
**Steps:** Same as `review-pr` from step 4 onward (load guidelines  analyze  test audit  report)  
**Output:** Same structure as `review-pr`

---

### Path E  Quick Gate Checklist (`review-synxis-checklist`)
**Trigger:** `codenova, review synxis-checklist`, `pr checklist`, `pre-submit check`, `quick review`  
**Executor:** `codenova.task`  
**Assets loaded:** `PR_CHECKLIST.md`  
**Workspace access:** None  
**Token load:** ~400  
**Output:** Pass/fail gate table  all 12 categories, blocking vs. warning severity per rule; no autofix snippets, no test stubs

---

### No-Crawl Guarantee (for standards)
`grep_search` and `semantic_search` are **never called** to look up coding standards. All 12 categories (AL, ~35 rules) are fully indexed in `REVIEW_GUIDELINES.md`. Workspace crawl is used only in `review-impact` (structural analysis) and in the test coverage audit step (searching `*Tests.cs` for method names).

---

## 6. Review Modes  What Each Delivers

### `review-pr`
**Input:** GitHub PR number or URL  
**What it produces:**
- PR metadata summary (title, author, check status, approval state)
- Per-category violations table (AL) with rule reference, violating code excerpt, and corrected snippet
- Test coverage audit: per-method ` /  / ` across all `*.cs` files in the diff  
- Auto-generated test method stubs for all `` methods (following H4 naming convention)
- Blocking verdict: `APPROVED / NEEDS CHANGES / BLOCKED`

**Blocking criteria:** Any Category I (Security) violation, any H6 "no test project found", any J1 (`Task.Result`/`.Wait()`), J3 (I/O in lock), K3 (LSP contract break), K5 (DIP  concrete constructor), L1 (swallowed exception), L4 (`IDisposable` not disposed), L6 (base `Exception` thrown)

---

### `review-file`
**Input:** Path to a `.cs` file in the workspace, or file attached as conversation context  
**What it produces:**
- Same violation table format as `review-pr`, scoped to one file
- Test coverage audit across all public methods in the file
- If no test project found for the assembly: flagged as a blocker

**Common use cases:**
- Pre-commit self-review of a locally changed file
- Reviewing a file shared as context before pushing
- Checking a file that is not yet part of any PR

---

### `review-impact`
**Input:** Method name, symbol, or plain-language description of a change  
**What it produces:**
- Direct caller list with file and line reference
- Transitive caller map (2 levels deep)
- Risk rating per impacted file: `High` (callers on critical path / no tests), `Medium` (callers covered), `Low` (internal helpers only)
- Test coverage gap: which callers have no test coverage
- Recommended regression test areas

**What it does NOT produce:**
- Standards violations (no AL rule checking)
- Test stubs (stubs are a `review-pr` / `review-file` output)

---

### `review-branch`
**Input:** Branch name  
**What it produces:** Same output as `review-pr`  diff is sourced via `gh pr list --head <branch>` instead of a PR number

---

### `review-synxis-checklist`
**Input:** None (applies to the current PR/diff in context, or used standalone as a checklist reference)  
**What it produces:**
- Pass/fail table for all 12 categories (AL)
- Per-row severity: ` Block` or ` Warn`
- Test coverage gate section (H1H6) with CodeNova test audit output format example
- Security gate section (I1I6)
- No autofix snippets (load `net-review` for those)

---

## 7. Rule Categories  Reference Map

| Category | Focus Area | Blocking Rules | Warning Rules |
|---|---|---|---|
| **A**  Async | `ConfigureAwait(false)` in library code | A1 |  |
| **B**  WCF / Service Removal | Remove `System.ServiceModel`, `ChannelFactory`, `CloseProxy` | B1B5 |  |
| **C**  Dependency Injection | `GetInstance`, Spring.NET migration, factory patterns | C1C3 |  |
| **D**  Logging & Activity Tracking | `ActivityId` in all log calls, `ILogStatsWrapper`, `EndChronicle` | D1D7 |  |
| **E**  Collections & LINQ | `IsNullOrWhiteSpace`, `ICollection` extensions, materialization before loops | E1E4 |  |
| **F**  NHibernate / Data Access | Session lifetime, L2 cache, paging with `SetFirstResult`/`SetMaxResults` | F1F3 |  |
| **G**  Code Quality | Empty `finally` removal, no commented-out code | G1G2 |  |
| **H**  Test Coverage | 80% per file, AAA structure, config-read helpers, resilience paths | H1H6 |  |
| **I**  Security | No secrets in source, no PII in logs, parameterized SQL, input validation, no unsafe deserialization, no TOCTOU | I1I6 (all block) |  |
| **J**  Performance & Complexity | No `Task.Result`/`.Wait()`, no O(N) loops, no I/O in locks, `StringBuilder`, pre-compiled `Regex`, cache AppSettings | J1 , J3  | J2, J4, J5, J6 |
| **K**  SOLID | SRP, OCP strategy dispatch, LSP contract, ISP interface sizing, DIP  abstract dependencies | K3 , K5  | K1, K2, K4 |
| **L**  Maintainability & Resilience | No swallowed exceptions, no magic strings, complexity 10, `IDisposable`, no deep inheritance, domain-typed exceptions | L1 , L4 , L6  | L2, L3, L5 |

**Total rules: 35+ across 12 categories.**  
**Blocking categories: H (all), I (all), J1/J3, K3/K5, L1/L4/L6.**

---

## 8. Token Cost Model

| Operation | Assets loaded | Approx. tokens |
|---|---|---|
| Quick gate checklist (`review-synxis-checklist`) | `PR_CHECKLIST.md` | ~400 |
| Full PR review  small PR (< 100 lines diff) | `REVIEW_GUIDELINES.md` + diff | ~4,000 |
| Full PR review  medium PR (200400 lines diff) | `REVIEW_GUIDELINES.md` + diff | ~5,5007,000 |
| File review  single `.cs` file (~200 lines) | `REVIEW_GUIDELINES.md` + file | ~4,500 |
| Impact analysis  shallow (15 callers) | None (workspace search) | ~1,0002,000 |
| Impact analysis  deep (10+ files) | None (workspace search) | ~3,0006,000 |
| Branch review | `REVIEW_GUIDELINES.md` + diff | Same as PR review |

**Baseline (no review intent in message):** 0 tokens  the entire skill is dormant.  
`REVIEW_GUIDELINES.md` and `PR_CHECKLIST.md` are **never injected unconditionally**. They are loaded only when a review trigger is detected in the user's message.

---

## 9. Why It Exists  Benefits

### Without the ReviewNet Skill

Reviewing a C# PR in the SynXis workspace manually requires a reviewer to:
- Recall 12 platform rule categories and ~35 specific rules from memory
- Know the platform-specific extensions (`IsNotNullOrEmptyForICollection`, `ToKvp`, `ActivityId` patterns)
- Remember that ActivityId is mandatory on _every_ log call  not just errors
- Audit test coverage manually across multiple test projects
- Identify SOLID violations that span multiple methods or classes
- Apply consistent security and performance heuristics without a checklist

A thorough manual review takes **3060 minutes** per PR, and coverage and security gaps are the most commonly missed items.

### With the ReviewNet Skill

| Outcome | Detail |
|---|---|
| **Instant rule application** | All 35+ rules applied in one pass  no recall burden on the reviewer |
| **Mandatory test audit** | Every public method in every changed file is checked for test coverage  `` entries get stubs generated automatically |
| **Security gate** | I1I6 are blocking  secrets, PII-in-logs, SQL injection, unsafe deserialization, and TOCTOU races are caught before merge |
| **Non-functional concerns** | Performance (J), SOLID (K), and Maintainability (L) violations are surfaced  these are the most commonly skipped in manual reviews |
| **Consistent output format** | Every review produces the same structured output: category table  test audit  verdict  reviewers and authors share a common language |
| **Quick gate mode** | `review-synxis-checklist` provides a 30-second pre-submit sanity check before requesting full review |
| **Impact-aware reviews** | `review-impact` surfaces the blast radius of a change before it is merged  regression risk is quantified, not guessed |
| **No crawl for standards** | No broad `grep_search` storms looking for patterns  all rules are pre-indexed; the skill answers in seconds |
| **Onboarding** | A developer new to SynXis gets the same quality review feedback as one with years of platform knowledge |

---

## 10. Known Limitations

| Limitation | Detail |
|---|---|
| Test coverage is structural, not runtime | The test audit greps for method names in `*Tests.cs` files  it detects the presence or absence of test methods, not whether they exercise all code branches at runtime |
| `review-impact` has a 2-level transitive limit | Caller maps are built up to 2 levels of transitive callers. Deeper chains (3+ levels) are not traced automatically |
| Cyclomatic complexity (L3) is estimated, not measured | CodeNova counts branching constructs in the diff  it does not run a static analysis tool. Estimates are indicative, not authoritative |
| SOLID violations require judgment | K1 (SRP), K2 (OCP), K4 (ISP) are flagged as warnings rather than blocks because they require context about intent that cannot always be determined from a diff alone |
| `review-file` for files not in workspace | If a file is referenced by name but not attached and not resolvable in the workspace, the review cannot proceed  CodeNova will ask for the file content |
| PR_CHECKLIST.md has no autofix snippets | The checklist is a gate scan only. Autofix code examples are in `REVIEW_GUIDELINES.md`  load `net-review` for remediation guidance |
