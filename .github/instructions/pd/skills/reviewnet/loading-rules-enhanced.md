# ReviewNet Enhanced Loading Rules (Phased Progressive Disclosure)

## Phased Loading Strategy

Reviews execute in 5 phases with early exit capability for critical blockers.

---

## Phase 1: CRITICAL STRUCTURAL & SAFETY (Always Execute First)

**Categories:** N, O, C, S, A  
**Execution Model:** Sequential  
**Early Exit:** YES - If any critical blocker found, STOP and report

### Loading Conditions:
**ALWAYS load Phase 1 categories for ANY code review request.**

### Load Order:
1. **N - Null Safety** → Scan for null reference risks
2. **O - Resource Disposal** → Check IDisposable usage
3. **C - Dependency Injection** → Validate DI patterns
4. **S - Database Schema** → Review migrations
5. **A - Async/Await** → Check async patterns

### Early Exit Logic:
```
IF Phase 1 has ANY critical blockers (🔴):
  - STOP execution
  - Return findings with "DO NOT MERGE ❌"
  - Skip Phase 2-5
  - Recommend: "Fix Phase 1 critical issues before re-review"
ELSE:
  - Continue to Phase 2
```

---

## Phase 2: CONTRACT & API CHANGES (Execute if API Surface Changed)

**Categories:** K, T, L, M, W  
**Execution Model:** Sequential  
**Early Exit:** YES - If breaking changes detected without versioning

### Loading Conditions:
Execute Phase 2 if **ANY** of these detected:
- Public API methods/properties added/removed/modified
- DTO schema changes (properties added/removed, nullability changed)
- Database schema changes (column added/removed, type changed)
- WCF service contract changes (`[ServiceContract]`, `[DataContract]`)
- External API integration changes

### Load Order:
1. **K - Breaking Changes** → Detect contract-level breaking changes
2. **T - API Versioning** → Validate v1/v2 versioning strategy
3. **L - Impacted Endpoints** → Map affected endpoints
4. **M - Backward Compatibility** → Check client compatibility
5. **W - External Integrations** → Validate resilience patterns

### Early Exit Logic:
```
IF breaking changes detected AND no API versioning:
  - Flag as HIGH PRIORITY blocker
  - Return findings with "MERGE WITH CAUTION ⚠️"
  - Recommend: "Version API or revert breaking change"
  - Continue to Phase 3 (accumulate findings)
```

---

## Phase 3: BUSINESS LOGIC & DATA (Execute if Domain Logic Changed)

**Categories:** Q, F, E, B  
**Execution Model:** Parallel OK (independent checks)  
**Early Exit:** NO - Accumulate all findings

### Loading Conditions:
Execute Phase 3 if **ANY** of these detected:
- Service layer classes modified
- NHibernate mappings changed
- Business rule methods updated
- WCF service implementations changed
- Collection handling patterns modified

### Load Order (parallel):
- **Q - Data Validation** → Validate business rules
- **F - NHibernate** → Check ORM patterns
- **E - Collections** → Review enumeration patterns
- **B - WCF Patterns** → Validate service contracts

### Accumulation Logic:
```
Phase 3 findings accumulate without blocking.
Continue to Phase 4 regardless of findings count.
```

---

## Phase 4: QUALITY & STANDARDS (Execute if Comprehensive Review Requested)

**Categories:** G, D, U, R  
**Execution Model:** Parallel OK  
**Early Exit:** NO - Accumulate all findings

### Loading Conditions:
Execute Phase 4 if **ANY** of these:
- User explicitly requests "comprehensive review"
- PR size exceeds threshold (>500 LOC)
- Phase 1-3 issue count exceeds threshold (>10 issues)
- Defect story type (not feature/enhancement)

### Load Order (parallel):
- **G - Code Quality** → Check SOLID, DRY, complexity
- **D - Logging** → Validate structured logging
- **U - Error Handling** → Check fault contracts
- **R - Configuration** → Review config changes

---

## Phase 5: NON-FUNCTIONAL REQUIREMENTS (Execute if Comprehensive Review or NFR Impact)

**Categories:** J, I, H, P, V  
**Execution Model:** Parallel OK  
**Early Exit:** NO - Accumulate all findings

### Loading Conditions:
Execute Phase 5 if **ANY** of these:
- User explicitly requests "comprehensive review"
- Performance-critical code modified (LINQ, database queries)
- Security-sensitive code modified (authentication, authorization)
- Test files modified or new tests required
- Concurrency primitives used (`lock`, `Task`, `async`)

### Load Order (parallel):
- **J - Performance** → Check query efficiency, caching
- **I - Security** → Validate auth, input sanitization
- **H - Test Coverage** → Check unit/integration tests
- **P - Concurrency** → Review thread safety
- **V - Observability** → Check metrics, health checks

---

## Quick Review Path (Pre-Commit Gate)

### Trigger Keywords:
- `quick review`, `pre-commit`, `safety check`, `deployment gate`

### Execution:
**Only Phase 1 (Critical categories)**

### Output:
Pass/Fail gate with blockers list (no Phase 2-5)

---

## Partial Review Paths

### Contract Review Only (Phase 1 + Phase 2)
**Trigger:** `contract review`, `api review`, `breaking change check`  
**Execution:** Phase 1 → Phase 2 → STOP

### Business Logic Review (Phase 1 + Phase 3)
**Trigger:** `business logic review`, `domain review`  
**Execution:** Phase 1 → Phase 3 → STOP

### Full Comprehensive Review (Phase 1-5)
**Trigger:** `comprehensive review`, `full review`, `e2e review`  
**Execution:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

---

## Context-Aware Loading

### If Changed Files Contain:
- `.csproj`, `Directory.Build.props` → Load **S (Database Schema)**, **R (Configuration)**
- `NHibernate` mappings → Load **F (NHibernate)**, **S (Database Schema)**
- `Controller`, `Service` → Load **C (DI)**, **Q (Data Validation)**, **U (Error Handling)**
- `Tests` folder → Load **H (Test Coverage)**
- `web.config`, `appsettings.json` → Load **R (Configuration)**
- `HttpClient`, external API calls → Load **W (External Integrations)**
- `lock`, `ConcurrentDictionary` → Load **P (Concurrency)**

---

## Nested Load Escalation

### Trigger Nested Loads When:
1. **Low Confidence Detected** → Load additional reference files
2. **Multiple Violations in Same Category** → Load detailed remediation guides
3. **User Asks for Remediation Examples** → Load category-specific fix patterns
4. **Breaking Change Detected** → Load migration guide templates

---

## File-Level Loading Precision

### Primary Concern Files (Load First):
- Phase 1: `N-null-safety.md`, `O-resource-disposal.md`, `C-dependency-injection.md`, `S-database-schema.md`, `A-async-await.md`
- Phase 2: `K-breaking-changes.md`, `T-api-versioning.md`, `L-impacted-endpoints.md`, `M-backward-compatibility.md`, `W-external-integrations.md`
- Phase 3: `Q-data-validation.md`, `F-nhibernate.md`, `E-collections.md`, `B-wcf-patterns.md`
- Phase 4: `G-code-quality.md`, `D-logging.md`, `U-error-handling.md`, `R-configuration.md`
- Phase 5: `J-performance.md`, `I-security.md`, `H-test-coverage.md`, `P-concurrency.md`, `V-observability.md`

### Reference Files (Load on Escalation):
- `CATEGORY_INDEX.md` → Category quick reference
- `net-standards.instructions.md` → C# standards
- Compound skill files → For multi-skill workflows

---

## Guard Rules (Prevent Over-Loading)

### DO NOT:
- Load all 23 categories by default
- Load Phase 2-5 if Phase 1 has critical blockers
- Load reference files without explicit need
- Load nested files when primary file sufficient
- Apply standards files to pure impact-only requests

### DO:
- Load one primary file per category
- Use progressive disclosure for nested files
- Respect early exit gates
- Parallelize Phase 3-5 when possible
- Cache category results to avoid re-loading

---

## Output Context Optimization

### Include in Response:
- List of **loaded categories** (e.g., "Phase 1: N, O, C, S, A")
- **Skipped categories** with reason (e.g., "Phase 2-5 skipped due to Phase 1 blockers")
- **Confidence level** per category (HIGH/MEDIUM/LOW)
- **Source files used** per category

### Example:
```
Loaded Categories: Phase 1 (N, O, C, S, A), Phase 2 (K, T, L, M, W)
Skipped Categories: Phase 3-5 (no domain logic changes detected)
Confidence: Phase 1 HIGH, Phase 2 MEDIUM (limited to changed files)
Source Files: N-null-safety.md, O-resource-disposal.md, K-breaking-changes.md
```
