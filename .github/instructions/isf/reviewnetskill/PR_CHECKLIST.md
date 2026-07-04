# SynXis PR Review  Quick Gate Checklist

**Usage:** Scan a PR diff against this checklist before approval. Any  = block.  
**Full rules:** `REVIEW_GUIDELINES.md`
**Test audit:** CodeNova automatically checks test coverage for every `.cs` file in the diff (see H rules in `REVIEW_GUIDELINES.md`).

---

## ⚠️ Pre-PR Submission Compliance (MANDATORY — Check Before Opening PR)

**These gates must be satisfied BEFORE a PR is opened. They are process requirements, not code review findings.**

| # | Check | Owner | Gate |
|---|---|---|---|
| PRE-1 | CodeNova analysis completed: defect root cause or story AC alignment confirmed and documented | Developer | Block if missing |
| PRE-2 | Unit tests added: all new methods and modified branches have corresponding tests with >= 80% coverage | Developer | Block if missing |
| PRE-3 | Tested use-case summary generated: list of test scenarios, pass/fail results, Rally-ready text block attached | Developer | Block if missing |
| PRE-4 | Performance validation completed: hot-path impact, regression risks, and go/no-go signal produced | Developer | Block if missing |

**Process:** Use CodeNova to generate outputs for PRE-1, PRE-3, and PRE-4. Attach all summaries to the PR description before submission. Reference Rally item in the PR title.

---

## Async
| # | Check | Rule |
|---|---|---|
| A1 | All `await` in library code use `.ConfigureAwait(false)` | A1 |

## WCF / Service Removal
| # | Check | Rule |
|---|---|---|
| B1 | No `using System.ServiceModel`, `FaultException<T>`, or `WCFMetadata` | B1 |
| B2 | No `ChannelFactory` or `net.pipe` in libraries | B2 |
| B3 | No `serviceLocator.CloseProxy(...)` calls | B3 |
| B4 | No empty `try/finally` blocks left after WCF removal | B4 |
| B5 | No cross-service activation via proxies within same app boundary | B5 |

## Dependency Injection
| # | Check | Rule |
|---|---|---|
| C1 | `GetInstance<TImpl>()` used  not `CreateService<TInterface>()` | C1 |
| C2 | Translator factories accept `IServiceLocator` | C2 |
| C3 | No Spring.NET `ContextRegistry` in .NET 8+ projects | C3 |

## Logging
| # | Check | Rule |
|---|---|---|
| D1 | `ILogStatsWrapper` used  not `ILogWrapper` | D1 |
| D2 | `Synxis.Enterprise.Logging` imported  not `ServiceFx.Logging` | D2 |
| D3 | `ActivityId` passed to `StartChronicle` | D3 |
| D4 | `ActivityId` passed to `StartEvent` | D4 |
| D5 | `ActivityId` passed to `Info` log calls | D5 |
| D6 | `ActivityId` passed to `Error` log calls | D6 |
| D7 | Every `StartChronicle` has matching `EndChronicle` in `finally` | D7 |

## Collections & LINQ
| # | Check | Rule |
|---|---|---|
| E1 | `IsNullOrWhiteSpace` used  not `IsNullOrEmpty` for strings | E1 |
| E2 | `IsNotNullOrEmptyForICollection` used for materialized collections | E2 |
| E3 | `.ToList()` called before loops; no `.Count()` in loop conditions | E3 |
| E4 | `ServiceFx.Extensions` preferred over `Enterprise.Common` for conflicts | E4 |

## NHibernate
| # | Check | Rule |
|---|---|---|
| F1 | No long-lived `ISession` field references | F1 |
| F2 | Single-field lookups use `.Select()` projection | F2 |
| F3 | Paging uses `SetFirstResult` / `SetMaxResults` | F3 |

## Code Quality
| # | Check | Rule |
|---|---|---|
| G1 | No empty `finally` blocks left after WCF proxy removal | G1 |
| G2 | No commented-out code committed | G2 |

---

##  Test Coverage (BLOCKING  all must pass before approval)

> **CodeNova will run the test audit automatically for every  below and generate missing test stubs.**

| # | Check | Rule |
|---|---|---|
| H1 | Every new public method has at least one unit test | H1 |
| H2 | Both success and failure paths are covered for methods with branches/catch | H2 |
| H3 | All config-read helpers (`GetXxx` from `AppSettings`) test both configured and default (missing/unparseable key) paths | H3 |
| H4 | Test methods follow `MethodName_ExpectedResult_WhenCondition` naming; AAA structure enforced | H4 |
| H5 | Reconnect / cooldown / circuit-breaker paths have dedicated tests (cooldown active, expired, reset on success, set on failure) | H5 |
| H6 | New/modified files reach  80% line+branch coverage; CodeNova lists methods with no detected test | H6 |
| H6 | Test project for the changed assembly exists in workspace; if not, it is flagged as a blocker | H6 |

### CodeNova Test Audit Output Format
For each changed `.cs` file, report:
```
File: ActiveMqQueue.cs
   GetRetryDelay              ActiveMqQueueTests.GetRetryDelay_*
   GetPayloadSize             happy path only; missing null-input test
   GetReconnectAfterFailure   no test found
   IsFailoverTransport         no test found

Generated stubs:
  [Test] GetReconnectAfterFailure_ReturnsConfiguredValue_WhenKeyPresent() { }
  [Test] GetReconnectAfterFailure_ReturnsDefault1Min_WhenKeyAbsent() { }
  [Test] IsFailoverTransport_ReturnsTrue_WhenAddressStartsWithFailover() { }
  [Test] IsFailoverTransport_ReturnsFalse_WhenAddressIsPlainTcp() { }
```

---

## General Gate
- No hardcoded connection strings or credentials  
- `HttpClient` is singleton  not created per-request  
- `using` applied to all `IDisposable` resources  
- XML docs on all public types/members  
- Test project referenced in solution file

---

##  Security (BLOCKING)

| # | Check | Rule |
|---|---|---|
| I1 | No hardcoded passwords, API keys, tokens, or connection string values in source | I1 |
| I2 | No PII, card data, passwords, or auth tokens written to any logger/log sink | I2 |
| I3 | All DB queries use NHibernate LINQ, criteria, or named parameters  no string-concatenated SQL | I3 |
| I4 | All public service entry points validate inputs and return `OperationResult` for invalid input | I4 |
| I5 | No `TypeNameHandling.All` or `TypeNameHandling.Auto` on JSON deserialization of untrusted input | I5 |
| I6 | Check-then-act patterns on shared mutable state are guarded by a single lock (no TOCTOU) | I6 |

---

##  Performance & Complexity

| # | Check | Severity | Rule |
|---|---|---|---|
| J1 | No `Task.Result` or `.Wait()` in async call paths |  Block | J1 |
| J2 | No nested loops over same/related collections  use `Dictionary`/`HashSet` lookup |  Warn | J2 |
| J3 | No I/O, DB calls, or long-running operations inside `lock` scope |  Block | J3 |
| J4 | No string concatenation in loops  `StringBuilder` used |  Warn | J4 |
| J5 | Frequently used `Regex` patterns are `static readonly` with `RegexOptions.Compiled` |  Warn | J5 |
| J6 | `ConfigurationManager.AppSettings` reads in hot paths cached in `static readonly` fields |  Warn | J6 |

---

##  SOLID & Design Principles

| # | Check | Severity | Rule |
|---|---|---|---|
| K1 | Classes with 5+ unrelated responsibilities flagged for extraction (SRP) |  Warn | K1 |
| K2 | No `if/else` or `switch` on type tags  prefer strategy dispatch (OCP) |  Warn | K2 |
| K3 | Overrides do not weaken base contract  no new exceptions, stricter preconditions (LSP) |  Block | K3 |
| K4 | Interfaces with 7+ methods not all implemented together flagged for splitting (ISP) |  Warn | K4 |
| K5 | All constructor parameters and method signatures in library code use interface types (DIP) |  Block | K5 |

---

##  Maintainability & Resilience

| # | Check | Severity | Rule |
|---|---|---|---|
| L1 | No bare `catch (Exception)` that swallows silently  must log with full detail + rethrow or convert |  Block | L1 |
| L2 | No magic strings or magic numbers in logic  use named constants, enums, or config keys |  Warn | L2 |
| L3 | No method with cyclomatic complexity > 10  refactor into named sub-methods |  Warn | L3 |
| L4 | All `IDisposable` resources use `using` or `try/finally`  no bare instantiation |  Block | L4 |
| L5 | No inheritance chain deeper than 3 levels (excluding framework base classes) |  Warn | L5 |
| L6 | No `throw new Exception(...)` or `throw new ApplicationException(...)`  use domain-typed exceptions |  Block | L6 |

---

## AD2 Document Review (intent: `ad2-review`)

> Load Category M from `REVIEW_GUIDELINES.md` for full rules and output formats.

| # | Check | Severity | Rule |
|---|---|---|---|
| M1 | Every domain team impacted by the feature has at least one explicit task listed |  Block | M1 |
| M2 | AD2 includes requirements traceability, NFR section, security/data handling, and rollback strategy |  Block (security/traceability missing) | M2 |
| M3 | Every domain team task has description, owner, size signal, and at least one acceptance criterion |  Warn | M3 |

**Verdict output:** `pass` / `pass with warnings` / `block` + Domain Team Coverage Matrix + Standards Compliance table.

---

## Impact Analysis and Blast Radius (intent: `impact-analysis`)

> Load Category N from `REVIEW_GUIDELINES.md` for full output formats.

| # | Check | Severity | Rule |
|---|---|---|---|
| N1 | All HIGH-risk callers in blast-radius matrix have corresponding regression test scenarios |  Block | N1 |
| N2 | Release risk levels assigned per impact category (critical/high/medium/low/none) |  Required | N2 |
| N3 | If HIGH or CRITICAL risk present: coordinated rollout plan with feature flag or staged enablement |  Block | N3 |

**Output:** Caller Blast-Radius Matrix + Release Risk Summary + (if HIGH/CRITICAL) Rollout Sequence.

---

## Architectural Compliance Drift (intent: `compliance-drift`)

> Load Category O from `REVIEW_GUIDELINES.md` for full output formats.

| # | Check | Severity | Rule |
|---|---|---|---|
| O1 | All deviations from approved AD2 decisions are identified with severity |  Required | O1 |
| O2 | Every HIGH or MEDIUM finding has a corrective action with owner, timeline, and validation step |  Block (if HIGH uncorrected) | O2 |
| O3 | Governance verdict issued: APPROVE / CONDITIONAL / REDESIGN |  Required | O3 |

**Verdict:** `APPROVE` / `CONDITIONAL` / `REDESIGN` — any HIGH finding without corrective action = `REDESIGN` minimum.

---

## Feature Health and Release Gate (intent: `release-gate`)

> Load Category P from `REVIEW_GUIDELINES.md` for full output formats.

| # | Check | Severity | Rule |
|---|---|---|---|
| P1 | Feature health dashboard produced: RAG status per feature with top unresolved risks |  Required | P1 |
| P2 | All six quality gates evaluated; go/no-go verdict with confidence level issued |  Block (fail gate = NO-GO) | P2 |
| P3 | Rollback mechanism identified; data and contract safety confirmed |  Required | P3 |

**Quality gates for go/no-go (all must PASS for GO):**
- Test coverage >= 80% for all changed files (H6)
- No unresolved security findings (I*)
- No HIGH blast-radius callers without regression tests (N1)
- No HIGH drift findings without corrective actions (O1)
- Domain team coverage complete — no uncovered teams (M1)
- Feature flag or rollback strategy present for risky changes (M2)
