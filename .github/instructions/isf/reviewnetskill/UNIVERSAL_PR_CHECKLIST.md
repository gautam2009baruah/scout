# Universal PR Review Checklist

**Usage:** Quick review gate for any programming language, framework, or runtime.  
**Companion asset:** `UNIVERSAL_REVIEW_TEMPLATE.md`  
**Goal:** Fast pass/fail screening before deeper review.

---

## Context Capture

- Language and version identified
- Framework/runtime and version identified
- App type identified
- Existing project pattern identified
- Review scope identified

If any of these are unknown, record the assumption before reviewing.

---

## Blocking Gates

| # | Check | Severity |
|---|---|---|
| U1 | Behavior matches intended business logic and public contracts | Blocker |
| U2 | Breaking API/schema/config changes are explicit and version-safe | Blocker |
| U3 | Inputs are validated at boundaries | Blocker |
| U4 | No secrets, tokens, or credentials in source or logs | Blocker |
| U5 | No injection-prone query/command/template construction | Blocker |
| U6 | Concurrency and async usage is safe for the target runtime | Blocker |
| U7 | Error handling does not swallow failures or hide root cause | Blocker |
| U8 | Resource lifecycle is correct: disposal, cleanup, cancellation, shutdown | Blocker |
| U9 | New or changed logic has corresponding tests | Blocker |
| U10 | Framework-version guidance is followed; no deprecated/removed patterns introduced | Blocker |

---

## Warning Gates

| # | Check | Severity |
|---|---|---|
| U11 | Performance-sensitive code avoids repeated I/O, quadratic loops, and unnecessary allocations | Warning |
| U12 | Logging, metrics, and tracing remain sufficient for support and incident diagnosis | Warning |
| U13 | Code follows existing repo architecture and dependency boundaries | Warning |
| U14 | Complexity is reasonable; no oversized methods/classes or ad hoc abstractions | Warning |
| U15 | Magic values and environment-specific constants are avoided | Warning |
| U16 | Tests cover both success and failure paths, not only happy path | Warning |

---

## Framework-Specific Checks

- Async model matches the stack: thread pool, event loop, coroutine, task, goroutine, runtime executor.
- DI/service composition matches the framework's recommended pattern.
- Serialization, validation, and configuration mechanisms are idiomatic for the framework version.
- UI/server/client boundaries are respected where applicable.
- Package/dependency usage is compatible with the declared version and build tool.

---

## Review Result Template

```md
Verdict: pass | pass with warnings | block

Blockers:
- U# Short finding

Warnings:
- U# Short finding

Assumptions:
- Language/framework version:
- Pattern or architecture:
```

Escalate to the full template when any blocker is found or when the change crosses architecture, security, concurrency, persistence, or migration boundaries.