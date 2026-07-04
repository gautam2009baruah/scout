# Category Q: Data Validation & Business Rules

## Priority: HIGH (Phase 3)
**Blocking Status:** PARTIAL - Business rule violations risk data integrity

## Overview
Validates enforcement of business rules, domain invariants, input sanitization, and data constraint validation at service boundaries to prevent invalid data from entering the system.

## Critical Checks

### 1. Required Field Validation
- [ ] Required properties validated at API entry points
- [ ] Null/empty string checks for mandatory fields
- [ ] Required collections validated (not null, minimum count if applicable)
- [ ] Validation attributes present (`[Required]`, `[StringLength]`, etc.)
- [ ] Custom validation logic for complex requirements

### 2. Business Rule Enforcement
- [ ] Date range validation (check-in < check-out, arrival < departure)
- [ ] Numeric constraints (positive values, min/max ranges)
- [ ] Capacity validation (guest count <= room capacity)
- [ ] State transitions validated (status workflow rules)
- [ ] Cross-field dependencies enforced
- [ ] Business hours validation (check-in time, restaurant hours)

### 3. Enum & Reference Data Validation
- [ ] Enum values validated against allowed set
- [ ] Reference data lookups validated (property exists, room type exists)
- [ ] Foreign key integrity enforced
- [ ] Invalid enum values rejected (not just cast to default)
- [ ] Enum range checks for flags enums

### 4. Decimal & Currency Validation
- [ ] Decimal precision appropriate for currency (2 decimals for USD/EUR)
- [ ] Tax calculations validated (rate * base = amount)
- [ ] No floating-point arithmetic for currency (`decimal`, not `double`)
- [ ] Negative amounts validated (refunds allowed, or block negative?)
- [ ] Rounding strategy consistent (`MidpointRounding.AwayFromZero`)

### 5. String Format Validation
- [ ] Email format validated (regex or `MailAddress`)
- [ ] Phone number format validated
- [ ] Credit card format validated (Luhn algorithm)
- [ ] Postal code format validated per country
- [ ] URL format validated
- [ ] Date/time string format validated before parsing

### 6. Conditional Validation
- [ ] If field X is set, then field Y is required
- [ ] If booking source = GDS, then GDS confirmation code required
- [ ] If guest type = corporate, then company name required
- [ ] If payment type = credit card, then card details required
- [ ] Validation rules documented and consistent

### 7. Boundary Validation
- [ ] Maximum string lengths enforced (prevent buffer overflow, DB truncation)
- [ ] Collection size limits enforced (prevent DoS via large arrays)
- [ ] Date range limits (no reservations >2 years in future)
- [ ] Numeric range limits (room rate between $0 and $50,000)
- [ ] File upload size limits

## Common Violations

### ❌ BAD: No validation at service boundary
```csharp
public ReservationResponse CreateReservation(ReservationRequest request)
{
    // No validation - accepts invalid data!
    var reservation = new Reservation
    {
        CheckInDate = request.CheckInDate,
        CheckOutDate = request.CheckOutDate,
        GuestCount = request.GuestCount
    };
    
    _repository.Save(reservation);
    return new ReservationResponse { Success = true };
}
```

### ✅ GOOD: Comprehensive validation before processing
```csharp
public ReservationResponse CreateReservation(ReservationRequest request)
{
    // Business rule validation
    if (request.CheckInDate >= request.CheckOutDate)
        return new ReservationResponse
        {
            Success = false,
            Error = "Check-in date must be before check-out date"
        };
    
    if (request.CheckInDate < DateTime.Today)
        return new ReservationResponse
        {
            Success = false,
            Error = "Check-in date cannot be in the past"
        };
    
    if (request.GuestCount < 1 || request.GuestCount > 10)
        return new ReservationResponse
        {
            Success = false,
            Error = "Guest count must be between 1 and 10"
        };
    
    var room = _roomRepository.Get(request.RoomId);
    if (room.MaxOccupancy < request.GuestCount)
        return new ReservationResponse
        {
            Success = false,
            Error = $"Room capacity is {room.MaxOccupancy}, requested {request.GuestCount} guests"
        };
    
    // Validation passed, proceed
    var reservation = new Reservation { ... };
    _repository.Save(reservation);
    return new ReservationResponse { Success = true };
}
```

### ❌ BAD: Using double for currency (floating-point errors)
```csharp
public class Invoice
{
    public double RoomRate { get; set; } // WRONG - floating point precision errors!
    public double TaxAmount { get; set; }
    public double TotalAmount => RoomRate + TaxAmount; // Imprecise!
}
```

### ✅ GOOD: Using decimal for currency
```csharp
public class Invoice
{
    public decimal RoomRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount => RoomRate + TaxAmount; // Precise!
}
```

### ❌ BAD: No enum validation
```csharp
public void UpdateReservationStatus(int reservationId, int statusCode)
{
    // Blindly casts to enum - accepts invalid values!
    var status = (ReservationStatus)statusCode;
    _repository.UpdateStatus(reservationId, status);
}
```

### ✅ GOOD: Enum validation
```csharp
public void UpdateReservationStatus(int reservationId, int statusCode)
{
    if (!Enum.IsDefined(typeof(ReservationStatus), statusCode))
        throw new ArgumentException($"Invalid status code: {statusCode}");
    
    var status = (ReservationStatus)statusCode;
    _repository.UpdateStatus(reservationId, status);
}
```

### ❌ BAD: No email validation
```csharp
public void RegisterGuest(string email)
{
    // No validation - accepts "not-an-email"
    _guestRepository.Save(new Guest { Email = email });
}
```

### ✅ GOOD: Email format validation
```csharp
public void RegisterGuest(string email)
{
    if (string.IsNullOrWhiteSpace(email))
        throw new ArgumentException("Email is required");
    
    try
    {
        var mailAddress = new MailAddress(email);
        // Additional checks if needed
        if (!email.Contains("@") || !email.Contains("."))
            throw new ArgumentException("Invalid email format");
    }
    catch (FormatException)
    {
        throw new ArgumentException($"Invalid email format: {email}");
    }
    
    _guestRepository.Save(new Guest { Email = email.ToLower() });
}
```

### ❌ BAD: No conditional validation
```csharp
public class CorporateReservation
{
    public string BookingSource { get; set; }
    public string CompanyName { get; set; } // Should be required if BookingSource = "Corporate"
}
```

### ✅ GOOD: Conditional validation enforced
```csharp
public class CorporateReservation
{
    public string BookingSource { get; set; }
    
    [RequiredIf("BookingSource", "Corporate", ErrorMessage = "Company name is required for corporate bookings")]
    public string CompanyName { get; set; }
}

// Custom validation attribute
public class RequiredIfAttribute : ValidationAttribute
{
    private readonly string _propertyName;
    private readonly object _desiredValue;
    
    public RequiredIfAttribute(string propertyName, object desiredValue)
    {
        _propertyName = propertyName;
        _desiredValue = desiredValue;
    }
    
    protected override ValidationResult IsValid(object value, ValidationContext context)
    {
        var property = context.ObjectType.GetProperty(_propertyName);
        var propertyValue = property.GetValue(context.ObjectInstance);
        
        if (propertyValue?.ToString() == _desiredValue?.ToString())
        {
            if (value == null || string.IsNullOrWhiteSpace(value.ToString()))
                return new ValidationResult(ErrorMessage);
        }
        
        return ValidationResult.Success;
    }
}
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| No date range validation (check-in/out) | 🔴 CRITICAL | ✅ YES | Invalid reservations enter system |
| Using double for currency | 🔴 CRITICAL | ✅ YES | Financial calculation errors |
| No enum validation | 🟠 MAJOR | ⚠️ PARTIAL | Invalid state values |
| Missing required field validation | 🟠 MAJOR | ⚠️ PARTIAL | Data integrity risk |
| No email format validation | 🟡 WARNING | ❌ NO | Poor data quality |
| No capacity validation | 🟠 MAJOR | ⚠️ PARTIAL | Overbooking risk |
| Missing conditional validation | 🟡 WARNING | ❌ NO | Inconsistent data |

## Remediation Patterns

### Pattern 1: FluentValidation for Complex Rules
```csharp
public class ReservationRequestValidator : AbstractValidator<ReservationRequest>
{
    public ReservationRequestValidator()
    {
        RuleFor(x => x.CheckInDate)
            .GreaterThanOrEqualTo(DateTime.Today)
            .WithMessage("Check-in date cannot be in the past");
        
        RuleFor(x => x.CheckOutDate)
            .GreaterThan(x => x.CheckInDate)
            .WithMessage("Check-out date must be after check-in date");
        
        RuleFor(x => x.GuestCount)
            .InclusiveBetween(1, 10)
            .WithMessage("Guest count must be between 1 and 10");
        
        RuleFor(x => x.GuestEmail)
            .NotEmpty()
            .EmailAddress()
            .WithMessage("Valid email address is required");
        
        When(x => x.BookingSource == "Corporate", () =>
        {
            RuleFor(x => x.CompanyName)
                .NotEmpty()
                .WithMessage("Company name is required for corporate bookings");
        });
    }
}
```

### Pattern 2: Domain Validation in Entity
```csharp
public class Reservation
{
    private DateTime _checkInDate;
    private DateTime _checkOutDate;
    private int _guestCount;
    
    public DateTime CheckInDate
    {
        get => _checkInDate;
        set
        {
            if (value < DateTime.Today)
                throw new DomainException("Check-in date cannot be in the past");
            _checkInDate = value;
        }
    }
    
    public DateTime CheckOutDate
    {
        get => _checkOutDate;
        set
        {
            if (value <= _checkInDate)
                throw new DomainException("Check-out date must be after check-in date");
            _checkOutDate = value;
        }
    }
    
    public int GuestCount
    {
        get => _guestCount;
        set
        {
            if (value < 1 || value > 10)
                throw new DomainException("Guest count must be between 1 and 10");
            _guestCount = value;
        }
    }
}
```

### Pattern 3: Result Pattern for Validation Errors
```csharp
public class ValidationResult<T>
{
    public bool IsValid { get; set; }
    public T Value { get; set; }
    public List<string> Errors { get; set; } = new List<string>();
    
    public static ValidationResult<T> Success(T value) =>
        new ValidationResult<T> { IsValid = true, Value = value };
    
    public static ValidationResult<T> Failure(params string[] errors) =>
        new ValidationResult<T> { IsValid = false, Errors = errors.ToList() };
}

public ValidationResult<Reservation> ValidateReservation(ReservationRequest request)
{
    var errors = new List<string>();
    
    if (request.CheckInDate >= request.CheckOutDate)
        errors.Add("Check-in date must be before check-out date");
    
    if (request.GuestCount < 1)
        errors.Add("At least one guest is required");
    
    if (errors.Any())
        return ValidationResult<Reservation>.Failure(errors.ToArray());
    
    var reservation = new Reservation { ... };
    return ValidationResult<Reservation>.Success(reservation);
}
```

## Testing Requirements

### 1. Business Rule Validation Tests
```csharp
[Test]
public void CreateReservation_CheckInAfterCheckOut_ReturnsError()
{
    // Arrange
    var request = new ReservationRequest
    {
        CheckInDate = DateTime.Today.AddDays(5),
        CheckOutDate = DateTime.Today.AddDays(3) // Before check-in!
    };
    
    // Act
    var result = _service.CreateReservation(request);
    
    // Assert
    Assert.IsFalse(result.Success);
    Assert.IsTrue(result.Error.Contains("Check-in date must be before check-out date"));
}
```

### 2. Boundary Value Tests
```csharp
[TestCase(0, false, "Guest count must be at least 1")]
[TestCase(1, true, null)]
[TestCase(10, true, null)]
[TestCase(11, false, "Guest count cannot exceed 10")]
public void CreateReservation_GuestCountBoundary_ValidatesCorrectly(
    int guestCount, bool expectedSuccess, string expectedError)
{
    // Arrange
    var request = new ReservationRequest { GuestCount = guestCount, ... };
    
    // Act
    var result = _service.CreateReservation(request);
    
    // Assert
    Assert.AreEqual(expectedSuccess, result.Success);
    if (!expectedSuccess)
        Assert.IsTrue(result.Error.Contains(expectedError));
}
```

## Review Output Format

```markdown
### Category Q: Data Validation & Business Rules

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| ReservationService.cs | 56 | No check-in/check-out date validation | 🔴 CRITICAL | Add date range validation |
| Invoice.cs | 12 | Using double for currency (RoomRate) | 🔴 CRITICAL | Change to decimal type |
| StatusController.cs | 34 | No enum validation for status codes | 🟠 MAJOR | Validate against Enum.IsDefined() |
| GuestService.cs | 89 | No email format validation | 🟡 WARNING | Add email validation |

**Category Status:** ❌ FAIL (2 critical validation gaps found)
**Blocking:** YES - Invalid data can enter system
**Recommendation:** Implement FluentValidation for comprehensive rule enforcement
```

## References
- [FluentValidation](https://fluentvalidation.net/)
- [Data Annotations](https://docs.microsoft.com/en-us/dotnet/api/system.componentmodel.dataannotations)
- [Domain-Driven Design: Validation](https://enterprisecraftsmanship.com/posts/validation-and-ddd/)
