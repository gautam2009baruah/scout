# Universal Code Review Guidelines

**Purpose:** Reusable review template for any programming language, framework, or runtime.  
**Use when:** Reviewing code outside the SynXis-specific .NET rule set, or when a review must adapt to the target language, framework version, architecture style, and team conventions.  
**Output goal:** Produce a review that is precise, risk-ranked, and grounded in the actual project stack rather than generic style advice.

---

## 1. Required Review Inputs

Before reviewing, capture these inputs explicitly:

- Primary language and version: `C# 12`, `Java 21`, `Python 3.12`, `TypeScript 5.x`, `Go 1.23`, `Rust edition 2024`, etc.
- Framework and version: `.NET 8`, `Spring Boot 3.3`, `Django 5`, `FastAPI`, `React 19`, `Next.js 15`, `Angular 18`, `Node 22`, etc.
- Application type: library, service, CLI, batch job, web app, mobile app, data pipeline, infrastructure code.
- Architectural patterns in use: layered, clean architecture, DDD, CQRS, event-driven, hexagonal, MVC, microservices, monolith.
- Existing repo practices: linting rules, formatter, test framework, logging conventions, dependency injection approach, error contract patterns.
- Review scope: PR, branch, file, component, design change, refactor, or defect fix.

If one of these is missing, state the assumption and reduce confidence accordingly.

---

## 2. Review Principles

Apply these principles to every language and framework:

1. Review behavior first, style second.
2. Prefer project-local conventions over generic internet guidance.
3. Treat framework-version constraints as correctness requirements, not optional suggestions.
4. Flag only actionable issues with a concrete reason and expected impact.
5. Distinguish blockers from warnings from optional improvements.
6. Prefer root-cause findings over symptom-level comments.

---

## 3. Framework-Aware Baseline

For every review, check the changed code against the target stack's current practices.

### 3.1 Version Alignment

- Uses APIs compatible with the declared runtime/framework version.
- Avoids deprecated APIs, legacy compatibility shims, and removed lifecycle patterns.
- Follows the dependency and package conventions appropriate for that version.
- Uses the framework's recommended async, concurrency, serialization, configuration, and DI model.

### 3.2 Pattern Alignment

- Matches the repository's established architectural pattern instead of introducing a new one ad hoc.
- Keeps cross-cutting concerns separated: transport, business logic, persistence, mapping, logging, caching, retries.
- Does not bypass established abstractions unless the diff justifies a deliberate exception.
- Keeps framework wiring out of domain logic where the project already separates those concerns.

### 3.3 Operational Alignment

- Preserves observability: logs, metrics, tracing, request correlation, health signals.
- Preserves deployability: configuration, feature flags, migration safety, environment compatibility.
- Preserves supportability: actionable errors, consistent diagnostics, no hidden failure paths.

---

## 4. Core Review Categories

Report findings under these categories when relevant.

### A. Correctness

- Business rules are implemented exactly as intended.
- Boundary conditions are handled: null/none, empty input, zero values, invalid state, duplicates, overflow, time zones, locale.
- State transitions are valid and consistent.
- No silent behavior change in public contracts, schemas, or serialized payloads.

### B. API and Contract Safety

- Public APIs validate inputs at boundaries.
- Response, exception, and error contracts remain consistent.
- Changes are backward compatible, or the breaking change is explicit and versioned.
- Serialization shape changes are intentional and documented.

### C. Concurrency and Async

- No sync-over-async, deadlock-prone blocking, or thread starvation patterns.
- Shared mutable state is protected correctly.
- Locks are scoped minimally and never held over I/O or long-running work.
- Cancellation, timeouts, and retries are handled according to framework norms.

### D. Security and Privacy

- No secrets, credentials, or tokens in source.
- No injection risks: SQL, shell, template, deserialization, path traversal, command execution.
- Authorization and authentication paths are preserved.
- Sensitive data is not logged, leaked in errors, or exposed through debug paths.
- Input validation and output encoding match the transport surface.

### E. Data Access and Persistence

- Queries are parameterized and efficient.
- Transactions are scoped correctly.
- No N+1 queries, full-table scans in hot paths, or in-memory paging over large sets.
- Migrations and schema assumptions are safe for rollout order.
- Caching strategy is correct and invalidation semantics are clear.

### F. Performance and Resource Use

- Hot paths avoid unnecessary allocations, repeated parsing, repeated configuration lookup, and quadratic loops.
- Network, disk, DB, and remote calls are minimized and batched where appropriate.
- Large collections are materialized intentionally.
- IDisposable / resource handles / sockets / streams / cursors are released deterministically.

### G. Resilience and Error Handling

- Exceptions are specific and meaningful for the stack.
- Failures are logged with enough context to debug.
- Retry, fallback, circuit-breaker, idempotency, and cooldown logic behave predictably.
- Partial failure paths do not corrupt state.

### H. Testing and Coverage

- New or modified logic has corresponding tests.
- Branches, failure paths, boundary cases, and regressions are covered.
- Tests follow the repository's naming and structure conventions.
- For framework/config helpers, both configured and fallback behavior are tested.
- If the assembly/module has no nearby test project, flag it explicitly.

### I. Maintainability and Design

- Methods are focused and readable.
- No unnecessary duplication, magic values, or hidden coupling.
- Interfaces and abstractions are appropriately sized.
- Complexity is proportionate to the problem.
- Comments explain non-obvious intent, not obvious syntax.

### J. Framework Idioms

Check the diff against language-specific idioms.

- .NET: async/await, DI, nullable references, logging, disposal, collection materialization.
- Java/Spring: constructor injection, transaction boundaries, record usage, reactive vs blocking boundaries.
- Python: context managers, typing expectations, sync vs async separation, dependency pinning, exception clarity.
- JavaScript/TypeScript: promise handling, React/Vue/Angular idioms, server/client boundaries, type safety, bundling/runtime assumptions.
- Go: context propagation, error wrapping, interface sizing, goroutine lifecycle.
- Rust: ownership-safe API design, error enums, async runtime boundaries, clone and allocation discipline.

If the repository has stronger local conventions, use those instead.

---

## 5. Mandatory Review Questions

Every substantial review should answer these questions:

1. What framework/runtime version assumptions does this change make?
2. Does the change align with the repo's existing architecture and patterns?
3. What can fail at runtime, and is that path observable and tested?
4. What is the security exposure introduced or expanded by this change?
5. What regression surface exists for callers, schemas, configs, jobs, or UI flows?

---

## 6. Severity Model

- `Blocker`: Must be fixed before merge. Causes correctness, security, data integrity, compatibility, or major operability risk.
- `Warning`: Should be fixed before merge unless consciously accepted. Causes maintainability, performance, or resilience risk.
- `Note`: Optional improvement or follow-up, not a merge gate.

---

## 7. Review Output Template

Use this structure for the final review:

```md
## Findings

1. [Severity] Short title
   - Category: Correctness | Security | Testing | Performance | Design | Framework Idioms
   - Why it matters: concrete runtime or maintenance impact
   - Evidence: file/method/behavior observed in the diff
   - Expected fix: concise corrective direction

## Coverage Audit

- MethodOrFlowName: covered | partially covered | no test found
- Missing tests:
  - MethodName_ExpectedResult_WhenCondition

## Assumptions

- Framework version assumed:
- Architectural pattern assumed:
- Confidence: high | medium | low
```

When no findings exist, say so explicitly and still note residual testing or rollout risk.

---

## 8. Language-Specific Deepening Prompts

Use these prompts to adapt the review depth:

- `What changed in the target framework version that makes an older pattern invalid here?`
- `Does this code follow the dependency injection and lifecycle model of this stack?`
- `Is this module mixing transport, domain, and persistence responsibilities against the repo's established pattern?`
- `What tests are missing for new branches, failure paths, and version-specific fallback behavior?`
- `Are there package, runtime, or SDK assumptions that will break in CI or deployment?`

---

## 9. Anti-Patterns to Flag Across Languages

- Hidden breaking changes in public interfaces.
- Blocking calls inside async or event-loop paths.
- String-built queries or commands from user input.
- Hardcoded secrets, endpoints, file paths, or environment-specific values.
- Mutable global state without synchronization or lifecycle control.
- Broad exception swallowing.
- Missing disposal/cleanup for resources.
- Tests that only cover happy paths after behavior changes.
- New patterns introduced without matching existing repo conventions.

---

## 10. Reviewer Discipline

- Do not over-report purely stylistic issues already handled by formatter/linter.
- Do not recommend framework migrations unless the diff already enters that surface or the existing approach is unsafe.
- Do not assume one language's best practice applies to another without checking runtime and framework constraints.
- Prefer one precise finding with a concrete fix over several vague comments.