# Category N: Null Safety & Reference Handling

## Priority: CRITICAL (Phase 1)
**Blocking Status:** YES - Null reference exceptions cause production crashes

---

## Overview

Validates proper handling of nullable reference types, null propagation patterns, and defensive coding against `NullReferenceException`.

---

## Critical Checks

### 1. Nullable Reference Type Configuration
- [ ] Project has `<Nullable>enable</Nullable>` in `.csproj`
- [ ] All new files respect nullable annotations
- [ ] No `#nullable disable` directives without justification

### 2. Nullable Property Annotations
- [ ] DTOs match database schema nullability (`string?` vs `string`)
- [ ] API response models use correct nullability annotations
- [ ] Value types use `Nullable<T>` or `T?` when appropriate
- [ ] Collections are never nullable (use empty collection instead)

### 3. Null Conditional Operators
- [ ] Use `?.` for safe navigation on potentially null references
- [ ] Use `??` or `??=` for null coalescing
- [ ] Avoid chaining too many `?.` operators (readability)

**Example:**
```csharp
// ✅ CORRECT
var amount = reservation?.StayInfo?.FirstOrDefault()?.RateAmount ?? 0;
var guestName = guest?.Name ?? "Unknown";

// ❌ INCORRECT
var amount = reservation.StayInfo.FirstOrDefault().RateAmount; // NullReferenceException risk
```

### 4. Null Checks Before Access
- [ ] Explicit null checks before accessing properties/methods
- [ ] Guard clauses at method entry points
- [ ] Argument validation with `ArgumentNullException`

**Example:**
```csharp
// ✅ CORRECT
if (reservation == null)
    throw new ArgumentNullException(nameof(reservation));

if (reservation.StayInfo != null && reservation.StayInfo.Any())
{
    var rate = reservation.StayInfo.First().RateAmount;
}

// ❌ INCORRECT
var rate = reservation.StayInfo.First().RateAmount; // No null check
```

### 5. External API Response Handling
- [ ] All external API responses validated for null
- [ ] Deserialized JSON objects checked before use
- [ ] Database query results checked before access
- [ ] NHibernate lazy-loaded properties handled safely

**Example:**
```csharp
// ✅ CORRECT
var response = await _client.GetReservationAsync(id);
if (response?.Data == null)
    return NotFound();

// ❌ INCORRECT
var response = await _client.GetReservationAsync(id);
return Ok(response.Data.GuestName); // response.Data could be null
```

### 6. Collection Initialization
- [ ] Collection properties initialized in constructor or property initializer
- [ ] Never return `null` for collection-typed methods (return empty)
- [ ] Use `Enumerable.Empty<T>()` or `Array.Empty<T>()` for empty collections

**Example:**
```csharp
// ✅ CORRECT
public class Reservation
{
    public List<Stay> StayInfo { get; set; } = new List<Stay>();
}

public IEnumerable<Stay> GetStays()
{
    return _stays ?? Enumerable.Empty<Stay>();
}

// ❌ INCORRECT
public class Reservation
{
    public List<Stay> StayInfo { get; set; } // Can be null
}

public IEnumerable<Stay> GetStays()
{
    return null; // Never return null for collections
}
```

### 7. DTO Property Nullability Changes (Breaking Change Risk)
- [ ] Adding `?` to previously non-nullable property is BREAKING
- [ ] Removing `?` from nullable property is BREAKING
- [ ] Document nullability changes in migration guide
- [ ] Add tests for null handling in consuming code

### 8. Null Suppression Operator (`!`) Usage
- [ ] Use sparingly and only when compiler is wrong
- [ ] Add comment explaining why null is impossible
- [ ] Prefer explicit null checks over `!` suppression

**Example:**
```csharp
// ⚠️ USE WITH CAUTION
var name = reservation!.GuestName; // Only if you KNOW reservation is not null
// Better:
if (reservation == null) throw new InvalidOperationException("Reservation cannot be null");
var name = reservation.GuestName;
```

---

## Common Violations

### Violation 1: Direct Property Access Without Null Check
```csharp
// ❌ BAD
var tax = reservation.TaxInfo.TaxAmount;

// ✅ GOOD
var tax = reservation?.TaxInfo?.TaxAmount ?? 0;
```

### Violation 2: No Null Check on Database Queries
```csharp
// ❌ BAD
var reservation = _session.Get<Reservation>(id);
return reservation.GuestName; // reservation could be null

// ✅ GOOD
var reservation = _session.Get<Reservation>(id);
if (reservation == null)
    throw new NotFoundException($"Reservation {id} not found");
return reservation.GuestName;
```

### Violation 3: Collection Returned as Null
```csharp
// ❌ BAD
public IEnumerable<Rate> GetRates()
{
    if (_rates == null)
        return null;
    return _rates;
}

// ✅ GOOD
public IEnumerable<Rate> GetRates()
{
    return _rates ?? Enumerable.Empty<Rate>();
}
```

---

## Downstream Impact Assessment

### When Null Safety Issues Detected:
1. **Find all callers** of the modified method/property
2. **Check for null guards** in consuming code
3. **Validate AutoMapper profiles** handle null source properties
4. **Check API clients** for null response handling
5. **Identify potential NullReferenceException sites**

### High-Risk Scenarios:
- DTO properties changed from `string` to `string?`
- Methods that previously threw exceptions now return `null`
- Properties that were always populated can now be `null`
- Lazy-loaded NHibernate properties accessed without initialization check

---

## Severity Mapping

| Violation Type | Severity | Risk | Blocking? |
|----------------|----------|------|-----------|
| No null check on external API response | 🔴 Critical | Production crash | YES |
| Collection returned as null | 🔴 Critical | Production crash | YES |
| DTO nullability changed without migration | 🔴 Critical | Breaking change | YES |
| Missing null guard on database query | 🟠 High | Data-dependent crash | YES |
| No null check in AutoMapper profile | 🟠 High | Mapping failure | YES |
| Missing `?.` on chained property access | 🟠 High | Production crash | YES |
| Excessive `!` suppression without justification | 🟡 Medium | Tech debt | NO |
| `#nullable disable` without comment | 🟡 Medium | Missed nullability issues | NO |

---

## Remediation Patterns

### Pattern 1: Guard Clause
```csharp
public void ProcessReservation(Reservation reservation)
{
    if (reservation == null)
        throw new ArgumentNullException(nameof(reservation));
    
    // Safe to use reservation here
}
```

### Pattern 2: Null Conditional with Fallback
```csharp
var guestName = reservation?.Guest?.Name ?? "Unknown";
```

### Pattern 3: Early Return
```csharp
if (reservation?.StayInfo == null || !reservation.StayInfo.Any())
    return Enumerable.Empty<Rate>();

return reservation.StayInfo.Select(s => s.Rate);
```

### Pattern 4: Explicit Null Object
```csharp
public static readonly Guest UnknownGuest = new Guest { Name = "Unknown", Email = "" };

var guest = reservation?.Guest ?? UnknownGuest;
```

---

## Testing Requirements

### Unit Tests Must Cover:
- [ ] Method behavior when input is `null`
- [ ] Property access when object is `null`
- [ ] Collection operations when collection is empty
- [ ] External API response when response is `null`
- [ ] Database query when result is `null`

### Example Test:
```csharp
[Test]
public void ProcessReservation_WhenReservationIsNull_ThrowsArgumentNullException()
{
    // Arrange
    Reservation nullReservation = null;

    // Act & Assert
    Assert.Throws<ArgumentNullException>(() => _service.ProcessReservation(nullReservation));
}

[Test]
public void GetStayInfo_WhenStayInfoIsNull_ReturnsEmptyCollection()
{
    // Arrange
    var reservation = new Reservation { StayInfo = null };

    // Act
    var result = _service.GetStayInfo(reservation);

    // Assert
    Assert.IsEmpty(result);
}
```

---

## Review Output Format

### Category N - Null Safety & Reference Handling
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

| # | Issue | File | Impact | Risk | Fix |
|---|-------|------|--------|------|-----|
| 1 | [Issue description] | [file.cs](path#L10-L15) | [NullRef crash in API X] | 🔴 | [Add null check before access] |

**Summary**: [Brief description of null safety issues and recommended fixes]
