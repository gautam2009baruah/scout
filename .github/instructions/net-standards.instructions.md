---
description: "C# coding standards for SynXis ProjectX ⚡ applies to all .cs file contexts. Follow these conventions when generating or reviewing C# code."
applyTo: "**/*.cs"
---

# C# Coding Standards ⚡ SynXis ProjectX

> **Scope:** General C# conventions (naming, access, patterns, async, exceptions, logging).  
> **SynXis-platform-specific .NET rules** (WCF removal, ActivityId logging, NHibernate, DI migration, LINQ materialization) are indexed separately ⚡ load via `codenova, review synxis-guidelines` → `reviewnetskill/REVIEW_GUIDELINES.md`.

---

## Naming Conventions

- Follow [Microsoft Framework Design Guidelines](https://docs.microsoft.com/en-us/dotnet/standard/design-guidelines/)
- `camelCase` for private/internal fields (`_underscoredPrivateField` also acceptable)
- No Hungarian notation
- Prefix interfaces with `I` (e.g., `IEnumerable`)
- Do NOT capitalize consecutive letters: `HtmlTag` not `HTMLTag`
- Use C# type keywords: `bool` not `Boolean`, `int` not `Int32`

## Access Modifiers

- `public` for all members of a public API (even in internal classes)
- Use strictest possible access for non-public members
- Never increase accessibility for unit testing ⚡ no `InternalsVisibleToAttribute`

## Common Patterns

**Prefer null propagation/coalescing:**
```csharp
// ✅
var amount = reservation?.StayInfo?.FirstOrDefault()?.RateAmount ?? 0;
```

**Prefer object initializers:**
```csharp
// ✅
var r = new Reservation { ArrivalDate = today, GuestCount = 2 };
```

**Prefer switch expressions:**
```csharp
// ✅
return bedType switch
{
    BedType.King  => OtaBedType.King,
    BedType.Queen => OtaBedType.Queen,
    _ => throw new ArgumentOutOfRangeException(nameof(bedType))
};
```

## Class Design

- Classes are `sealed` by default
- Validate arguments and assert internal state
- Methods: single responsibility, short (fit on screen), ≤4–5 parameters (use class for more)
- Use interfaces for decoupling

## Collections

- Prefer typed collection classes over arrays
- No non-generic collections (`System.Collections.*`)
- Prefer LINQ extension methods (NOT LINQ keywords, except for joins)
- Use immutable collections when possible
- Collection references are NEVER nullable
- Beware `IEnumerable<T>` lazy evaluation ⚡ use `.ToList()` when enumerated more than once

## Async / Parallelism

- I/O operations MUST be async
- No sync-over-async (deadlock risk)
- Use TPL ⚡ not legacy threads
- `HttpClient` is singleton ⚡ never create per-request
- Always `using` for `IDisposable` resources

## Exceptions

- Prefer exceptions over status codes
- Log at origin, add context at higher layers
- Be specific when catching ⚡ not just `Exception`
- Use `throw;` (bare) to preserve stack trace
- No exceptions for control flow

## Strings

- User-facing strings → resource files
- `string.Empty` not `""`
- `StringComparison.OrdinalIgnoreCase` for case-invariant comparisons
- String interpolation for small strings; `StringBuilder` for large/loops

## Logging (Mandatory)

Every log message MUST include:
- **Correlation ID** ⚡ end-to-end tracing
- **Component name** ⚡ source of the entry
- **Structured fields** ⚡ use `.ToKvp()` extension

```csharp
_logger.AppLogger.Info(
    "OhipProcessing_Started",
    "CorrelationId".ToKvp(correlationId),
    "Component".ToKvp(nameof(OhipProcessor)),
    "ActionType".ToKvp(actionType.ToString()));
```

## Documentation

- Every public type/member MUST have XML comments
- Write self-documenting code ⚡ descriptive names, short focused methods

## Miscellaneous

- Constants/enums over magic values
- No hardcoded file paths ⚡ use programmatic + relative paths
- NuGet over direct DLL references; use `packages.config` not `<PackageReference>`
- Build at highest warning level
- ❌ Never hardcode connection strings or credentials
- ❌ Never commit commented-out code
- ✅ Minimum 80% test coverage for new code
