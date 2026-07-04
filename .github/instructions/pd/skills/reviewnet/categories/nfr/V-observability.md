# Category V: Observability & Monitoring

## Priority: MEDIUM (Phase 5)
**Blocking Status:** NO - But affects production debugging and alerting

## Overview
Validates telemetry, metrics, health checks, distributed tracing, and monitoring hooks to ensure production systems are observable, debuggable, and alertable.

## Critical Checks

### 1. Health Check Endpoints
- [ ] Health check endpoint functional (`/health`, `/ready`, `/live`)
- [ ] Health checks validate critical dependencies (database, external APIs)
- [ ] Health check timeout configured (don't hang indefinitely)
- [ ] Readiness vs liveness checks distinguished (Kubernetes)
- [ ] Health check response includes component status details

### 2. Metrics & Telemetry
- [ ] Metrics emitted for key business operations (reservations created, searches performed)
- [ ] Success/failure counts tracked
- [ ] Duration metrics for critical operations
- [ ] Performance counters updated (requests/sec, error rate)
- [ ] Custom metrics follow naming convention

### 3. Distributed Tracing
- [ ] Distributed tracing context propagated (`ActivityId`, `TraceId`, `SpanId`)
- [ ] Correlation IDs passed to downstream services
- [ ] Parent-child span relationships preserved
- [ ] Trace sampling configured (not 100% in production)
- [ ] Trace context injected into HTTP headers

### 4. Logging for Observability
- [ ] Structured logging used (not string interpolation)
- [ ] Log levels appropriate (Debug in dev, Info/Warning/Error in prod)
- [ ] Correlation IDs included in all log entries
- [ ] Exception details logged with stack traces
- [ ] No excessive logging in hot paths (performance impact)
- [ ] PII not logged (guest names, credit cards)

### 5. Alerting Thresholds
- [ ] Alerting thresholds documented for critical metrics
- [ ] Alert definitions updated for new features
- [ ] SLO/SLA metrics tracked (uptime, latency, error rate)
- [ ] Alert fatigue avoided (not too many false positives)
- [ ] Runbook links included in alerts

### 6. Dashboard Compatibility
- [ ] Dashboard queries compatible with new schema changes
- [ ] New metrics added to relevant dashboards
- [ ] Dashboard filters updated for new enum values
- [ ] Time series data retention considered

### 7. Performance Telemetry
- [ ] No excessive telemetry in critical paths (async emission preferred)
- [ ] Telemetry batching used for high-throughput scenarios
- [ ] Telemetry does not block main operation (fire-and-forget)
- [ ] Telemetry overhead measured (<1% of operation time)

## Common Violations

### ❌ BAD: No health check endpoint
```csharp
// No health check implementation - cannot detect service degradation
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        // No health check services registered
    }
    
    public void Configure(IApplicationBuilder app)
    {
        // No health check endpoint
    }
}
```

### ✅ GOOD: Health check with dependency validation
```csharp
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddHealthChecks()
            .AddSqlServer(connectionString, name: "database")
            .AddUrlGroup(new Uri("https://api.synxis.com/health"), name: "external-api")
            .AddCheck<ReservationServiceHealthCheck>("reservation-service");
    }
    
    public void Configure(IApplicationBuilder app)
    {
        app.UseHealthChecks("/health", new HealthCheckOptions
        {
            ResponseWriter = async (context, report) =>
            {
                context.Response.ContentType = "application/json";
                var response = new
                {
                    status = report.Status.ToString(),
                    checks = report.Entries.Select(e => new
                    {
                        name = e.Key,
                        status = e.Value.Status.ToString(),
                        description = e.Value.Description,
                        duration = e.Value.Duration.TotalMilliseconds
                    })
                };
                await context.Response.WriteAsJsonAsync(response);
            }
        });
    }
}
```

### ❌ BAD: No metrics for business operations
```csharp
public ReservationResponse CreateReservation(ReservationRequest request)
{
    var reservation = new Reservation { ... };
    _repository.Save(reservation);
    return new ReservationResponse { Success = true };
    // No metrics - cannot track reservation creation rate or errors
}
```

### ✅ GOOD: Metrics emitted for success/failure
```csharp
private readonly IMetricsClient _metrics;

public ReservationResponse CreateReservation(ReservationRequest request)
{
    var stopwatch = Stopwatch.StartNew();
    
    try
    {
        var reservation = new Reservation { ... };
        _repository.Save(reservation);
        
        _metrics.Increment("reservations.created");
        _metrics.Timing("reservations.create.duration", stopwatch.Elapsed.TotalMilliseconds);
        
        return new ReservationResponse { Success = true };
    }
    catch (Exception ex)
    {
        _metrics.Increment("reservations.create.errors");
        _logger.LogError(ex, "Failed to create reservation");
        throw;
    }
}
```

### ❌ BAD: String interpolation logging (not structured)
```csharp
public void ProcessReservation(int reservationId, string guestName)
{
    _logger.LogInformation($"Processing reservation {reservationId} for guest {guestName}");
    // Harder to query in log aggregation systems
}
```

### ✅ GOOD: Structured logging
```csharp
public void ProcessReservation(int reservationId, string guestName)
{
    _logger.LogInformation("Processing reservation {ReservationId} for guest {GuestName}", 
        reservationId, guestName);
    // Queryable fields: ReservationId, GuestName
}
```

### ❌ BAD: No distributed tracing context propagation
```csharp
public async Task<Property> GetPropertyAsync(int propertyId)
{
    var response = await _httpClient.GetAsync($"/properties/{propertyId}");
    // No trace context passed - cannot correlate downstream failures
    return await response.Content.ReadFromJsonAsync<Property>();
}
```

### ✅ GOOD: Trace context propagated
```csharp
public async Task<Property> GetPropertyAsync(int propertyId)
{
    using var activity = _activitySource.StartActivity("GetProperty");
    activity?.SetTag("propertyId", propertyId);
    
    var request = new HttpRequestMessage(HttpMethod.Get, $"/properties/{propertyId}");
    
    // Trace context automatically propagated via DiagnosticSource
    var response = await _httpClient.SendAsync(request);
    
    if (!response.IsSuccessStatusCode)
    {
        activity?.SetStatus(ActivityStatusCode.Error, "Property API call failed");
    }
    
    return await response.Content.ReadFromJsonAsync<Property>();
}
```

### ❌ BAD: Telemetry blocks main operation
```csharp
public void UpdateReservation(Reservation reservation)
{
    _repository.Update(reservation);
    
    // Blocking telemetry call - slows down main operation!
    _analyticsService.TrackEvent("ReservationUpdated", reservation).Wait();
}
```

### ✅ GOOD: Fire-and-forget telemetry
```csharp
public void UpdateReservation(Reservation reservation)
{
    _repository.Update(reservation);
    
    // Fire-and-forget - does not block
    _ = _analyticsService.TrackEventAsync("ReservationUpdated", reservation);
}
```

### ❌ BAD: No correlation ID in logs
```csharp
public void ProcessPayment(PaymentRequest request)
{
    _logger.LogInformation("Processing payment");
    // Cannot correlate with other log entries in same request
}
```

### ✅ GOOD: Correlation ID in all logs
```csharp
public class CorrelationMiddleware
{
    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var correlationId = context.Request.Headers["X-Correlation-Id"].FirstOrDefault() 
            ?? Guid.NewGuid().ToString();
        
        context.Items["CorrelationId"] = correlationId;
        context.Response.Headers.Add("X-Correlation-Id", correlationId);
        
        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = correlationId
        }))
        {
            await next(context);
        }
    }
}

// All logs now include CorrelationId automatically
public void ProcessPayment(PaymentRequest request)
{
    _logger.LogInformation("Processing payment for amount {Amount}", request.Amount);
    // Log entry includes CorrelationId from scope
}
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| No health check endpoint | 🟠 MAJOR | ⚠️ PARTIAL | Cannot detect service degradation |
| No metrics for business operations | 🟡 WARNING | ❌ NO | No visibility into operations |
| String interpolation logging | 🟡 WARNING | ❌ NO | Harder to query logs |
| No distributed tracing | 🟡 WARNING | ❌ NO | Harder to debug distributed failures |
| Telemetry blocks main operation | 🟡 WARNING | ❌ NO | Performance impact |
| PII in logs | 🔴 CRITICAL | ✅ YES | Data privacy violation |
| No correlation ID | 🟡 WARNING | ❌ NO | Harder to debug |

## Remediation Patterns

### Pattern 1: Application Insights Integration
```csharp
// Program.cs
builder.Services.AddApplicationInsightsTelemetry();

// Usage
public class ReservationService
{
    private readonly TelemetryClient _telemetry;
    
    public ReservationService(TelemetryClient telemetry)
    {
        _telemetry = telemetry;
    }
    
    public void CreateReservation(ReservationRequest request)
    {
        var stopwatch = Stopwatch.StartNew();
        
        try
        {
            // Business logic
            _repository.Save(reservation);
            
            // Track success metric
            _telemetry.TrackMetric("Reservations.Created", 1);
            _telemetry.TrackDependency("Database", "SaveReservation", 
                stopwatch.Elapsed, success: true);
        }
        catch (Exception ex)
        {
            _telemetry.TrackException(ex);
            _telemetry.TrackMetric("Reservations.Errors", 1);
            throw;
        }
    }
}
```

### Pattern 2: OpenTelemetry Integration
```csharp
// Program.cs
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSqlClientInstrumentation()
        .AddSource("SynxisReservations")
        .AddJaegerExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddPrometheusExporter());

// Usage
public class ReservationService
{
    private static readonly ActivitySource _activitySource = new ActivitySource("SynxisReservations");
    
    public async Task CreateReservationAsync(ReservationRequest request)
    {
        using var activity = _activitySource.StartActivity("CreateReservation");
        activity?.SetTag("reservation.propertyId", request.PropertyId);
        activity?.SetTag("reservation.checkInDate", request.CheckInDate);
        
        // Business logic with automatic trace propagation
        await _repository.SaveAsync(reservation);
        
        activity?.SetTag("reservation.id", reservation.Id);
    }
}
```

### Pattern 3: Custom Health Check
```csharp
public class ReservationServiceHealthCheck : IHealthCheck
{
    private readonly IReservationRepository _repository;
    
    public ReservationServiceHealthCheck(IReservationRepository repository)
    {
        _repository = repository;
    }
    
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Verify database connectivity
            await _repository.HealthCheckAsync(cancellationToken);
            
            // Verify critical data exists
            var criticalDataCount = await _repository.GetCriticalDataCountAsync(cancellationToken);
            
            if (criticalDataCount == 0)
            {
                return HealthCheckResult.Degraded("Critical data missing");
            }
            
            return HealthCheckResult.Healthy("Reservation service is healthy");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Reservation service is unhealthy", ex);
        }
    }
}
```

### Pattern 4: Prometheus Metrics
```csharp
public class ReservationMetrics
{
    private static readonly Counter _reservationsCreated = Metrics.CreateCounter(
        "synxis_reservations_created_total",
        "Total number of reservations created");
    
    private static readonly Counter _reservationErrors = Metrics.CreateCounter(
        "synxis_reservations_errors_total",
        "Total number of reservation errors");
    
    private static readonly Histogram _reservationDuration = Metrics.CreateHistogram(
        "synxis_reservation_duration_seconds",
        "Reservation creation duration in seconds");
    
    public void RecordCreated() => _reservationsCreated.Inc();
    public void RecordError() => _reservationErrors.Inc();
    public void RecordDuration(double seconds) => _reservationDuration.Observe(seconds);
}
```

## Testing Requirements

### 1. Health Check Test
```csharp
[Test]
public async Task HealthCheck_WhenDatabaseAvailable_ReturnsHealthy()
{
    // Arrange
    var healthCheck = new ReservationServiceHealthCheck(_repository);
    
    // Act
    var result = await healthCheck.CheckHealthAsync(new HealthCheckContext());
    
    // Assert
    Assert.AreEqual(HealthStatus.Healthy, result.Status);
}
```

### 2. Metrics Test
```csharp
[Test]
public void CreateReservation_Success_EmitsMetric()
{
    // Arrange
    var metricsMock = new Mock<IMetricsClient>();
    var service = new ReservationService(metricsMock.Object);
    
    // Act
    service.CreateReservation(new ReservationRequest());
    
    // Assert
    metricsMock.Verify(m => m.Increment("reservations.created"), Times.Once);
}
```

### 3. Distributed Tracing Test
```csharp
[Test]
public async Task GetProperty_PropagatesTraceContext()
{
    // Arrange
    var activity = new Activity("test").Start();
    
    // Act
    await _propertyService.GetPropertyAsync(123);
    
    // Assert
    // Verify trace ID propagated to HTTP client
    _httpMessageHandlerMock.Verify(h => h.SendAsync(
        It.Is<HttpRequestMessage>(req => 
            req.Headers.Contains("traceparent") &&
            req.Headers.GetValues("traceparent").First().Contains(activity.TraceId.ToString())),
        It.IsAny<CancellationToken>()));
}
```

## Review Output Format

```markdown
### Category V: Observability & Monitoring

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| Startup.cs | - | No health check endpoint | 🟠 MAJOR | Implement /health endpoint |
| ReservationService.cs | 56 | No metrics for business operations | 🟡 WARNING | Emit success/failure metrics |
| PaymentLogger.cs | 23 | String interpolation logging | 🟡 WARNING | Use structured logging |
| PropertyClient.cs | 45 | No distributed tracing | 🟡 WARNING | Propagate trace context |

**Category Status:** ⚠️ WARNING (1 major observability gap)
**Blocking:** NO - But production debugging will be difficult
**Recommendation:** Implement health checks and structured logging
```

## References
- [ASP.NET Core Health Checks](https://docs.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks)
- [Application Insights](https://docs.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)
- [OpenTelemetry for .NET](https://opentelemetry.io/docs/instrumentation/net/)
- [Prometheus .NET Client](https://github.com/prometheus-net/prometheus-net)
- [Distributed Tracing Concepts](https://docs.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts)
