# ReviewNet Enhanced Response Templates (Phased Output)

## Template Selection Logic

Choose template based on review type:
- **Template A** - Quick Checklist (Phase 1 only)
- **Template B** - Full Standards Review (Phase 1-3)
- **Template C** - Impact Analysis (No standards, dependency tracing only)
- **Template D** - Phased Comprehensive Review (Phase 1-5)

---

## Template A: Quick Checklist (Pre-Commit Gate)

**Use When:** Quick review, pre-commit, safety check, deployment gate

### Structure:

```markdown
# Quick Review - PR #[NUMBER]

## Gate Status: [✅ PASS | ❌ FAIL]

### Phase 1 (Critical Safety) Results

| Category | Name | Status | Critical Issues | Notes |
|----------|------|--------|-----------------|-------|
| **N** | Null Safety | [✅ ⚠️ ➖] | [count] | [summary] |
| **O** | Resource Disposal | [✅ ⚠️ ➖] | [count] | [summary] |
| **C** | Dependency Injection | [✅ ⚠️ ➖] | [count] | [summary] |
| **S** | Database Schema | [✅ ⚠️ ➖] | [count] | [summary] |
| **A** | Async/Await | [✅ ⚠️ ➖] | [count] | [summary] |

### 🔴 Blocking Issues (Must Fix Before Merge)

| # | Category | Issue | File | Fix |
|---|----------|-------|------|-----|
| 1 | [A-W] | [Issue description] | [file.cs](path#L10-L15) | [remediation] |

### Recommendation: [MERGE ✅ | DO NOT MERGE ❌]

**Next Steps:**
- [If PASS] Proceed with merge
- [If FAIL] Fix [count] blocking issues and re-submit

**Source Files Used:** [list]
```

---

## Template B: Full Standards Review (Comprehensive)

**Use When:** Comprehensive review, full review, e2e review

### Structure:

```markdown
# Comprehensive Review - PR #[NUMBER]

## Executive Summary

| Metric | Count | Status |
|--------|-------|--------|
| **Total Files Changed** | [count] | ℹ️ |
| **Critical Issues** | [count] | 🔴 Blocks Merge |
| **High Priority Issues** | [count] | 🟠 Production Risk |
| **Medium Priority Issues** | [count] | 🟡 Tech Debt |
| **Low Priority Suggestions** | [count] | 🟢 Enhancement |
| **Breaking Changes Detected** | [Yes/No] | ⚠️ / ✅ |
| **Backward Compatibility Issues** | [count] | ⚠️ / ✅ |
| **Impacted Endpoints** | [count] | 📍 |

---

## 🔴 CRITICAL ISSUES (BLOCKS MERGE)

| # | Category | Issue | File | Impact | Risk | Fix |
|---|----------|-------|------|--------|------|-----|
| 1 | [A-W] | [Issue Title] | [file.cs](path#L10-L15) | [downstream/upstream] | NullRef/Contract/Data Loss | [remediation] |
| 2 | [A-W] | [Issue Title] | [file.cs](path#L20-L25) | [impact] | [risk type] | [remediation] |

---

## 🟠 HIGH PRIORITY (PRODUCTION RISK)

| # | Category | Issue | File | Impact | Risk | Recommendation |
|---|----------|-------|------|--------|------|----------------|
| 1 | [A-W] | [Issue Title] | [file.cs](path#L30) | [impact] | [risk] | [fix] |

---

## 🟡 MEDIUM PRIORITY (TECH DEBT)

| # | Category | Issue | File | Type | Recommendation |
|---|----------|-------|------|------|----------------|
| 1 | [A-W] | [Issue Title] | [file.cs](path#L40) | Tech Debt | [fix] |

---

## 🟢 LOW PRIORITY (SUGGESTIONS)

| # | Category | Suggestion | File | Benefit |
|---|----------|-----------|------|----------|
| 1 | [A-W] | [Suggestion] | [file.cs](path#L50) | [benefit] |

---

## 📊 CATEGORICAL VALIDATION

### Categorical Summary Table

| Phase | Category | Name | Status | Issues | Critical | Notes |
|-------|----------|------|--------|--------|----------|-------|
| **1** | **N** | Null Safety | ✅🟡⚠️ | [count] | [count] | [summary] |
| **1** | **O** | Resource Disposal | ✅🟡⚠️ | [count] | [count] | [summary] |
| **1** | **C** | Dependency Injection | ✅🟡⚠️ | [count] | [count] | [summary] |
| **1** | **S** | Database Schema | ✅🟡⚠️ | [count] | [count] | [summary] |
| **1** | **A** | Async/Await | ✅🟡⚠️ | [count] | [count] | [summary] |
| **2** | **K** | Breaking Changes | ✅🟡⚠️ | [count] | [count] | [summary] |
| **2** | **T** | API Versioning | ✅🟡⚠️ | [count] | [count] | [summary] |
| **2** | **L** | Impacted Endpoints | ✅🟡⚠️ | [count] | [count] | [summary] |
| **2** | **M** | Backward Compatibility | ✅🟡⚠️ | [count] | [count] | [summary] |
| **2** | **W** | External Integrations | ✅🟡⚠️ | [count] | [count] | [summary] |
| **3** | **Q** | Data Validation | ✅🟡⚠️ | [count] | [count] | [summary] |
| **3** | **F** | NHibernate | ✅🟡⚠️ | [count] | [count] | [summary] |
| **3** | **E** | Collections | ✅🟡⚠️ | [count] | [count] | [summary] |
| **3** | **B** | WCF Patterns | ✅🟡⚠️ | [count] | [count] | [summary] |
| **4** | **G** | Code Quality | ✅🟡⚠️ | [count] | [count] | [summary] |
| **4** | **D** | Logging | ✅🟡⚠️ | [count] | [count] | [summary] |
| **4** | **U** | Error Handling | ✅🟡⚠️ | [count] | [count] | [summary] |
| **4** | **R** | Configuration | ✅🟡⚠️ | [count] | [count] | [summary] |
| **5** | **J** | Performance | ✅🟡⚠️ | [count] | [count] | [summary] |
| **5** | **I** | Security | ✅🟡⚠️ | [count] | [count] | [summary] |
| **5** | **H** | Test Coverage | ✅🟡⚠️ | [count] | [count] | [summary] |
| **5** | **P** | Concurrency | ✅🟡⚠️ | [count] | [count] | [summary] |
| **5** | **V** | Observability | ✅🟡⚠️ | [count] | [count] | [summary] |

---

## 🎯 RECOMMENDATION

**[MERGE ✅ | DO NOT MERGE ❌ | MERGE WITH CAUTION ⚠️]**

**Blocking Issues**: [count]  
**Must Fix Before Merge**:
1. [Issue description]
2. [Issue description]

**Estimated Remediation Effort**: [X hours/days]

---

**Source Files Used:** [list categories loaded]  
**Confidence:** [HIGH/MEDIUM/LOW]  
**Review Coverage:** [Phase 1-5 or partial]
```

---

## Template C: Impact Analysis Only

**Use When:** Impact analysis, blast radius, caller impact

### Structure:

```markdown
# Impact Analysis - [Component/Method Name]

## Blast Radius Summary

| Metric | Count | Details |
|--------|-------|---------|
| **Downstream Consumers** | [count] | Files that call this |
| **Upstream Dependencies** | [count] | Files this depends on |
| **Impacted Endpoints** | [count] | API endpoints affected |
| **Transitive Callers** | [count] | Indirect dependencies |

---

## Downstream Impact (Who Calls This)

### Direct Callers

| File | Method/Class | Usage Type | Risk Level | Notes |
|------|--------------|------------|------------|-------|
| [file.cs](path#L10) | [MethodName] | Direct call | 🔴🟠🟡 | [impact description] |

### Transitive Callers

| File | Call Chain | Risk Level | Notes |
|------|------------|------------|-------|
| [file.cs](path#L20) | A → B → C | 🟠 | [impact description] |

---

## Upstream Dependencies (What This Calls)

| Dependency | Type | Changes Required | Risk |
|------------|------|------------------|------|
| [file.cs](path#L30) | Direct | [Yes/No] | 🔴🟠🟡 |

---

## Impacted API Endpoints

| Endpoint Type | Method | Endpoint | Impact | Risk |
|---------------|--------|----------|--------|------|
| WebAPI v1 | GET | `/api/v1/reservations` | [description] | 🔴 |
| WebAPI v2 | POST | `/api/v2/bookings` | [description] | 🟠 |
| SOAP | [Operation] | `ReservationService.Book` | [description] | 🟡 |

---

## Null Safety Validation (Downstream)

| Consumer | Null Check Present | Risk | Fix Required |
|----------|-------------------|------|--------------|
| [file.cs](path#L40) | ❌ NO | 🔴 High | Add null check |
| [file.cs](path#L50) | ✅ YES | 🟢 Low | None |

---

## Testing Impact

| Test Type | Tests Requiring Update | Gap |
|-----------|------------------------|-----|
| Unit Tests | [count] | [missing scenarios] |
| Integration Tests | [count] | [missing flows] |
| Regression Tests | [count] | [compatibility checks] |

---

## Confidence & Coverage

**Confidence Level**: [HIGH 🟢 | MEDIUM 🟡 | LOW 🔴]

**Analysis Coverage**:
- ✅ Direct callers identified
- ✅ Transitive callers traced
- ✅ API endpoints mapped
- [✅ ⚠️] Null safety validated
- [✅ ⚠️] Testing gaps identified

**Gaps**:
- [List any limitations or areas not covered]

---

**Recommendation**: [Proceed/Review Consumers/Add Tests]
```

---

## Template D: Phased Comprehensive Review

**Use When:** Phased review request or early exit scenario

### Structure:

```markdown
# Phased Review - PR #[NUMBER]

## Phase Execution Summary

| Phase | Status | Categories | Issues | Critical | Execution |
|-------|--------|------------|--------|----------|-----------|
| **Phase 1** | [✅ ⚠️ ❌] | N, O, C, S, A | [count] | [count] | [Complete/Stopped] |
| **Phase 2** | [✅ ⚠️ ❌ ➖] | K, T, L, M, W | [count] | [count] | [Complete/Skipped] |
| **Phase 3** | [✅ ⚠️ ❌ ➖] | Q, F, E, B | [count] | [count] | [Complete/Skipped] |
| **Phase 4** | [✅ ⚠️ ❌ ➖] | G, D, U, R | [count] | [count] | [Complete/Skipped] |
| **Phase 5** | [✅ ⚠️ ❌ ➖] | J, I, H, P, V | [count] | [count] | [Complete/Skipped] |

---

## Phase 1 - CRITICAL STRUCTURAL & SAFETY

### Results Summary
- **Status**: [✅ PASS | ⚠️ ISSUES FOUND | ❌ BLOCKERS DETECTED]
- **Critical Blockers**: [count]
- **Action**: [Continue to Phase 2 | STOP - Fix blockers first]

### Findings

| Category | Status | Critical Issues | All Issues |
|----------|--------|-----------------|------------|
| **N** - Null Safety | [✅ ⚠️] | [count] | [count] |
| **O** - Resource Disposal | [✅ ⚠️] | [count] | [count] |
| **C** - Dependency Injection | [✅ ⚠️] | [count] | [count] |
| **S** - Database Schema | [✅ ⚠️] | [count] | [count] |
| **A** - Async/Await | [✅ ⚠️] | [count] | [count] |

#### Critical Issues (Phase 1)

| # | Cat | Issue | File | Risk | Fix |
|---|-----|-------|------|------|-----|
| 1 | [N-A] | [Issue] | [file.cs](path#L10) | [risk] | [fix] |

---

## Phase 2 - CONTRACT & API CHANGES

### Results Summary
- **Status**: [✅ PASS | ⚠️ ISSUES FOUND | ❌ BREAKING CHANGES | ➖ SKIPPED]
- **Breaking Changes**: [count]
- **Impacted Endpoints**: [count]
- **Action**: [Continue to Phase 3 | Flag for versioning review]

### Findings

| Category | Status | Critical Issues | All Issues |
|----------|--------|-----------------|------------|
| **K** - Breaking Changes | [✅ ⚠️ ➖] | [count] | [count] |
| **T** - API Versioning | [✅ ⚠️ ➖] | [count] | [count] |
| **L** - Impacted Endpoints | [✅ ⚠️ ➖] | [count] | [count] |
| **M** - Backward Compatibility | [✅ ⚠️ ➖] | [count] | [count] |
| **W** - External Integrations | [✅ ⚠️ ➖] | [count] | [count] |

#### High Priority Issues (Phase 2)

| # | Cat | Issue | File | Impact | Fix |
|---|-----|-------|------|--------|-----|
| 1 | [K-W] | [Issue] | [file.cs](path#L10) | [impact] | [fix] |

---

## Phase 3 - BUSINESS LOGIC & DATA

### Results Summary
- **Status**: [✅ PASS | ⚠️ ISSUES FOUND | ➖ SKIPPED]
- **Business Logic Issues**: [count]
- **Data Issues**: [count]

### Findings

| Category | Status | Issues |
|----------|--------|--------|
| **Q** - Data Validation | [✅ ⚠️ ➖] | [count] |
| **F** - NHibernate | [✅ ⚠️ ➖] | [count] |
| **E** - Collections | [✅ ⚠️ ➖] | [count] |
| **B** - WCF Patterns | [✅ ⚠️ ➖] | [count] |

#### Issues (Phase 3)

| # | Cat | Issue | File | Type | Fix |
|---|-----|-------|------|------|-----|
| 1 | [Q-B] | [Issue] | [file.cs](path#L10) | [type] | [fix] |

---

## Phase 4 - QUALITY & STANDARDS

### Results Summary
- **Status**: [✅ PASS | ⚠️ ISSUES FOUND | ➖ SKIPPED]
- **Code Quality Issues**: [count]
- **Tech Debt**: [count]

### Findings

| Category | Status | Issues |
|----------|--------|--------|
| **G** - Code Quality | [✅ ⚠️ ➖] | [count] |
| **D** - Logging | [✅ ⚠️ ➖] | [count] |
| **U** - Error Handling | [✅ ⚠️ ➖] | [count] |
| **R** - Configuration | [✅ ⚠️ ➖] | [count] |

---

## Phase 5 - NON-FUNCTIONAL REQUIREMENTS

### Results Summary
- **Status**: [✅ PASS | ⚠️ ISSUES FOUND | ➖ SKIPPED]
- **Performance Issues**: [count]
- **Security Issues**: [count]
- **Test Coverage**: [percentage]

### Findings

| Category | Status | Issues |
|----------|--------|--------|
| **J** - Performance | [✅ ⚠️ ➖] | [count] |
| **I** - Security | [✅ ⚠️ ➖] | [count] |
| **H** - Test Coverage | [✅ ⚠️ ➖] | [count] |
| **P** - Concurrency | [✅ ⚠️ ➖] | [count] |
| **V** - Observability | [✅ ⚠️ ➖] | [count] |

---

## 🎯 FINAL RECOMMENDATION

**Decision**: [MERGE ✅ | DO NOT MERGE ❌ | MERGE WITH CAUTION ⚠️]

**Blocking Phase**: [1-5 or NONE]  
**Total Critical Issues**: [count]  
**Total All Issues**: [count]

### Must Fix Before Merge:
1. [Phase X] [Category Y] [Issue description]
2. [Phase X] [Category Y] [Issue description]

### Recommended Improvements (Non-Blocking):
- [Issue description]

### Estimated Remediation:
- Critical fixes: [X hours]
- Total fixes: [Y hours]

---

## Review Metadata

**Categories Loaded**: [list]  
**Categories Skipped**: [list with reason]  
**Source Files Used**: [list]  
**Confidence**: [Phase 1: HIGH, Phase 2: MEDIUM, etc.]  
**Review Duration**: [estimated]
```

---

## Common Response Patterns

### Pattern 1: Early Exit on Phase 1 Blockers
```markdown
## Phase 1 - CRITICAL STRUCTURAL & SAFETY
**Status**: ❌ BLOCKERS DETECTED  
**Action**: STOP - Fix Phase 1 blockers before proceeding

### Critical Blockers
1. [Category N] Null reference risk in ReservationService.ProcessBooking
2. [Category O] Missing using statement for HttpClient

**Recommendation**: DO NOT MERGE ❌

**Next Steps**: Fix 2 critical blockers and re-submit for review.

---

**Phases 2-5 skipped** due to Phase 1 blockers (will execute after fixes).
```

### Pattern 2: Breaking Change Detected
```markdown
## Phase 2 - CONTRACT & API CHANGES
**Status**: ⚠️ BREAKING CHANGES DETECTED  
**Action**: Flag for versioning review

### Breaking Changes
1. [Category K] DTO property `GuestName` changed from `string` to `string?` in v1 API

**Recommendation**: MERGE WITH CAUTION ⚠️

**Required Action**: Either revert breaking change OR create v2 API endpoint.
```

### Pattern 3: All Phases Pass
```markdown
## Phase Execution Summary
All phases completed successfully. No critical issues found.

**Recommendation**: MERGE ✅

Minor suggestions:
- [Category G] Extract magic number to constant in TaxCalculator.cs
- [Category H] Add unit test for null guest name scenario
```

---

## Output Metadata (Always Include)

### Standard Footer:
```markdown
---

## Review Details

**Loaded Categories**: [Phase 1: N, O, C, S, A | Phase 2: K, T, L, M, W | ...]  
**Skipped Categories**: [Phase 4-5: No NFR changes detected]  
**Source Files**: [N-null-safety.md, K-breaking-changes.md, ...]  
**Confidence**: [Phase 1: HIGH (full scan), Phase 2: MEDIUM (changed files only)]  
**Review Type**: [Quick/Comprehensive/Contract/Business/Impact]  
**PR Size**: [X files, Y LOC changed]
```
