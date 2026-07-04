# Category U: Error Handling & Fault Contracts

## Priority: MEDIUM (Phase 4)
**Blocking Status:** NO - But affects client experience and debugging

## Overview
Validates proper error handling patterns, WCF fault contracts, HTTP status code usage, error response consistency, and correlation ID propagation for operational debugging.

## Critical Checks

### 1. WCF Fault Contracts
- [ ] `[FaultContract]` attributes defined for expected errors
- [ ] Fault contracts use typed classes (not generic Exception)
- [ ] Fault detail objects are serializable (`[DataContract]`)
- [ ] Fault contracts documented in service interface
- [ ] No raw exceptions thrown from service methods

### 2. HTTP Status Codes
- [ ] 400 Bad Request for validation errors
- [ ] 404 Not Found for missing resources
- [ ] 409 Conflict for business rule violations
- [ ] 500 Internal Server Error for unexpected errors
- [ ] 503 Service Unavailable for transient failures
- [ ] Custom status codes avoided (use standard codes)

### 3. Error Response Schema
- [ ] Consistent error response structure across all APIs
- [ ] Error responses include correlation/trace ID
- [ ] Error codes defined and documented
- [ ] User-friendly error messages (not stack traces)
- [ ] Validation errors list specific fields
- [ ] Timestamp included in error response

### 4. PII Protection
- [ ] Stack traces not exposed to external clients
- [ ] Credit card numbers masked in error logs
- [ ] Guest names/emails not in error responses (use IDs)
- [ ] Internal system details not leaked (DB connection strings, server names)
- [ ] Error details differ by environment (dev vs production)

### 5. Correlation ID Propagation
- [ ] Correlation ID generated at API entry point
- [ ] Correlation ID propagated through all layers
- [ ] Correlation ID included in all log entries
- [ ] Correlation ID returned in error responses
- [ ] Distributed tracing context propagated (`ActivityId`, `TraceId`)

### 6. Exception Handling Patterns
- [ ] No empty catch blocks
- [ ] No catching generic `Exception` without rethrowing
- [ ] Specific exceptions caught and handled
- [ ] Resources disposed in `finally` or `using` blocks
- [ ] Logging before rethrowing exceptions
- [ ] No swallowing exceptions silently

### 7. Retry & Transient Error Handling
- [ ] Transient errors distinguished from permanent errors
- [ ] Retry logic uses exponential backoff
- [ ] Maximum retry count enforced
- [ ] Idempotency tokens used for retryable operations
- [ ] Circuit breaker pattern for cascading failures

## Common Violations

### ❌ BAD: No fault contract, raw exception thrown
```csharp
[ServiceContract]
public interface IReservationService
{
    [OperationContract]
    ReservationResponse CreateReservation(ReservationRequest request);
    // No [FaultContract] - WCF will return generic FaultException
}

public class ReservationService : IReservationService
{
    public ReservationResponse CreateReservation(ReservationRequest request)
    {
        if (request.CheckInDate < DateTime.Today)
            throw new ArgumentException("Check-in date cannot be in the past");
        // Client gets unhelpful generic fault!
    }
}
```

### ✅ GOOD: Typed fault contract defined
```csharp
[ServiceContract]
public interface IReservationService
{
    [OperationContract]
    [FaultContract(typeof(ValidationFault))]
    [FaultContract(typeof(BusinessRuleFault))]
    ReservationResponse CreateReservation(ReservationRequest request);
}

[DataContract]
public class ValidationFault
{
    [DataMember]
    public string FieldName { get; set; }
    
    [DataMember]
    public string ErrorMessage { get; set; }
    
    [DataMember]
    public string CorrelationId { get; set; }
}

public class ReservationService : IReservationService
{
    public ReservationResponse CreateReservation(ReservationRequest request)
    {
        if (request.CheckInDate < DateTime.Today)
        {
            var fault = new ValidationFault
            {
                FieldName = nameof(request.CheckInDate),
                ErrorMessage = "Check-in date cannot be in the past",
                CorrelationId = OperationContext.Current.SessionId
            };
            throw new FaultException<ValidationFault>(fault);
        }
    }
}
```

### ❌ BAD: Stack trace exposed to client
```csharp
[HttpPost]
public IActionResult CreateReservation(ReservationRequest request)
{
    try
    {
        return Ok(_service.CreateReservation(request));
    }
    catch (Exception ex)
    {
        // Exposes internal implementation details!
        return BadRequest(new { error = ex.ToString() });
    }
}
```

### ✅ GOOD: Sanitized error response with correlation ID
```csharp
[HttpPost]
public IActionResult CreateReservation(ReservationRequest request)
{
    var correlationId = HttpContext.TraceIdentifier;
    
    try
    {
        return Ok(_service.CreateReservation(request));
    }
    catch (ValidationException ex)
    {
        _logger.LogWarning(ex, "Validation failed. CorrelationId: {CorrelationId}", correlationId);
        
        return BadRequest(new ErrorResponse
        {
            ErrorCode = "VALIDATION_ERROR",
            Message = "The request contains invalid data",
            Details = ex.Errors.Select(e => e.ErrorMessage).ToList(),
            CorrelationId = correlationId,
            Timestamp = DateTime.UtcNow
        });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Unexpected error. CorrelationId: {CorrelationId}", correlationId);
        
        return StatusCode(500, new ErrorResponse
        {
            ErrorCode = "INTERNAL_ERROR",
            Message = "An unexpected error occurred. Please contact support with the correlation ID.",
            CorrelationId = correlationId,
            Timestamp = DateTime.UtcNow
        });
    }
}
```

### ❌ BAD: Empty catch block (swallows exception)
```csharp
public void LogReservationEvent(int reservationId)
{
    try
    {
        _eventLogger.Log(reservationId);
    }
    catch
    {
        // Silent failure - no way to detect issues!
    }
}
```

### ✅ GOOD: Log and handle gracefully
```csharp
public void LogReservationEvent(int reservationId)
{
    try
    {
        _eventLogger.Log(reservationId);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Failed to log reservation event for {ReservationId}", reservationId);
        // Event logging is non-critical, continue execution
        // But we've recorded the failure for investigation
    }
}
```

### ❌ BAD: No correlation ID in distributed call
```csharp
public async Task<PropertyDetails> GetPropertyDetails(int propertyId)
{
    var response = await _httpClient.GetAsync($"/properties/{propertyId}");
    return await response.Content.ReadFromJsonAsync<PropertyDetails>();
    // If this fails, no way to correlate with downstream service logs!
}
```

### ✅ GOOD: Correlation ID propagated to downstream
```csharp
public async Task<PropertyDetails> GetPropertyDetails(int propertyId)
{
    var correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
    
    var request = new HttpRequestMessage(HttpMethod.Get, $"/properties/{propertyId}");
    request.Headers.Add("X-Correlation-Id", correlationId);
    
    var response = await _httpClient.SendAsync(request);
    
    if (!response.IsSuccessStatusCode)
    {
        var errorBody = await response.Content.ReadAsStringAsync();
        _logger.LogError("Property API call failed. CorrelationId: {CorrelationId}, Status: {StatusCode}, Body: {Body}",
            correlationId, response.StatusCode, errorBody);
        throw new ExternalServiceException($"Failed to get property details. CorrelationId: {correlationId}");
    }
    
    return await response.Content.ReadFromJsonAsync<PropertyDetails>();
}
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| Stack trace exposed to client | 🟠 MAJOR | ⚠️ PARTIAL | Security/information leak |
| No correlation ID in errors | 🟡 WARNING | ❌ NO | Hard to debug |
| Empty catch block | 🟠 MAJOR | ⚠️ PARTIAL | Silent failures |
| No fault contract for WCF | 🟡 WARNING | ❌ NO | Poor client experience |
| PII in error response | 🔴 CRITICAL | ✅ YES | Data privacy violation |
| Inconsistent error schema | 🟡 WARNING | ❌ NO | Poor client experience |

## Remediation Patterns

### Pattern 1: Standardized Error Response DTO
```csharp
public class ErrorResponse
{
    [JsonProperty("errorCode")]
    public string ErrorCode { get; set; }
    
    [JsonProperty("message")]
    public string Message { get; set; }
    
    [JsonProperty("details")]
    public List<string> Details { get; set; }
    
    [JsonProperty("correlationId")]
    public string CorrelationId { get; set; }
    
    [JsonProperty("timestamp")]
    public DateTime Timestamp { get; set; }
    
    [JsonProperty("path")]
    public string Path { get; set; }
}
```

### Pattern 2: Global Exception Handler (ASP.NET Core)
```csharp
public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;
    
    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }
    
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (ValidationException ex)
        {
            await HandleValidationExceptionAsync(context, ex);
        }
        catch (NotFoundException ex)
        {
            await HandleNotFoundExceptionAsync(context, ex);
        }
        catch (Exception ex)
        {
            await HandleUnexpectedExceptionAsync(context, ex);
        }
    }
    
    private async Task HandleValidationExceptionAsync(HttpContext context, ValidationException ex)
    {
        var correlationId = context.TraceIdentifier;
        _logger.LogWarning(ex, "Validation error. CorrelationId: {CorrelationId}", correlationId);
        
        context.Response.StatusCode = 400;
        context.Response.ContentType = "application/json";
        
        var response = new ErrorResponse
        {
            ErrorCode = "VALIDATION_ERROR",
            Message = "Request validation failed",
            Details = ex.Errors.Select(e => e.ErrorMessage).ToList(),
            CorrelationId = correlationId,
            Timestamp = DateTime.UtcNow,
            Path = context.Request.Path
        };
        
        await context.Response.WriteAsJsonAsync(response);
    }
    
    private async Task HandleUnexpectedExceptionAsync(HttpContext context, Exception ex)
    {
        var correlationId = context.TraceIdentifier;
        _logger.LogError(ex, "Unexpected error. CorrelationId: {CorrelationId}", correlationId);
        
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        
        var response = new ErrorResponse
        {
            ErrorCode = "INTERNAL_ERROR",
            Message = "An unexpected error occurred",
            CorrelationId = correlationId,
            Timestamp = DateTime.UtcNow,
            Path = context.Request.Path
        };
        
        await context.Response.WriteAsJsonAsync(response);
    }
}
```

### Pattern 3: WCF Error Behavior
```csharp
public class FaultExceptionBehavior : IServiceBehavior
{
    public void ApplyDispatchBehavior(ServiceDescription serviceDescription, ServiceHostBase serviceHostBase)
    {
        foreach (ChannelDispatcher dispatcher in serviceHostBase.ChannelDispatchers)
        {
            dispatcher.ErrorHandlers.Add(new FaultErrorHandler());
        }
    }
}

public class FaultErrorHandler : IErrorHandler
{
    private readonly ILogger _logger;
    
    public bool HandleError(Exception error)
    {
        _logger.LogError(error, "WCF service error");
        return true;
    }
    
    public void ProvideFault(Exception error, MessageVersion version, ref Message fault)
    {
        if (error is FaultException)
            return; // Already a fault exception
        
        var faultDetail = new ServiceFault
        {
            ErrorCode = "INTERNAL_ERROR",
            Message = "An error occurred processing your request",
            CorrelationId = OperationContext.Current.SessionId,
            Timestamp = DateTime.UtcNow
        };
        
        var faultException = new FaultException<ServiceFault>(faultDetail);
        var messageFault = faultException.CreateMessageFault();
        fault = Message.CreateMessage(version, messageFault, faultException.Action);
    }
}
```

## Testing Requirements

### 1. Error Response Schema Test
```csharp
[Test]
public async Task CreateReservation_ValidationError_ReturnsStandardErrorSchema()
{
    // Arrange
    var invalidRequest = new { checkInDate = "invalid" };
    
    // Act
    var response = await _httpClient.PostAsJsonAsync("/api/reservations", invalidRequest);
    
    // Assert
    Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
    
    var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
    Assert.IsNotNull(error.ErrorCode);
    Assert.IsNotNull(error.Message);
    Assert.IsNotNull(error.CorrelationId);
    Assert.IsNotNull(error.Timestamp);
}
```

### 2. Correlation ID Propagation Test
```csharp
[Test]
public async Task GetProperty_PropagatesCorrelationId()
{
    // Arrange
    var correlationId = Guid.NewGuid().ToString();
    _httpClient.DefaultRequestHeaders.Add("X-Correlation-Id", correlationId);
    
    // Act
    var response = await _httpClient.GetAsync("/api/properties/123");
    
    // Assert - correlation ID returned in response
    Assert.IsTrue(response.Headers.Contains("X-Correlation-Id"));
    Assert.AreEqual(correlationId, response.Headers.GetValues("X-Correlation-Id").First());
}
```

## Review Output Format

```markdown
### Category U: Error Handling & Fault Contracts

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| ReservationController.cs | 67 | Stack trace exposed in error response | 🟠 MAJOR | Use sanitized ErrorResponse DTO |
| PropertyService.cs | 45 | Empty catch block swallows exception | 🟠 MAJOR | Log error before swallowing |
| IReservationService.cs | 23 | No FaultContract for validation errors | 🟡 WARNING | Add FaultContract attributes |
| ExternalApiClient.cs | 89 | No correlation ID in downstream calls | 🟡 WARNING | Add X-Correlation-Id header |

**Category Status:** ⚠️ WARNING (0 critical issues, 2 major issues)
**Blocking:** NO - But should be fixed before production
**Recommendation:** Implement global exception handler with standardized error responses
```

## References
- [WCF Fault Contracts](https://docs.microsoft.com/en-us/dotnet/framework/wcf/specifying-and-handling-faults-in-contracts-and-services)
- [Problem Details for HTTP APIs (RFC 7807)](https://datatracker.ietf.org/doc/html/rfc7807)
- [ASP.NET Core Error Handling](https://docs.microsoft.com/en-us/aspnet/core/web-api/handle-errors)
