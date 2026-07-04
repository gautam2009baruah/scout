---
description: "Comprehensive PR review with progressive disclosure, compound skill routing, and structured breaking change detection"
applyTo: "**"
triggers:
  - "comprehensive review pr"
  - "review pr"
  - "review and detect breaking change"
  - "review branch"
  - "comprehensive review branch"
skills:
  - "reviewnet-skill"
  - "architect-skill"
  - "impact-analysis"
strategy: "backend-assisted-copilot"
disclosure: "progressive"
---

# Comprehensive PR Review Protocol

Execute a multi-dimensional PR review with progressive disclosure, compound skill routing for review standards + architecture analysis + impact detection, and structured categorical output.

## Usage Patterns (All trigger this protocol)

```
codenova, comprehensive review pr [NUMBER]
codenova, review pr [NUMBER]
codenova, review e2e pr [NUMBER]
codenova, e2e review pr [NUMBER]
codenova, review and detect breaking change pr [NUMBER]
codenova, comprehensive review branch [BRANCH_NAME]
codenova, review branch [BRANCH_NAME]
```

## Progressive Disclosure Control Flow

1. **Load PR Diff** → Extract changed files and modification fingerprint
2. **Classify Change Type** → Determine review depth (contract change, logic change, config change)
3. **Load Primary Concern** → reviewnet-skill (coding standards), architect-skill (design patterns), or impact-analysis
4. **Load Nested Context** → Only if low confidence or breaking change detected
5. **Format Response** → Use structured categorical output (A-L)

## Review Dimensions

### 1. CHANGE FINGERPRINTING

**Identify all modifications:**
- Modified files, classes, methods, properties, and fields
- New dependencies or removed dependencies
- Configuration changes (web.config, app.config, DI registrations)
- Database schema changes (NHibernate mappings, SQL scripts)
- DTOs, contracts, data models, and API surface changes
- Null-safety changes (new nullables, removed null checks, nullable annotations)
- Access modifier changes (public → private, internal → public)
- Return type changes (concrete → nullable, collection → single)
- Method signature changes (parameters added/removed/reordered)

**Flag semantic behavior changes:**
- Methods that previously threw exceptions now return null
- Methods that returned empty collections now return null
- Properties that were always populated now can be null
- Validation logic removed or relaxed
- Business rules modified or bypassed

---

### 2. DOWNSTREAM IMPACT ANALYSIS

**Consumer Discovery:**
- Find ALL files that reference changed classes, methods, or properties
- Identify all mappers, translators, and adapters consuming these DTOs
- Locate AutoMapper profiles and manual mapping code
- Find API clients (SOAP, REST, GraphQL) using modified contracts
- Trace to presentation layers (WebAPI, Frontman, SOAP services)

**Null-Safety Validation:**
- Check consuming code for null-conditional operators (`?.`, `??`)
- Verify null checks exist before accessing modified nullable properties
- Validate defensive coding patterns in downstream consumers
- Flag direct property access without null guards
- Identify potential `NullReferenceException` sites

**Layer-by-Layer Impact:**
- **Data Layer**: NHibernate mappings, repository queries, stored procedures
- **Domain Layer**: Business logic, validators, domain services
- **Service Layer**: Application services, DTOs, mappers
- **API Layer**: WebAPI controllers, SOAP services, response builders
- **Presentation Layer**: Frontman, views, client-side code

---

### 3. UPSTREAM DEPENDENCY ANALYSIS

**Input Validation Chain:**
- Trace call chain from entry points (v1/v2 services, SOAP endpoints, WebAPI controllers)
- Validate upstream null guards and input validation exist
- Check for missing validation that could propagate nulls downstream
- Verify DTOs have required field annotations (`[Required]`, `[NotNull]`)
- Confirm constructor parameter validation

**Data Source Verification:**
- Check if upstream data sources (database, external APIs) guarantee non-null
- Verify ORM mappings align with database nullable constraints
- Validate external API contracts match internal expectations
- Confirm cache invalidation strategy if data contracts changed

**Cross-Layer Contract Alignment:**
- Ensure SOAP contracts align with internal DTOs
- Verify OTA (OpenTravel Alliance) spec compliance for hospitality APIs
- Check GraphQL schema consistency with domain models
- Validate REST API versioning if breaking changes detected

---

### 4. BREAKING CHANGE DETECTION

**Contract-Level Breaking Changes:**
- Optional fields became required (or vice versa)
- Properties removed from public DTOs
- Enum values added/removed/renamed
- Method signatures changed in public APIs
- Default values changed for optional parameters
- Collection types changed (List → IEnumerable, array → collection)

**Behavioral Breaking Changes:**
- Return null when previously returned empty object/collection
- Throw exceptions where previously returned error codes
- Async methods converted to sync (or vice versa)
- Transaction boundaries modified
- Caching behavior changed
- Event publication/subscription patterns altered

**Data Model Breaking Changes:**
- Database column nullability changed without migration
- Foreign key constraints added/removed
- Unique constraints modified
- Default values changed in schema

**API Versioning Compliance:**
- If v1 API modified: flag as breaking change requiring v2
- If v2 API modified: verify backward compatibility with v1
- If SOAP contract modified: check WSDL version increment
- If shared DTOs modified: verify all consumers can handle change

---

### 5. NON-FUNCTIONAL REQUIREMENTS (NFR) VALIDATION

#### A. ASYNC/AWAIT COMPLIANCE
- [ ] No `Task.Result` or `.Wait()` blocking calls
- [ ] All async methods follow `...Async` naming convention
- [ ] No missing `await` keywords (unawaited async calls)
- [ ] No `async void` except event handlers
- [ ] Proper `ConfigureAwait(false)` in library code
- [ ] No unnecessary `Task.Run` wrapping sync code

#### B. WCF SERVICE PATTERNS
- [ ] Service contracts properly decorated (`[ServiceContract]`, `[OperationContract]`)
- [ ] DataContracts include `[DataMember]` attributes
- [ ] No breaking changes to existing operations (use new operations for breaking changes)
- [ ] Fault contracts defined for expected exceptions
- [ ] Service behavior configurations appropriate (instance mode, concurrency)
- [ ] Bindings align with security/performance requirements

#### C. DEPENDENCY INJECTION (DI)
- [ ] All dependencies injected via constructor
- [ ] No `new` instantiation of services (except DTOs, value objects)
- [ ] Proper lifetime management (Singleton, Scoped, Transient)
- [ ] No service locator anti-pattern
- [ ] Interface-based dependencies, not concrete types
- [ ] DI registration matches actual usage patterns

#### D. LOGGING
- [ ] Structured logging with semantic message templates
- [ ] Log levels appropriate (Debug, Info, Warning, Error, Critical)
- [ ] No sensitive data logged (PII, credentials, tokens)
- [ ] Exception logging includes full stack trace
- [ ] Performance-critical paths avoid verbose logging
- [ ] Correlation IDs propagated across service boundaries

#### E. COLLECTIONS & NHIBERNATE
- [ ] Use `IEnumerable<T>` for read-only sequences
- [ ] Use `ICollection<T>` or `IList<T>` when modification needed
- [ ] Avoid multiple enumeration (materialize with `.ToList()` if needed)
- [ ] NHibernate lazy loading configured intentionally
- [ ] No N+1 query problems (use `.Fetch()` or batch fetching)
- [ ] Session management follows unit-of-work pattern

#### F. CODE QUALITY
- [ ] Follow SynXis C# coding standards (see `.github/instructions/net-standards.instructions.md`)
- [ ] No code duplication (DRY principle)
- [ ] Cyclomatic complexity reasonable (<10 per method)
- [ ] Magic numbers replaced with named constants
- [ ] Proper null-handling patterns (`?.`, `??`, explicit checks)
- [ ] SOLID principles followed

#### G. TEST COVERAGE
- [ ] Unit tests for new business logic (target >80% coverage)
- [ ] Edge cases covered (null, empty, boundary values)
- [ ] Exception paths tested
- [ ] Mock external dependencies appropriately
- [ ] Integration tests for cross-layer interactions
- [ ] Test naming follows convention: `MethodName_Scenario_ExpectedOutcome`

#### H. SECURITY
- [ ] No SQL injection vulnerabilities (parameterized queries only)
- [ ] No XSS vulnerabilities (proper encoding)
- [ ] Authentication/authorization checks at boundaries
- [ ] Sensitive data encrypted at rest and in transit
- [ ] No hardcoded credentials or secrets
- [ ] CSRF protection for state-changing operations
- [ ] Input validation on all external inputs

#### I. PERFORMANCE
- [ ] No inefficient LINQ queries (avoid `.ToList().Where()` chains)
- [ ] Caching used appropriately for expensive operations
- [ ] Database indexes support query patterns
- [ ] No unbounded result sets (pagination implemented)
- [ ] Async I/O for network/database calls
- [ ] Resource disposal via `using` statements

---

### 6. TESTING GAP ANALYSIS

**Unit Test Requirements:**
- List new methods/classes without corresponding unit tests
- Identify edge cases not covered by existing tests
- Flag null-handling scenarios requiring tests
- Highlight exception paths needing coverage

**Integration Test Scenarios:**
- End-to-end flows across modified layers
- Cross-service communication if APIs changed
- Database interaction if mappings/queries changed
- External API integration if contracts modified

**Regression Test Candidates:**
- Scenarios where existing behavior might break
- Legacy code paths affected by refactoring
- Backward compatibility tests for versioned APIs

---

### 7. ARCHITECTURAL COMPLIANCE

**Layer Separation:**
- No data layer logic in presentation layer
- No presentation concerns in domain layer
- DTOs only used for data transfer (no business logic)
- Domain models independent of infrastructure

**Design Patterns:**
- Repository pattern used correctly
- Factory pattern for complex object creation
- Strategy pattern for polymorphic behavior
- Observer pattern for event-driven flows

**OHIP Compliance (if applicable):**
- Check against OHIP mandatory flows if tax logic involved
- Verify transaction boundaries align with OHIP requirements
- Validate error handling follows OHIP conventions

---

## Structured Output Format (Categorical A-M)

### Executive Summary

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

### 🔴 CRITICAL ISSUES (BLOCKS MERGE)

| # | Issue | File | Category | Impact | Risk | Fix |
|---|-------|------|----------|--------|------|-----|
| 1 | [Issue Title] | [file.cs](path#L10-L15) | [A-M] | [downstream/upstream] | NullRef/Contract/Data Loss | [remediation] |
| 2 | [Issue Title] | [file.cs](path#L20-L25) | [A-M] | [impact] | [risk type] | [remediation] |

---

### 🟠 HIGH PRIORITY (PRODUCTION RISK)

| # | Issue | File | Category | Impact | Risk | Recommendation |
|---|-------|------|----------|--------|------|----------------|
| 1 | [Issue Title] | [file.cs](path#L30) | [A-M] | [impact] | [risk] | [fix] |

---

### 🟡 MEDIUM PRIORITY (TECH DEBT)

| # | Issue | File | Category | Type | Recommendation |
|---|-------|------|----------|------|----------------|
| 1 | [Issue Title] | [file.cs](path#L40) | [A-M] | Tech Debt | [fix] |

---

### 🟢 LOW PRIORITY (SUGGESTIONS)

| # | Suggestion | File | Category | Benefit |
|---|-----------|------|----------|----------|
| 1 | [Suggestion] | [file.cs](path#L50) | [A-M] | [benefit] |

---

## 📊 CATEGORICAL VALIDATION (A-W)

### Categorical Summary Table (23 Categories - Phased Execution)

| Category | Name | Phase | Status | Issues | Critical | Notes |
|----------|------|-------|--------|--------|----------|-------|
| **A** | Async/Await | 1 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **B** | WCF Patterns | 3 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **C** | Dependency Injection | 1 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **D** | Logging | 4 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **E** | Collections | 3 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **F** | NHibernate | 3 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **G** | Code Quality | 4 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **H** | Test Coverage | 5 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **I** | Security | 5 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **J** | Performance | 5 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **K** | Breaking Changes | 2 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **L** | Impacted Endpoints | 2 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **M** | Backward Compatibility | 2 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **N** | Null Safety & Reference Handling | 1 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **O** | Resource Management & Disposal | 1 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **P** | Concurrency & Thread Safety | 5 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **Q** | Data Validation & Business Rules | 3 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **R** | Configuration & Feature Flags | 4 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **S** | Database Schema & Migrations | 1 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **T** | API Versioning & Contract Evolution | 2 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **U** | Error Handling & Fault Contracts | 4 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **V** | Observability & Monitoring | 5 | ✅🟡⚠️ | [count] | [count] | [summary] |
| **W** | External Integrations & Resilience | 2 | ✅🟡⚠️ | [count] | [count] | [summary] |

---

### **A - Async/Await Compliance**
- [ ] No `Task.Result` or `.Wait()` blocking calls
- [ ] All async methods follow `...Async` naming
- [ ] No missing `await` keywords
- [ ] No `async void` except event handlers
- [ ] Proper `ConfigureAwait(false)` in library code
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **B - WCF Service Patterns**
- [ ] Service contracts properly decorated
- [ ] DataContracts include `[DataMember]`
- [ ] No breaking changes to operations
- [ ] Fault contracts defined
- [ ] Service behavior configurations appropriate
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **C - Dependency Injection (DI)**
- [ ] All dependencies injected via constructor
- [ ] No `new` instantiation of services
- [ ] Proper lifetime management
- [ ] No service locator anti-pattern
- [ ] Interface-based dependencies
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **D - Logging**
- [ ] Structured logging with semantic templates
- [ ] Log levels appropriate
- [ ] No sensitive data logged (PII, credentials)
- [ ] Exception logging includes stack trace
- [ ] Correlation IDs propagated
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **E - Collections Handling**
- [ ] Use `IEnumerable<T>` for read-only sequences
- [ ] Use `ICollection<T>` when modification needed
- [ ] Avoid multiple enumeration (materialize with `.ToList()`)
- [ ] Collection references never nullable
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **F - NHibernate Patterns**
- [ ] Lazy loading configured intentionally
- [ ] No N+1 query problems
- [ ] Session management follows unit-of-work
- [ ] Proper transaction boundaries
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **G - Code Quality**
- [ ] Follow SynXis C# coding standards
- [ ] No code duplication (DRY)
- [ ] Cyclomatic complexity reasonable (<10)
- [ ] Magic numbers replaced with constants
- [ ] Proper null-handling patterns (`?.`, `??`)
- [ ] SOLID principles followed
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **H - Test Coverage**
- [ ] Unit tests for new business logic (>80%)
- [ ] Edge cases covered (null, empty, boundary)
- [ ] Exception paths tested
- [ ] Mock external dependencies
- [ ] Integration tests for cross-layer interactions
- [ ] Test naming: `MethodName_Scenario_ExpectedOutcome`
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]  
**Coverage Gap**: [percentage or test scenarios missing]

---

### **I - Security**
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Authentication/authorization checks at boundaries
- [ ] Sensitive data encrypted
- [ ] No hardcoded credentials or secrets
- [ ] CSRF protection for state-changing operations
- [ ] Input validation on all external inputs
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **J - Performance**
- [ ] No inefficient LINQ queries
- [ ] Caching used appropriately
- [ ] Database indexes support query patterns
- [ ] No unbounded result sets (pagination)
- [ ] Async I/O for network/database calls
- [ ] Resource disposal via `using`
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **K - Breaking Changes**
**Status**: [✅ NONE | ⚠️ DETECTED]

#### **Contract-Level Breaking Changes:**
- [ ] Optional fields became required (or vice versa)
- [ ] Properties removed from public DTOs
- [ ] Enum values added/removed/renamed
- [ ] Method signatures changed in public APIs
- [ ] Default values changed
- [ ] Collection types changed

#### **Behavioral Breaking Changes:**
- [ ] Return null when previously returned empty object/collection
- [ ] Throw exceptions where previously returned error codes
- [ ] Async methods converted to sync (or vice versa)
- [ ] Transaction boundaries modified
- [ ] Caching behavior changed

#### **Data Model Breaking Changes:**
- [ ] Database column nullability changed
- [ ] Foreign key constraints added/removed
- [ ] Unique constraints modified
- [ ] Default values changed in schema

**Breaking Changes List**:
1. [Description] - [Migration Path]

---

### **L - Impacted Endpoints**
**Total Endpoints Affected**: [count]

| Endpoint Type | Method/Operation | Endpoint | Impact | Risk Level |
|---------------|------------------|----------|--------|------------|
| WebAPI v1 | GET/POST/PUT/DELETE | `/api/v1/[endpoint]` | [description] | 🔴🟠🟡🟢 |
| WebAPI v2 | GET/POST/PUT/DELETE | `/api/v2/[endpoint]` | [description] | 🔴🟠🟡🟢 |
| SOAP Service | [Operation] | `[ServiceName].[OperationName]` | [description] | 🔴🟠🟡🟢 |
| Internal Service | [Method] | `[ServiceClass].[MethodName]` | [description] | 🔴🟠🟡🟢 |
| Database | SP/Query | `[StoredProcedure]` | [description] | 🔴🟠🟡🟢 |
| Message Queue | Publish/Subscribe | `[Queue/Topic/Event]` | [description] | 🔴🟠🟡🟢 |

**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **M - Backward Compatibility**
**Status**: [✅ COMPATIBLE | ⚠️ ISSUES DETECTED | ➖ N/A]

#### **API Version Compatibility:**
- [ ] v1 API contracts unchanged or properly versioned
- [ ] v2 API maintains backward compatibility with v1 clients
- [ ] No removal of public endpoints without deprecation
- [ ] New required fields have defaults or are optional
- [ ] Response schemas remain compatible

#### **Client Compatibility:**
- [ ] Existing client code will not break
- [ ] Mobile app versions supported (check minimum version)
- [ ] Third-party integrations validated
- [ ] Partner API consumers notified of changes
- [ ] Legacy clients can still function

#### **Database Schema Compatibility:**
- [ ] No destructive migrations (column drops without migration path)
- [ ] New NOT NULL columns have defaults
- [ ] Renamed columns have backward-compatible views/aliases
- [ ] Old stored procedures still functional
- [ ] Data migration scripts provided

#### **Configuration Compatibility:**
- [ ] New config settings have sensible defaults
- [ ] Old config keys still recognized
- [ ] Environment-specific settings documented
- [ ] Feature flags for gradual rollout

#### **Dependency Compatibility:**
- [ ] NuGet package version changes are non-breaking
- [ ] Shared library changes maintain compatibility
- [ ] Internal service contract changes versioned
- [ ] External API integrations validated

**Compatibility Issues Table:**

| # | Issue | Type | Affected Clients | Migration Path | Risk |
|---|-------|------|------------------|----------------|------|
| 1 | [Issue] | API/DB/Config/Dependency | [client list] | [migration steps] | 🔴🟠🟡 |
| 2 | [Issue] | [type] | [clients] | [steps] | 🔴🟠🟡 |

**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

---

### **N - Null Safety & Reference Handling** (CRITICAL - Phase 1)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Critical Checks:**
- [ ] Nullable reference types enabled (`<Nullable>enable</Nullable>`)
- [ ] Nullable annotations correct (`?` vs `!` suppression)
- [ ] Null checks before property access
- [ ] Defensive coding for external API responses
- [ ] DTO property nullability matches database schema
- [ ] Collection initialization (never null, use empty collection)
- [ ] No potential `NullReferenceException` sites

**Null-Safety Patterns:**
- [ ] Null-conditional operator used (`?.`)
- [ ] Null-coalescing operator used (`??`, `??=`)
- [ ] Explicit null checks for critical paths
- [ ] Guard clauses at method entry
- [ ] Pattern matching with null checks (`is null`, `is not null`)

**Issues Found**: [count] | **Critical**: [count]

---

### **O - Resource Management & Disposal** (CRITICAL - Phase 1)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **IDisposable Implementation:**
- [ ] All `IDisposable` resources wrapped in `using` statements
- [ ] Async disposal (`IAsyncDisposable`, `await using`)
- [ ] No manual `Dispose()` without null checks
- [ ] Dispose methods are idempotent

#### **Resource Types:**
- [ ] Database connections properly closed/disposed
- [ ] File handles released in all paths
- [ ] HTTP clients properly managed (singleton pattern)
- [ ] Memory streams disposed
- [ ] WCF client proxies properly closed/aborted
- [ ] Event handlers unregistered (memory leak prevention)

**Issues Found**: [count] | **Critical**: [count]

---

### **P - Concurrency & Thread Safety** (Phase 5)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Thread-Safe Patterns:**
- [ ] No shared mutable static fields without synchronization
- [ ] Thread-safe collections used (`ConcurrentDictionary`, `ConcurrentBag`)
- [ ] No race conditions in lazy initialization
- [ ] Singleton DI registrations are thread-safe
- [ ] `SemaphoreSlim` used for async locking (not `lock`)
- [ ] `Task.WhenAll` for parallel operations
- [ ] Cancellation token propagation

**Issues Found**: [count] | **Critical**: [count]

---

### **Q - Data Validation & Business Rules** (Phase 3)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Validation Requirements:**
- [ ] Required fields validated at API entry points
- [ ] Business rule enforcement (date ranges, numeric constraints)
- [ ] Enum values validated against allowed set
- [ ] Decimal precision appropriate for currency
- [ ] String format validation (email, phone, credit card)
- [ ] Conditional validation rules enforced
- [ ] Cross-field dependencies validated

**Issues Found**: [count] | **Critical**: [count]

---

### **R - Configuration & Feature Flags** (Phase 4)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Configuration Management:**
- [ ] New config keys have defaults or migration scripts
- [ ] No hardcoded environment-specific values
- [ ] Secrets stored in secure vault (not appsettings.json)
- [ ] Feature flags centralized and documented
- [ ] Configuration validation on startup
- [ ] Environment transformation files consistent

**Issues Found**: [count] | **Critical**: [count]

---

### **S - Database Schema & Migrations** (CRITICAL - Phase 1)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Migration Quality:**
- [ ] Migration scripts are idempotent
- [ ] New NOT NULL columns have defaults or are nullable first
- [ ] Index creation for new foreign keys
- [ ] Rollback scripts provided
- [ ] No destructive operations without safeguards
- [ ] Data migration scripts included
- [ ] Performance impact estimated

**Issues Found**: [count] | **Critical**: [count]

---

### **T - API Versioning & Contract Evolution** (Phase 2)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Versioning Strategy:**
- [ ] v1 endpoints unchanged when v2 introduced
- [ ] Versioning mechanism consistent (URL path, header, query param)
- [ ] WSDL version incremented for breaking changes
- [ ] Deprecation headers added (`Deprecation: true`, `Sunset: date`)
- [ ] New properties marked as optional
- [ ] Enum values not removed (only added)

**Issues Found**: [count] | **Critical**: [count]

---

### **U - Error Handling & Fault Contracts** (Phase 4)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Error Handling Patterns:**
- [ ] `[FaultContract]` attributes for WCF expected errors
- [ ] HTTP status codes appropriate (400, 404, 500, 503)
- [ ] Consistent error response schema
- [ ] Correlation IDs in error responses
- [ ] No stack traces exposed to external clients
- [ ] PII not in error messages

**Issues Found**: [count] | **Critical**: [count]

---

### **V - Observability & Monitoring** (Phase 5)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Telemetry Requirements:**
- [ ] Health check endpoints functional
- [ ] Metrics emitted for key operations
- [ ] Distributed tracing context propagated
- [ ] Structured logging used
- [ ] Correlation IDs in all log entries
- [ ] No excessive logging in hot paths
- [ ] No PII in logs

**Issues Found**: [count] | **Critical**: [count]

---

### **W - External Integrations & Resilience** (Phase 2)
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]

#### **Resilience Patterns:**
- [ ] HTTP timeouts configured
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker for failing external services
- [ ] Fallback logic when service unavailable
- [ ] External API versioning validated
- [ ] Rate limiting respected
- [ ] Idempotency tokens for retryable operations

**Issues Found**: [count] | **Critical**: [count]

---

### 🔄 UPSTREAM/DOWNSTREAM IMPACT MAP
```
Entry Points (WebAPI/SOAP/GraphQL)
    ↓
Service Layer (Application Services, DTOs)
    ↓
Domain Layer (Business Logic, Validators)
    ↓
Data Layer (Repositories, NHibernate, Database)
    ↓
External Systems (APIs, Message Queues)

Downstream Consumers:
├─ [Consumer 1] ([file path]) - [Impact]
├─ [Consumer 2] ([file path]) - [Impact]
└─ [Consumer 3] ([file path]) - [Impact]
```

---

### 📋 TESTING GAPS

| Test Type | Count | Scenarios | Priority |
|-----------|-------|-----------|----------|
| **Unit Tests** | [count] | <ul><li>[Scenario 1]</li><li>[Scenario 2]</li></ul> | 🔴🟠🟡 |
| **Integration Tests** | [count] | <ul><li>[Flow 1]</li><li>[Flow 2]</li></ul> | 🔴🟠🟡 |
| **Regression Tests** | [count] | <ul><li>[Case 1]</li><li>[Case 2]</li></ul> | 🔴🟠🟡 |
| **Backward Compatibility Tests** | [count] | <ul><li>[Compatibility scenario]</li></ul> | 🔴🟠🟡 |

---

---

## 🎯 RECOMMENDATION

**[MERGE ✅ | DO NOT MERGE ❌ | MERGE WITH CAUTION ⚠️]**

**Blocking Issues**: [count]  
**Must Fix Before Merge**:
1. [Issue description]
2. [Issue description]

**Estimated Remediation Effort**: [X hours/days]

---

## Execution Strategy (Progressive Disclosure)

### Phase 1: Change Fingerprinting (Always Execute)
1. Parse PR/Branch → Extract changed files and diffs
2. Classify changes → Contract, logic, config, schema
3. Detect patterns → DTO changes, null-safety changes, signature changes

### Phase 2: Primary Analysis (Load Based on Change Type)
- **If Contract Change**: Load reviewnet-skill (standards checklist)
- **If Architecture Change**: Load architect-skill (design patterns)
- **If Logic Change**: Load impact-analysis (upstream/downstream)

### Phase 3: Deep Analysis (Load Only if Triggered)
- **If Breaking Change Detected**: Load full contract comparison
- **If Low Confidence**: Load nested skill files
- **If Multiple Consumers Found**: Load cross-reference analysis

### Phase 4: Categorical Validation (A-W) - 5-Phase Execution
Execute 23 category checks in phased order with early exit gates:

**Phase 1 - CRITICAL (Sequential, Early Exit if Fail):**
- N: Null Safety & Reference Handling
- O: Resource Management & Disposal
- C: Dependency Injection
- S: Database Schema & Migrations
- A: Async/Await Compliance

**Phase 2 - CONTRACTS (Sequential, Flag Breaking Changes):**
- K: Breaking Changes
- T: API Versioning & Contract Evolution
- L: Impacted Endpoints
- M: Backward Compatibility
- W: External Integrations & Resilience

**Phase 3 - BUSINESS LOGIC (Parallel OK):**
- Q: Data Validation & Business Rules
- F: NHibernate Patterns
- E: Collections Handling
- B: WCF Service Patterns

**Phase 4 - QUALITY (Parallel OK):**
- G: Code Quality
- D: Logging
- U: Error Handling & Fault Contracts
- R: Configuration & Feature Flags

**Phase 5 - NFR (Parallel OK):**
- J: Performance
- I: Security
- H: Test Coverage
- P: Concurrency & Thread Safety
- V: Observability & Monitoring

**Early Exit Strategy:**
- If Phase 1 has critical blockers → STOP, report, request fixes
- If Phase 2 has breaking changes → Flag for versioning review
- Phases 3-5 run to completion (accumulate findings)

### Phase 5: Synthesis & Prioritization
- Rank findings by severity (Critical → Low)
- Generate categorical report (A-W, 23 categories)
- Group by execution phase (Phase 1-5)
- Provide actionable remediation steps
- Estimate effort and impact
- Apply response template from `response-templates-enhanced.md`

---

## Compound Skill Workflow

This protocol triggers **compound skill routing** when multiple domain areas are detected:

1. **reviewnet-skill** → Coding standards validation (C#, LINQ, null-safety)
2. **architect-skill** → Design pattern compliance (layer separation, SOLID)
3. **impact-analysis** → Upstream/downstream dependency tracing
4. **ohip-skill** → (If tax logic detected) OHIP compliance validation
5. **tax-skill** → (If tax code detected) Tax calculation verification

**Execution Model**:
- Run skills in parallel where possible
- Evidence from one skill feeds into next
- Final synthesis combines all findings
- Output follows A-L categorical structure

---

## Confidence Levels

- **HIGH** 🟢: Used semantic search + file analysis + cross-references + skill validation
- **MEDIUM** 🟡: Used pattern matching + heuristics + partial skill coverage
- **LOW** 🔴: Limited to changed files only, may have missed consumers

---

## Routing Triggers

This protocol is invoked by ANY of these patterns:

```
codenova, comprehensive review pr <number>
codenova, review pr <number>
codenova, review and detect breaking change pr <number>
codenova, comprehensive review branch <branch>
codenova, review branch <branch>
```

**Canonical Intent**: `comprehensive-pr-review`  
**Strategy**: `backend-assisted-copilot`  
**Disclosure**: `progressive`  
**Skills**: `reviewnet`, `architect`, `impact-analysis`, `(conditional: ohip, tax)`

---

## Notes

- Requires PR number or branch name as input
- Reviews both local branches and GitHub PRs
- Uses progressive disclosure to avoid loading unnecessary context
- Triggers compound skill workflow when multiple domains detected
- Output can be stamped to PR description after approval
- Breaking change detection is mandatory for all reviews
- Impacted endpoints are always identified and listed

---

## 🎯 MANDATORY OUTPUT FORMAT REQUIREMENTS

**CRITICAL**: You MUST structure your output exactly as defined in Template B from `.github/instructions/pd/skills/reviewnet/response-templates-enhanced.md`.

### Output Enforcement Rules:

1. **Use Template B (Enhanced)** - ALL output must follow enhanced Template B table structure
2. **ALL findings in tables** - NO free-form narrative sections for findings
3. **Complete all 23 categories (A-W)** - mark ➖ N/A if category not applicable
4. **Include Phase column** - indicate which phase each category belongs to (1-5)
5. **Use file links** with line numbers: `[file.cs](path/file.cs#L10-L15)`
6. **Severity icons required**: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
7. **Final recommendation required**: MERGE ✅ | DO NOT MERGE ❌ | MERGE WITH CAUTION ⚠️
8. **Phase execution summary** - indicate which phases were executed and which were skipped
9. **Early exit reason** - if review stopped at Phase 1 or 2, explain why

### Category Reference Files:
- Phase 1 (Critical): `.github/instructions/pd/skills/reviewnet/categories/critical/`
- Phase 2 (Contracts): `.github/instructions/pd/skills/reviewnet/categories/contracts/`
- Phase 3 (Business): `.github/instructions/pd/skills/reviewnet/categories/business/`
- Phase 4 (Quality): `.github/instructions/pd/skills/reviewnet/categories/quality/`
- Phase 5 (NFR): `.github/instructions/pd/skills/reviewnet/categories/nfr/`

### Category Index:
Full category reference available at: `.github/instructions/pd/skills/reviewnet/CATEGORY_INDEX.md`

### Structure Checklist (ALL Required):

- [ ] Executive Summary Table (8 metrics)
- [ ] Issues by Severity Tables (4 severity levels with prescribed columns)
- [ ] Categorical Summary Table (13 categories A-M)
- [ ] Detailed findings for each A-M category with checklist items
- [ ] Upstream/Downstream Impact Map
- [ ] Testing Gaps Table
- [ ] Backward Compatibility Analysis Table (Category M)
- [ ] Final Recommendation with blocking issues list

### DO NOT:

- ❌ Provide narrative-only reviews without tables
- ❌ Skip any of the 13 categories (A-M)
- ❌ Use bullet lists for findings (use tables)
- ❌ Skip the Executive Summary table
- ❌ Omit line number links for issues
- ❌ Skip the final recommendation
- ❌ Provide only a subset of categories

### Required Table Structures:

**Executive Summary**:
```
| Metric | Count | Status |
```

**Critical Issues Table**:
```
| # | Issue | File | Category | Impact | Risk | Fix |
```

**High Priority Table**:
```
| # | Issue | File | Category | Impact | Risk | Recommendation |
```

**Medium Priority Table**:
```
| # | Issue | File | Category | Type | Recommendation |
```

**Low Priority Table**:
```
| # | Suggestion | File | Category | Benefit |
```

**Categorical Summary**:
```
| Category | Name | Status | Issues | Critical | Notes |
```

**Backward Compatibility Table**:
```
| # | Issue | Type | Affected Clients | Migration Path | Risk |
```

**Testing Gaps Table**:
```
| Test Type | Count | Scenarios | Priority |
```

### All 13 Categories Must Be Included:

- **A** - Async/Await Compliance
- **B** - WCF Service Patterns
- **C** - Dependency Injection
- **D** - Logging
- **E** - Collections Handling
- **F** - NHibernate Patterns
- **G** - Code Quality
- **H** - Test Coverage
- **I** - Security
- **J** - Performance
- **K** - Breaking Changes
- **L** - Impacted Endpoints
- **M** - Backward Compatibility

Each category must have:
1. Checklist items (as defined in sections above)
2. Status: ✅ PASS | ⚠️ FAIL | ➖ N/A
3. Issues Found count
4. Critical Issues count

---

**REMINDER**: This is NOT optional. Template B format is MANDATORY for all comprehensive PR reviews.
