# SynXis .NET Code Review Guidelines

**Source:** SynXis Developer Guide  SynXis platform coding standards  
**Scope:** All C# code in the SynXis workspace. Applies to PR reviews, code generation, and refactoring.  
**Related:** `net-standards.instructions.md` (general C# standards), `codenova.bridge` (domain acronyms)

When reviewing code, list all violations detected with rule number and corrected snippet.

---

## PRE-SUBMISSION PROCESS GATES (Mandatory before PR is opened)

> **These are not code review findings. They are mandatory process compliance checks that must be completed BEFORE a PR is opened.**
> 
> Developers use CodeNova to generate evidence for each gate. Attach all summaries to the PR description as proof of compliance.

| Gate | Evidence Required | Blocker if |
|---|---|---|
| **PRE-1: CodeNova Analysis** | Defect: root cause identified, fix location, implementation plan<br/> Story: AC alignment confirmed, entry points identified, task breakdown | No CodeNova output attached or analysis incomplete |
| **PRE-2: Unit Tests** | All new/modified methods have tests; coverage >= 80% for changed files; test stubs generated for gaps | Unit test count = 0 or coverage < 80% |
| **PRE-3: Tested Use-Case Summary** | List of all use cases tested per scenario; pass/fail per scenario; Rally-ready text block; QA-readable scope summary | No use-case summary or only happy path listed |
| **PRE-4: Performance Validation** | Hot-path impact assessment; regression risk flags; optimization recommendations; go/no-go signal | No performance validation or go signal = NO-GO |

**Reviewer instruction:** Before opening the PR review, ask: "Are all four PRE-gate summaries attached to the PR description?" If any are missing, request them and block the PR from being opened.

---

## Category A  Async

**A1. `ConfigureAwait(false)` in library code**  
All `await` calls in non-UI library code must append `.ConfigureAwait(false)`.
```csharp
//   var result = await SomeLibraryCallAsync();
//   var result = await SomeLibraryCallAsync().ConfigureAwait(false);
```

---

## Category B  WCF / Service Removal

**B1. Remove `System.ServiceModel` dependency**  
No `using System.ServiceModel;`, `FaultException<T>`, `WCFMetadata`, or `<Reference Include="System.ServiceModel" />` in library projects. Replace with `OperationResult.SingleError`.
```csharp
//   throw new FaultException<MyFault>(...);
//   return OperationResult.SingleError(CustomServiceMessages.Error.SystemError, errorMessage);
```

**B2. No `ChannelFactory` / `net.pipe` in libraries**  
Replace `serviceLocator.CreateService<IMyWcfService>()` with constructor-injected interface abstractions.
```csharp
//   var channel = new ChannelFactory<IMyService>(...).CreateChannel();
//   inject IMyService via constructor; register implementation at composition root
```

**B3. Remove `serviceLocator.CloseProxy()`**  
When using direct method calls (not WCF proxies), remove any `CloseProxy` call entirely.

**B4. Remove empty `try/finally` blocks**  
If a `finally` block is empty (typically left after removing `CloseProxy`), remove the entire `try/finally` wrapper.

**B5. No cross-service activation within same application boundary**  
Call methods directly on injected dependencies instead of activating via WCF, NetPipe, or remote proxies.
```csharp
//   var proxy = serviceLocator.CreateService<IRemoteService>(); var result = proxy.GetData();
//   var result = _injectedService.GetData();
```

---

## Category C  Dependency Injection

**C1. Use `GetInstance<TImplementation>()` not `CreateService<TInterface>()`** (when service locator is necessary)
```csharp
//   serviceLocator.CreateService<IMyService>();
//   serviceLocator.GetInstance<MyServiceImpl>();
```

**C2. Translator factories must accept `IServiceLocator`**  
Factories must receive and pass `serviceLocator` so downstream translators can resolve collaborators.

**C3. Use Microsoft DI in .NET 8+ instead of Spring.NET**  
Migrate Spring.NET XML config to `IServiceCollection` / `IServiceProvider`. Prefer constructor injection.
```csharp
//   var svc = (IMyService)ContextRegistry.GetContext().GetObject("myService");
//   inject IMyService via constructor
```

---

## Category D  Logging & Activity Tracking

All logging must carry `IdentityContext.Current.ActivityId` for end-to-end correlation.

**D1. Use `ILogStatsWrapper` (not `ILogWrapper`)**
```csharp
//   LogWrapperProvider.GetLoggerWrapper(typeof(MyClass));
//   LogStatsWrapperProvider.GetLoggerWrapper(typeof(MyClass), IdentityContext.Current.ActivityId);
```

**D2. Use `Synxis.Enterprise.Logging` namespace**  remove `SHS.Platform.ServiceFx.Logging`.

**D3. Pass `ActivityId` to `StartChronicle`**
```csharp
//   logWrapper.StatLogger.StartChronicle("EventType");
//   logWrapper.StatLogger.StartChronicle("EventType", IdentityContext.Current.ActivityId);
```

**D4. Pass `ActivityId` to `StartEvent`**
```csharp
//   chronicle.StartEvent(eventType, "key");
//   chronicle.StartEvent(eventType, "key", "ActivityId".ToKvp(IdentityContext.Current.ActivityId));
```

**D5. Pass `ActivityId` to `Info` logging**
```csharp
//   logWrapper.AppLogger.Info("code", "key".ToKvp(val));
//   logWrapper.AppLogger.Info("code", IdentityContext.Current.ActivityId, "key".ToKvp(val));
```

**D6. Pass `ActivityId` to `Error` logging**
```csharp
//   logWrapper.AppLogger.Error("code", ex, "key".ToKvp(val));
//   logWrapper.AppLogger.Error("code", ex, "ActivityId".ToKvp(IdentityContext.Current.ActivityId));
```

**D7. Always call `EndChronicle` in `finally`**  
Every `StartChronicle` must have a matching `logWrapper.StatLogger.EndChronicle(chronicle)` in a `finally` block.

---

## Category E  Collections & LINQ

**E1. Use `IsNullOrWhiteSpace` not `IsNullOrEmpty`**
```csharp
//   if (s.IsNullOrEmpty())
//   if (s.IsNullOrWhiteSpace()) // or string.IsNullOrWhiteSpace(s)
```

**E2. Use `IsNotNullOrEmptyForICollection` for materialized collections**  
Avoids calling `Count()` (DB query) on an already-materialized collection.
```csharp
//   if (items.IsNotNullOrEmpty())           // calls Count()  hits DB
//   if (items.IsNotNullOrEmptyForICollection()) // uses Count property
```

**E3. Materialize iterables before loops**  
Build lookup objects before iteration; never call `.Count()` inside a loop on an unmaterialized query.
```csharp
//   for (var i = 0; i < ratePlans.Count(); i++) { }
//   var list = ratePlans.ToList(); for (var i = 0; i < list.Count; i++) { }
```

**E4. Prefer `ServiceFx` extensions when conflicting with `Enterprise.Common`**
```csharp
//   using SHS.Platform.ServiceFx.Extensions;
```

---

## Category F  NHibernate / Data Access

**F1. Scope NHibernate sessions tightly  no long-lived session references**  
Never cache `ISession` in fields. Dispose promptly; never pass to background threads or long-lived caches.

**F2. Use L2 cache for reference data; use `.Select()` projections for single-field lookups**
```csharp
//   var code = session.Query<Channel>().Where(c => c.Id == id).Select(c => c.Code).SingleOrDefault();
```

**F3. Use `ICriteria` paging with `SetFirstResult` / `SetMaxResults`**  
Never load all records and page in memory.

---

## Category G  Code Quality

**G1. Remove empty `finally` blocks after WCF proxy removal** (see B4)

**G2. Use comments only for non-obvious logic**  
No commented-out code in production. Self-documenting names preferred over inline comments.

---

## Category H  Test Coverage (Mandatory)

**All rules in this category are blocking. A PR that adds or modifies logic without corresponding tests MUST NOT be approved.**  
CodeNova MUST scan the diff for untested methods and report them by name.

---

**H1. Every new public method must have at least one unit test**  
No new public method may be merged without a corresponding test class/method. If the test file does not exist, CodeNova must flag its expected path.
```csharp
//   public TimeSpan GetReconnectDelay() { ... }  // no test added
//   GetReconnectDelayReturnsConfiguredValue_WhenKeyPresent()
//     GetReconnectDelayReturnsDefault_WhenKeyAbsent()
```

**H2. Both success and failure paths must be covered**  
Every method that has a `try/catch`, conditional branch, or early return requires a test for each path.
```csharp
//   Only the happy path tested
//   Test_Send_ThrowsQueueException_OnNMSConnectionException()
//     Test_Send_Succeeds_AndLogsMessageRouted()
```

**H3. Exception/edge cases for config reads must be tested**  
All `ConfigurationManager.AppSettings` helpers that fall back to defaults must have:
- A test proving the configured value is used when the key is present
- A test proving the default is returned when the key is absent or unparseable
```csharp
//   GetQueuePrefetch_ReturnsParsed_WhenValid()
//     GetQueuePrefetch_ReturnsDefault10_WhenMissing()
//     GetQueuePrefetch_ReturnsDefault10_WhenLessThanOne()
```

**H4. Tests must use Arrange-Act-Assert naming and structure**  
Test method names must follow `MethodName_ExpectedResult_WhenCondition` convention.  
Each test must have exactly one `// Arrange`, `// Act`, `// Assert` block.  
No assertions in the Act section; no logic in the Assert section.
```csharp
//   [Test] public void TestSend() { ... }
//   [Test] public void SendMessage_LogsCorrelationId_WhenSendSucceeds() { ... }
```

**H5. Reconnect, cooldown, and resilience paths must have dedicated tests**  
Any new reconnect logic, cooldown timer, or circuit-breaker pattern requires explicit tests for:
- Cooldown active (reconnect skipped)
- Cooldown expired (reconnect attempted)
- Successful reconnect resets cooldown to `DateTime.MinValue`
- Failed reconnect sets cooldown to `UtcNow + delay`

**H6. Minimum 80% line/branch coverage for all new and modified files**  
CodeNova must report estimated coverage gap for any file in the diff.  
If existing test project for the changed assembly is found in the workspace, CodeNova MUST identify the test class and list missing test method names.
```
//   ActiveMqQueue.cs  13 new methods, 0 new tests detected
//   ActiveMqQueueTests.cs  covers H1/H2/H3/H4/H5 above; coverage  80%
```

---

### CodeNova Test Audit Protocol

When `net-review` is loaded for a PR/file review containing `.cs` changes:  
1. For every **new or modified method** in the diff, search the workspace for a corresponding test method (grep `methodName` in `*Tests.cs` and `*Test.cs`).
2. Report each method with: ` covered`, ` partially covered`, or ` no test found`.
3. For every ``, generate the **test method stub** the author should add, following H4 naming convention.
4. If no test project is found for the assembly, flag it explicitly and block the review.

This audit runs automatically as part of every `codenova, review` invocation.

---

## Category I  Security (Blocking)

**All rules in this category are blocking. Security violations MUST be fixed before merge.**

**I1. No hardcoded secrets, credentials, or connection strings in source**  
Passwords, API keys, tokens, and connection strings must never appear in `.cs` or config files committed to source. Use environment variables or secrets management.
```csharp
//   private const string Password = "P@ssw0rd123";
//   <add key="DbPassword" value="secret" />
//   ConfigurationManager.AppSettings["DbPassword"]  // value injected at deploy
```

**I2. No sensitive data in log output**  
PII (names, email, passport, DOB), payment card data, passwords, and authentication tokens must never be written to any log sink  including `AppLogger`, `Splunk`, `log4net`, or `Console`.
```csharp
//   AppLogger.Info("Login", "Password".ToKvp(request.Password));
//   AppLogger.Info("Payment", "CardNumber".ToKvp(card.Number));
//   AppLogger.Info("Login", "UserId".ToKvp(request.UserId));
```

**I3. Use parameterized queries  no string-concatenated SQL**  
All database queries must use NHibernate criteria, LINQ, or named parameters. Never concatenate user input into SQL strings.
```csharp
//   session.CreateQuery("FROM Hotel WHERE Name = '" + name + "'");
//   session.Query<Hotel>().Where(h => h.Name == name);
//   session.CreateQuery("FROM Hotel WHERE Name = :name").SetString("name", name);
```

**I4. Validate all inputs at service boundaries**  
Public service methods and API handlers must validate inputs and return `OperationResult` with a specific error  never let invalid input propagate into the domain layer or cause unhandled exceptions.
```csharp
//   public RateResult GetRate(RateRequest request) { var q = _repo.Get(request.HotelId); ... }
//   if (request == null || request.HotelId <= 0)
//         return OperationResult.SingleError(Messages.Error.InvalidRequest, "HotelId required");
```

**I5. No unsafe deserialization  restrict `TypeNameHandling`**  
`Newtonsoft.Json` settings must never use `TypeNameHandling.All` or `TypeNameHandling.Auto` with untrusted input. Use `TypeNameHandling.None` (default) or explicit known-types binders.
```csharp
//   JsonConvert.DeserializeObject(json, new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.All });
//   JsonConvert.DeserializeObject<MyDto>(json);  // typed, no TypeNameHandling
```

**I6. No TOCTOU  check-then-act on shared state must be atomic**  
"Check if connected, then act" patterns on shared mutable state must be guarded by a single lock. Separate read-then-write without a lock creates a race window.
```csharp
//   if (_isConnected) { Send(msg); }          // _isConnected can change between check and send
//   lock (_sync) { if (_isConnected) { Send(msg); } }
```

---

## Category J  Performance & Complexity

**J1. No `Task.Result` or `.Wait()` in async call paths**  
Synchronously blocking on a `Task` in code that may be called from an async context causes deadlocks under `SynchronizationContext` (ASP.NET, WCF). Always `await`.
```csharp
//   var result = SomeAsync().Result;
//   SomeAsync().Wait();
//   var result = await SomeAsync().ConfigureAwait(false);
```

**J2. No O(N) collection operations  avoid nested loops on large data**  
Any nested iteration over the same or related collection must use a `Dictionary`/`HashSet` lookup instead.
```csharp
//   foreach (var rate in rates) { foreach (var rule in rules) { if (rate.Id == rule.RateId) ... } }
//   var rulesByRateId = rules.GroupBy(r => r.RateId).ToDictionary(g => g.Key, g => g.ToList());
//     foreach (var rate in rates) { var matched = rulesByRateId.GetValueOrDefault(rate.Id); }
```

**J3. Avoid holding locks over I/O or long-running operations**  
Lock scope must cover only the minimum state mutation. I/O (DB, network, file), waiting, or expensive computation inside a `lock` blocks all other threads.
```csharp
//   lock (_sync) { var result = _repo.GetFromDatabase(id); _cache[id] = result; }
//   var result = _repo.GetFromDatabase(id);   // outside lock
//     lock (_sync) { _cache[id] = result; }     // lock only the write
```

**J4. No string concatenation in loops  use `StringBuilder`**  
String concatenation in a loop is O(N) in memory. Use `StringBuilder` for iterative string building.
```csharp
//   string csv = ""; foreach (var item in items) { csv += item + ","; }
//   var sb = new StringBuilder(); foreach (var item in items) { sb.Append(item).Append(','); }
//     var csv = sb.ToString();
```

**J5. Pre-compile frequently used `Regex` instances as `static readonly`**  
`new Regex(pattern)` on each call allocates and compiles the automaton. Patterns used more than once must be `static readonly` with `RegexOptions.Compiled`.
```csharp
//   var match = new Regex(@"\d{4}-\d{2}-\d{2}").IsMatch(input);
//   private static readonly Regex DatePattern = new Regex(@"\d{4}-\d{2}-\d{2}", RegexOptions.Compiled);
//     var match = DatePattern.IsMatch(input);
```

**J6. No repeated `ConfigurationManager.AppSettings` reads in hot paths**  
`AppSettings` access involves a dictionary lookup on every call. Cache the value in a `static readonly` field when the config key is read more than once (or in a method called per-message/per-request).
```csharp
//   public void Send() { var timeout = TimeSpan.Parse(ConfigurationManager.AppSettings["Timeout"]); ... }
//   private static readonly TimeSpan Timeout = TimeSpan.Parse(ConfigurationManager.AppSettings["Timeout"]);
```

---

## Category K  SOLID & Design Principles

**K1. Single Responsibility  one class, one reason to change (SRP)**  
A class that owns connection management, serialization, retry logic, and logging in the same type violates SRP. Flag classes with more than 300 lines or 5+ unrelated responsibilities; suggest extraction.
```
//   ActiveMqQueue  owns: connection lifecycle, retry, serialization, logging, prefetch config
//     Consider: extract IConnectionManager, IMessageSerializer, IRetryPolicy
```

**K2. Open/Closed  extend, don't modify conditionals (OCP)**  
An `if/else` or `switch` that branches on a type tag to call different behavior is an OCP violation. Prefer a strategy interface or polymorphic dispatch.
```csharp
//   if (message.Type == "Email") SendEmail(message);
//     else if (message.Type == "Sms") SendSms(message);
//   _senders[message.Type].Send(message);  // IMessageSender implementations registered by type
```

**K3. Liskov Substitution  overrides must not weaken the base contract (LSP)**  
A derived class override must not throw exceptions the base does not declare, require stricter preconditions, or return narrower/unexpected values compared to the base contract.
```csharp
//   public override void Send(IMessage msg) { if (msg == null) throw new ArgumentNullException(); }
//     // base Send() accepted null silently  override breaks callers
//   override behaviour must satisfy base contract; add guard only if base also guarded
```

**K4. Interface Segregation  no fat interfaces (ISP)**  
Interfaces with more than 57 methods that are rarely all implemented together should be split. Callers should not be forced to depend on methods they never call.
```csharp
//   interface IQueueService { Send(); Receive(); Peek(); Pause(); Resume(); Purge(); GetStats(); Diagnose(); }
//   interface IQueueSender { Send(); }
//     interface IQueueReceiver { Receive(); Peek(); }
//     interface IQueueAdministration { Pause(); Resume(); Purge(); GetStats(); }
```

**K5. Dependency Inversion  depend on abstractions at call sites (DIP)**  
All constructor parameters and method signatures in library code must use interface types, not concrete classes. `new ConcreteService()` inside a class is a DIP violation unless it is a factory/composition root.
```csharp
//   public MyService() { _repo = new NHibernateHotelRepository(); }
//   public MyService(IHotelRepository repo) { _repo = repo; }
```

---

## Category L  Maintainability & Resilience

**L1. No bare `catch (Exception)` that swallows exceptions silently**  
Catching `Exception` or `System.Exception` and not re-throwing, logging with full details, or converting to a typed result hides bugs and makes failures invisible.
```csharp
//   catch (Exception) { /* ignore */ }
//   catch (Exception ex) { _logger.Log(ex.Message); }   // no stack, no rethrow
//   catch (Exception ex) { AppLogger.Error("OperationFailed", ex, "ActivityId".ToKvp(activityId)); throw; }
```

**L2. No magic strings or magic numbers  use named constants or config**  
Literals embedded in logic (timeouts, queue names, status codes, error strings) must be named constants, `enum` values, or config keys. Bare literals cannot be searched, refactored, or unit-tested in isolation.
```csharp
//   if (status == 3) { ... }
//   Thread.Sleep(10000);
//   if (status == ReservationStatus.Confirmed) { ... }
//   Thread.Sleep((int)TimeoutSettings.DefaultRetryMs);
```

**L3. Maximum cyclomatic complexity of 10 per method**  
A method with more than 10 decision points (if/else, switch cases, loops, catch blocks, ternary) is effectively untestable and must be refactored into smaller, named sub-methods.
```
//   GetCurrentSession()  complexity  14 (7 if-branches + 3 null checks + 4 early returns)
//     Consider: extract HandleTransactionalSession(), HandleRecoverableSession()
```

**L4. Dispose all `IDisposable` resources using `using` or `try/finally`**  
Any type implementing `IDisposable` (connections, sessions, streams, readers) must be disposed deterministically. Relying on GC finalization causes resource leaks under load.
```csharp
//   var conn = _factory.CreateConnection();  conn.Start();  // never disposed on exception
//   using var conn = _factory.CreateConnection();  conn.Start();
```

**L5. No deep inheritance hierarchies  prefer composition**  
Inheritance chains deeper than 3 levels (excluding framework base classes) tightly couple implementations and break LSP. Use composition with injected collaborators instead.

**L6. Exception types must be specific  no throwing `Exception` or `ApplicationException`**  
Thrown exceptions must be domain-typed (`QueueException`, `InvalidConfigurationException`) so callers can handle them selectively. Throwing the base `Exception` forces callers to catch everything or nothing.
```csharp
//   throw new Exception("Connection failed");
//   throw new QueueException($"ActiveMQ connection to {_queueAddress} failed after {ConnectionAttempts} attempts.");
```

---

## Category M  AD2 Document Review

Load when: `ad2-review` intent, or user requests AD2 review, standards compliance check on a design document, or domain team coverage audit.

ReviewNet applies the following checks to AD2 and design documents. Output a coverage matrix and a verdict per check.

**M1. Domain team coverage completeness**  
Every domain team that owns code touched by the feature must have explicit tasks listed in the AD2. A domain team entry without at least one task is a gap.

Output format:
```
Domain Team Coverage Matrix:
  HSS        3 tasks listed     COVERED
  PRC        2 tasks listed     COVERED
  CHC        0 tasks listed     GAP — no tasks for alert message changes
  ORM        not mentioned      GAP — impacted by booking flow changes, no tasks
```
A single uncovered domain team is a BLOCK verdict if the feature ships to that team's surface.

**M2. Standards compliance gate for design documents**  
AD2 documents must include: requirements traceability (each task traceable to at least one requirement or story), non-functional requirements (NFR) section, security and data handling considerations, and rollback or feature flag strategy for risky changes.

Check each section and report: `PRESENT`, `PARTIAL`, or `MISSING`.
```
Standards Compliance:
  Requirements traceability    PRESENT
  NFR section                  PARTIAL — performance NFR missing for tax evaluation path
  Security and data handling   MISSING — no PII or logging guidance
  Rollback / feature flag      PRESENT
```
Any `MISSING` on security or requirements traceability is a BLOCK.

**M3. Task completeness and implementation readiness**  
Each domain team task must include: task description, owning engineer or team, estimated size or complexity signal, and at least one acceptance criterion. Tasks missing these are flagged as INCOMPLETE.

Output format:
```
Task Completeness:
  Task 2.1 HSS — Update getLeadAvailability pricing guard      COMPLETE
  Task 2.2 PRC — Add rate-currency resolver to tax evaluator   INCOMPLETE — no acceptance criteria
  Task 3.1 CHC — Alert message channel routing update          INCOMPLETE — no owner assigned
```

---

## Category N  Impact Analysis and Blast Radius

Load when: `impact-analysis` intent, or user requests blast radius, service impact, deployment risk, or rollout analysis for a feature or code change.

**N1. Caller blast-radius matrix**  
Identify every service, controller, or consumer that calls the changed code path. For each, assign a risk level based on call frequency and change proximity.

Output format:
```
Caller Blast-Radius Matrix:
  Service                     Call path                        Risk
  ShoppingResponseAssembler   -> FlatTaxCalculator.Evaluate()  HIGH — direct call, hot path
  RatePricingService          -> ITaxCalculator                MEDIUM — interface call, indirect
  BookingConfirmationService  -> TaxSummaryBuilder             LOW — summary only, post-evaluation
  ORM Reporting Pipeline      -> TaxAmountSnapshot             LOW — read-only downstream
```
Any HIGH-risk caller with no test scenario is automatically flagged as a BLOCK for deployment.

**N2. Release risk levels by impact category**  
Group impacted areas by risk category and assign a release risk level (critical / high / medium / low / none) with the primary reason.

Output format:
```
Release Risk Summary:
  Tax calculation accuracy     CRITICAL — rate-specific currency amounts change for matching properties
  Shopping response contracts  HIGH — response shape unchanged, but amounts differ; contract still valid
  Booking flow                 MEDIUM — downstream booking tax totals may differ; regression test required
  Reporting / analytics        LOW — tax snapshot read-only; no behavioral change
  External API contracts       NONE — no public API shape change
```

**N3. Coordinated rollout plan**  
When HIGH or CRITICAL risk is present, output a deployment sequence with validation steps and a post-release monitoring watchlist.

Output format:
```
Rollout Sequence:
  1. Deploy HSS with feature flag OFF — smoke test baseline tax calculation
  2. Enable feature flag for 10% of property IDs — monitor TaxAmountSnapshot diff
  3. Validate: no increase in shopping error rate; tax amounts within 0.01 tolerance
  4. Full rollout after 48h stable window
  5. Post-release monitoring: ShoppingResponseAssembler error rate, tax mismatch alerts, sell count anomalies
```

---

## Category O  Architectural Compliance Drift

Load when: `compliance-drift` intent, or user requests assessment of whether implementation has drifted from the approved AD2, design authority review, or corrective architecture actions.

**O1. Drift findings**  
Compare the actual implementation (PR, branch, or described changes) against the approved AD2 design decisions. For each divergence, record the original decision, the observed deviation, and the severity.

Output format:
```
Drift Findings:
  Decision: Tax evaluation runs synchronously during shopping response assembly
  Observed:  Tax evaluation deferred to a background job — diverges from approved sync decision
  Severity:  HIGH — changes latency contract for real-time shopping callers

  Decision: IRateCurrencyResolver injected via constructor DI
  Observed:  Resolved via static service locator in FlatTaxCalculator
  Severity:  MEDIUM — testability and DIP violation; inconsistent with DI pattern in AD2

  Decision: Feature flag required for rate-currency rollout
  Observed:  No feature flag — change is live for all properties on deploy
  Severity:  HIGH — no safe rollback path without a full revert
```
Severity HIGH with no corrective action is a BLOCK before release approval.

**O2. Corrective action plan**  
For each HIGH or MEDIUM finding, produce a corrective action with owner, timeline, and validation step.

Output format:
```
Corrective Actions:
  Finding: Tax evaluation deferred instead of synchronous
  Action:  Revert to synchronous evaluation or raise ADR to officially change the decision
  Owner:   Tech Lead / Architect
  Timeline: Before release gate review
  Validation: Shopping response latency p99 within approved SLA under load

  Finding: Feature flag absent
  Action:  Wrap rate-currency evaluation in IFeatureFlag.IsEnabled("FlatTax_RateCurrency")
  Owner:   Developer (US2255956 assignee)
  Timeline: Same PR or follow-on before merge
  Validation: Flag disabled returns previous calculation path; flag enabled activates new path
```

**O3. Governance recommendation**  
Conclude with one of three verdicts:
- `APPROVE` — no drift, or all drift is cosmetic and corrected
- `CONDITIONAL` — HIGH findings exist but corrective actions are committed with timeline
- `REDESIGN` — architecture intent is fundamentally altered; AD2 must be revised and re-approved before merge

---

## Category P  Feature Health and Release Gate

Load when: `release-gate` intent, or user requests feature health report, executive summary, go/no-go decision, quality gates, or rollback readiness assessment.

**P1. Feature health dashboard**  
Aggregate checklist results (reviewnet, test coverage, compliance drift, security) into a health signal per feature. Use a RAG (Red / Amber / Green) status with a one-line reason.

Output format:
```
Feature Health Dashboard:
  Feature          Status   Reason
  FEA107884        AMBER    Tax accuracy HIGH risk; blast radius not fully regression-tested
  FEA107885        GREEN    All domain teams covered; no drift findings; test coverage >= 80%

Top Unresolved Risks:
  FEA107884 — ShoppingResponseAssembler blast radius: no regression test for rate-specific currency path
  FEA107884 — Feature flag absent: no safe rollback without full revert

Recommended Executive Actions:
  1. Block FEA107884 release until blast radius regression tests pass
  2. Require feature flag for FEA107884 before release committee approval
  3. FEA107885 is clear for release — no blocking items
```

**P2. Go/no-go decision with quality gates**  
Evaluate each quality gate and produce a go or no-go verdict with confidence level.

Quality gates evaluated:
- Test coverage >= 80% for all changed files (from H6)
- No unresolved security findings (from I*)
- No HIGH blast-radius callers without regression tests (from N1)
- No HIGH drift findings without corrective actions (from O1)
- Domain team coverage matrix: no uncovered teams (from M1)
- Feature flag or rollback strategy present for risky changes (from M2)

Output format:
```
Go/No-Go: NO-GO (confidence: HIGH)

Quality Gate Results:
  Test coverage >= 80%                     FAIL — getLeadAvailability fix: 3 methods with no tests
  No unresolved security findings          PASS
  Blast radius HIGH callers tested         FAIL — ShoppingResponseAssembler lacks rate-currency regression test
  No HIGH drift without corrective action  PASS — corrective actions committed
  Domain team coverage complete            PASS
  Feature flag or rollback present         FAIL — FlatTaxCalculator has no feature flag

Blocking Items Before Go:
  1. Add regression test: ShoppingResponseAssembler_FlatTax_RateCurrencyHotel_CorrectAmountInResponse
  2. Wrap FlatTaxCalculator change in IFeatureFlag.IsEnabled("FlatTax_RateCurrency")
  3. Add unit tests for getLeadAvailability redeemable rate path (3 missing stubs in H6 audit)
```

**P3. Rollback readiness**  
Confirm that a rollback procedure exists and is executable without data corruption or contract breakage.

Output format:
```
Rollback Readiness:
  Rollback mechanism:       Feature flag (if present) — INSTANT rollback with no deploy
  Rollback mechanism:       Git revert + redeploy — 20-30 min estimated
  Data safety:              Tax amounts stored in TaxAmountSnapshot are idempotent — safe to revert
  Contract safety:          Shopping response shape unchanged — callers unaffected by rollback
  Post-rollback validation: Run smoke test suite for getLeadAvailability and FlatTaxCalculator
  Risk if NOT rolled back:  Incorrect tax amounts for rate-specific currency hotels until fix deployed
```
