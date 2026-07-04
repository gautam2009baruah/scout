# ReviewNet Enhanced Trigger Keywords (Phased Routing)

## Primary Skill Activation

**Skill Name:** `reviewnet-skill`

### Core Trigger Phrases:
- review pr
- review file
- review branch
- code review
- review impact
- synxis guidelines
- comprehensive review

---

## Phase-Specific Routing

### Phase 1 Only (Critical Safety Check)
**Route:** Quick Review Path  
**Execution:** Phase 1 categories only (N, O, C, S, A)

**Trigger Keywords:**
- quick review
- pre-commit
- safety check
- deployment gate
- critical check
- blocker check
- merge gate

**Example Usage:**
```
codenova, quick review pr 12345
codenova, safety check pr 12345
codenova, pre-commit review branch feature/tax-update
```

---

### Phase 1 + 2 (Contract & API Review)
**Route:** Contract Review Path  
**Execution:** Phase 1 → Phase 2 (critical + contract categories)

**Trigger Keywords:**
- contract review
- api review
- breaking change
- breaking change check
- versioning check
- api versioning
- endpoint impact
- compatibility check

**Example Usage:**
```
codenova, contract review pr 12345
codenova, api review pr 12345
codenova, breaking change check pr 12345
```

---

### Phase 1 + 3 (Business Logic Review)
**Route:** Business Logic Review Path  
**Execution:** Phase 1 → Phase 3 (critical + business categories)

**Trigger Keywords:**
- business logic review
- business review
- domain review
- domain logic
- data review
- validation review
- nhibernate review

**Example Usage:**
```
codenova, business logic review pr 12345
codenova, domain review pr 12345
```

---

### Phase 1-5 (Comprehensive Review)
**Route:** Full Comprehensive Review Path  
**Execution:** All 5 phases (all 23 categories)

**Trigger Keywords:**
- comprehensive review
- full review
- e2e review
- complete review
- end-to-end review
- thorough review
- deep review

**Example Usage:**
```
codenova, comprehensive review pr 12345
codenova, full review pr 12345
codenova, e2e review branch feature/booking-engine
```

---

## Category-Specific Triggers

### Category N - Null Safety
- null safety
- null check
- nullable reference
- nullref
- null propagation

### Category O - Resource Disposal
- resource disposal
- using statement
- idisposable
- memory leak
- connection leak

### Category C - Dependency Injection
- dependency injection
- di
- di container
- autofac
- service registration

### Category S - Database Schema
- database schema
- migration
- schema change
- nhibernate mapping
- db change

### Category A - Async/Await
- async
- async await
- task
- deadlock
- sync over async

### Category K - Breaking Changes
- breaking change
- breaking changes
- contract breaking
- api breaking

### Category T - API Versioning
- api versioning
- versioning
- v1 v2
- version strategy

### Category L - Impacted Endpoints
- impacted endpoints
- endpoint impact
- affected endpoints
- downstream impact

### Category M - Backward Compatibility
- backward compatibility
- backwards compatibility
- compatibility
- legacy support

### Category W - External Integrations
- external integrations
- external api
- resilience
- retry logic
- circuit breaker
- timeout

### Category Q - Data Validation
- data validation
- validation
- business rules
- input validation

### Category F - NHibernate
- nhibernate
- orm
- n+1
- lazy loading

### Category E - Collections
- collections
- enumeration
- ienumerable
- list

### Category B - WCF Patterns
- wcf
- soap
- service contract
- data contract

### Category G - Code Quality
- code quality
- solid
- dry
- clean code

### Category D - Logging
- logging
- structured logging
- log
- splunk

### Category U - Error Handling
- error handling
- fault contract
- exception handling

### Category R - Configuration
- configuration
- config
- appsettings
- feature flags

### Category J - Performance
- performance
- optimization
- caching
- query performance

### Category I - Security
- security
- auth
- authorization
- sql injection
- xss

### Category H - Test Coverage
- test coverage
- tests
- unit test
- integration test

### Category P - Concurrency
- concurrency
- thread safety
- race condition
- lock

### Category V - Observability
- observability
- monitoring
- metrics
- health check
- telemetry

---

## Compound Skill Routing Triggers

### ReviewNet + Architect
**Triggers:** Design review with standards validation

**Keywords:**
- design review with standards
- architect review with guidelines
- architectural review

**Example:**
```
codenova, design review with standards pr 12345
```

### ReviewNet + OHIP
**Triggers:** OHIP implementation with standards check

**Keywords:**
- ohip review
- ohip compliance review
- validate ohip implementation

**Example:**
```
codenova, ohip compliance review pr 12345
```

### ReviewNet + Tax
**Triggers:** Tax logic with standards validation

**Keywords:**
- tax logic review
- tax implementation review

**Example:**
```
codenova, tax implementation review pr 12345
```

---

## Guard Keywords (Route Away from ReviewNet)

### Route to Tax Skill
- tax
- taxrule
- taxcalculator
- tax engine
- tax computation

### Route to OHIP Skill
- ohip
- dumboBroker
- neweventtype
- ohip flow
- ohip mandatory

### Route to Architect Skill
- architect
- archon
- ad2
- adr
- son
- srd
- deconstruct
- split

### Route to SynXisNom Skill
- nomenclature
- app id
- synxisnom
- naming convention
- synxis terms

---

## Impact Analysis Triggers

**Route:** Impact Analysis Only (No Standards Check)

**Keywords:**
- impact analysis
- blast radius
- caller impact
- downstream callers
- upstream callers
- transitive impact
- dependency impact

**Example:**
```
codenova, impact analysis for method ProcessReservation
```

**Execution:** Do not load standards files, focus on dependency tracing.

---

## Checklist vs Guidelines Routing

### Checklist Route (Quick Gate)
**Keywords:**
- checklist
- quick gate
- pre-submit
- review gate

**Load:** `PR_CHECKLIST.md` only

### Guidelines Route (Deep Standards)
**Keywords:**
- guideline
- guidelines
- deep review
- full standards
- category A-W
- detailed review

**Load:** `REVIEW_GUIDELINES.md` or category-specific files

---

## Confidence-Based Escalation Triggers

### Low Confidence Triggers (Load Nested Files)
- uncertain
- need more context
- unclear
- ambiguous
- not sure

### High Confidence (Primary File Sufficient)
- straightforward
- clear violation
- obvious issue

---

## Output Template Selection

### Template A - Quick Checklist
**Triggers:** quick, checklist, pre-commit

### Template B - Full Standards Review
**Triggers:** comprehensive, full, e2e, guidelines

### Template C - Impact Analysis
**Triggers:** impact, blast radius, callers

### Template D - Phased Review
**Triggers:** phased, progressive, staged

---

## Context Keywords (Auto-Detect Phase)

### Keywords that Trigger Phase 2 (Contract)
- dto
- api
- endpoint
- service contract
- wsdl
- swagger
- openapi

### Keywords that Trigger Phase 3 (Business)
- service layer
- business logic
- domain
- validator
- repository

### Keywords that Trigger Phase 5 (NFR)
- performance
- security
- test
- concurrency
- monitoring

---

## Example Composite Triggers

### Example 1: Quick Safety + Contract Review
```
codenova, quick review pr 12345 with breaking change check
```
**Execution:** Phase 1 + Category K only

### Example 2: Comprehensive Review with Focus
```
codenova, comprehensive review pr 12345 focusing on null safety and performance
```
**Execution:** Phase 1-5, highlight Categories N and J

### Example 3: Category-Specific Review
```
codenova, review pr 12345 for external integration resilience
```
**Execution:** Phase 1 + Category W only

---

## Negative Triggers (Suppress Review)

### Keywords that STOP Review:
- explain (route to ask/discover)
- what is (route to ask)
- how does (route to ask)
- show me (route to file display)

**Explanation:** These are informational requests, not code reviews.
