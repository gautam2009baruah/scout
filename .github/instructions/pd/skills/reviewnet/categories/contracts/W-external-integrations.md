# Category W: External Integrations & Resilience

## Priority: HIGH (Phase 2)
**Blocking Status:** YES - External service failures cause production outages

---

## Overview

Validates resilience patterns for external API integrations, timeout configuration, retry logic, circuit breakers, and fallback strategies.

---

## Critical Checks

### 1. HTTP Client Configuration
- [ ] HTTP timeout configured (not infinite)
- [ ] `HttpClient` is singleton or injected (not per-request instantiation)
- [ ] Connection pooling configured appropriately
- [ ] DNS refresh interval set for cloud deployments

**Example:**
```csharp
// ✅ CORRECT - Singleton HttpClient with timeout
services.AddHttpClient<IChannelManagerClient, ChannelManagerClient>()
    .SetHandlerLifetime(TimeSpan.FromMinutes(5))
    .ConfigureHttpClient(client =>
    {
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Add("User-Agent", "SynXis/10.39");
    });

// ❌ INCORRECT - New HttpClient per request
public async Task<Reservation> GetReservation(int id)
{
    using var client = new HttpClient(); // Creates new connection per call
    var response = await client.GetAsync($"api/reservations/{id}");
    // No timeout configured
}
```

### 2. Timeout Configuration
- [ ] Read timeout set (typically 30-60 seconds)
- [ ] Connection timeout set
- [ ] Overall request timeout set
- [ ] Timeout appropriate for operation (sync faster than async)

**Example:**
```csharp
// ✅ CORRECT - Explicit timeouts
var httpClient = new HttpClient
{
    Timeout = TimeSpan.FromSeconds(30)
};

var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
var response = await httpClient.GetAsync(url, cts.Token);

// ❌ INCORRECT - No timeout (infinite wait)
var response = await httpClient.GetAsync(url);
```

### 3. Retry Logic with Exponential Backoff
- [ ] Transient failures retried (HTTP 5xx, network errors)
- [ ] Exponential backoff implemented
- [ ] Max retry count configured
- [ ] Jitter added to prevent thundering herd

**Example:**
```csharp
// ✅ CORRECT - Polly retry policy
services.AddHttpClient<IChannelManagerClient, ChannelManagerClient>()
    .AddTransientHttpErrorPolicy(policyBuilder =>
        policyBuilder.WaitAndRetryAsync(
            retryCount: 3,
            sleepDurationProvider: attempt => TimeSpan.FromSeconds(Math.Pow(2, attempt)),
            onRetry: (outcome, timespan, retryAttempt, context) =>
            {
                _logger.Warning($"Retry {retryAttempt} after {timespan.TotalSeconds}s due to {outcome.Exception?.Message}");
            }
        )
    );

// ❌ INCORRECT - No retry logic
var response = await _httpClient.GetAsync(url);
if (!response.IsSuccessStatusCode)
    throw new Exception("API call failed");
```

### 4. Circuit Breaker Pattern
- [ ] Circuit breaker configured for failing services
- [ ] Failure threshold defined (e.g., 5 failures in 30 seconds)
- [ ] Circuit opens after threshold exceeded
- [ ] Circuit half-opens after cooldown period
- [ ] Metrics logged for circuit state changes

**Example:**
```csharp
// ✅ CORRECT - Circuit breaker with Polly
services.AddHttpClient<IChannelManagerClient, ChannelManagerClient>()
    .AddTransientHttpErrorPolicy(policyBuilder =>
        policyBuilder.CircuitBreakerAsync(
            handledEventsAllowedBeforeBreaking: 5,
            durationOfBreak: TimeSpan.FromMinutes(1),
            onBreak: (outcome, timespan) =>
            {
                _logger.Error($"Circuit breaker opened for {timespan.TotalSeconds}s due to {outcome.Exception?.Message}");
            },
            onReset: () =>
            {
                _logger.Info("Circuit breaker reset");
            }
        )
    );

// ❌ INCORRECT - No circuit breaker (keeps calling failing service)
for (int i = 0; i < 100; i++)
{
    await _httpClient.GetAsync(url); // Hammers failing service
}
```

### 5. Fallback Logic
- [ ] Graceful degradation when external service unavailable
- [ ] Cached data returned when API fails
- [ ] Default values provided when external data missing
- [ ] User-facing error messages when fallback not possible

**Example:**
```csharp
// ✅ CORRECT - Fallback to cache
public async Task<HotelInventory> GetInventoryAsync(int hotelId)
{
    try
    {
        return await _channelManagerClient.GetInventoryAsync(hotelId);
    }
    catch (HttpRequestException ex)
    {
        _logger.Warning($"Channel manager unavailable, using cached inventory", ex);
        return await _cache.GetAsync<HotelInventory>($"inventory:{hotelId}");
    }
}

// ❌ INCORRECT - No fallback (propagates exception)
public async Task<HotelInventory> GetInventoryAsync(int hotelId)
{
    return await _channelManagerClient.GetInventoryAsync(hotelId);
    // If API fails, entire operation fails
}
```

### 6. External API Versioning
- [ ] API version specified in request (URL path, header, or query param)
- [ ] Version changes tested
- [ ] Deprecation notices handled
- [ ] Multiple API versions supported if needed

**Example:**
```csharp
// ✅ CORRECT - Versioned API endpoint
var response = await _httpClient.GetAsync("https://api.partner.com/v2/hotels");

// ❌ INCORRECT - Unversioned endpoint (breaks when API changes)
var response = await _httpClient.GetAsync("https://api.partner.com/hotels");
```

### 7. Rate Limiting & Throttling
- [ ] API rate limits respected (from partner documentation)
- [ ] Request throttling implemented
- [ ] `Retry-After` header honored (HTTP 429)
- [ ] Rate limit exceeded errors logged

**Example:**
```csharp
// ✅ CORRECT - Rate limiting with Polly
services.AddHttpClient<IChannelManagerClient, ChannelManagerClient>()
    .AddPolicyHandler(Policy.RateLimitAsync(
        numberOfExecutions: 100,
        perTimeSpan: TimeSpan.FromMinutes(1),
        maxBurst: 10
    ));

// ❌ INCORRECT - No rate limiting (exceeds partner limits)
for (int i = 0; i < 10000; i++)
{
    await _httpClient.GetAsync($"api/hotels/{i}");
}
```

### 8. Webhook Signature Verification
- [ ] Webhook payloads verified using HMAC signature
- [ ] Timestamp checked to prevent replay attacks
- [ ] Shared secret stored securely (not hardcoded)
- [ ] Invalid signatures rejected

**Example:**
```csharp
// ✅ CORRECT - Webhook signature verification
public IActionResult ReceiveWebhook([FromBody] string payload, [FromHeader(Name = "X-Signature")] string signature)
{
    var secret = _config["ChannelManager:WebhookSecret"];
    var computedSignature = ComputeHmacSha256(payload, secret);
    
    if (!string.Equals(signature, computedSignature, StringComparison.OrdinalIgnoreCase))
    {
        _logger.Warning("Invalid webhook signature received");
        return Unauthorized();
    }
    
    // Process webhook
}

// ❌ INCORRECT - No signature verification (security risk)
public IActionResult ReceiveWebhook([FromBody] WebhookPayload payload)
{
    ProcessWebhook(payload); // Accepts any payload
}
```

### 9. Idempotency Tokens
- [ ] Idempotency keys sent for non-idempotent operations
- [ ] Retries use same idempotency key
- [ ] Unique keys generated per logical operation
- [ ] Keys stored for duplicate detection

**Example:**
```csharp
// ✅ CORRECT - Idempotency token for booking
public async Task<Reservation> CreateReservationAsync(ReservationRequest request)
{
    var idempotencyKey = Guid.NewGuid().ToString();
    var httpRequest = new HttpRequestMessage(HttpMethod.Post, "api/reservations")
    {
        Content = JsonContent.Create(request),
        Headers = { { "Idempotency-Key", idempotencyKey } }
    };
    
    var response = await _httpClient.SendAsync(httpRequest);
    // If retry occurs, same idempotency key prevents duplicate booking
}

// ❌ INCORRECT - No idempotency (retry creates duplicate booking)
public async Task<Reservation> CreateReservationAsync(ReservationRequest request)
{
    var response = await _httpClient.PostAsJsonAsync("api/reservations", request);
    // Retry creates duplicate reservation
}
```

### 10. Correlation ID Propagation
- [ ] Correlation IDs passed to external APIs
- [ ] Correlation IDs logged for request tracing
- [ ] Correlation IDs returned in error responses
- [ ] Distributed tracing context propagated

**Example:**
```csharp
// ✅ CORRECT - Correlation ID propagation
public async Task<Reservation> GetReservationAsync(int id, string correlationId)
{
    var httpRequest = new HttpRequestMessage(HttpMethod.Get, $"api/reservations/{id}");
    httpRequest.Headers.Add("X-Correlation-ID", correlationId);
    
    _logger.Info($"Calling external API for reservation {id}", ("CorrelationId", correlationId).ToKvp());
    
    var response = await _httpClient.SendAsync(httpRequest);
}

// ❌ INCORRECT - No correlation ID (can't trace request across services)
public async Task<Reservation> GetReservationAsync(int id)
{
    var response = await _httpClient.GetAsync($"api/reservations/{id}");
}
```

---

## Common Violations

### Violation 1: Infinite Timeout
```csharp
// ❌ BAD - No timeout (hangs indefinitely if API slow)
var client = new HttpClient();
var response = await client.GetAsync(url);

// ✅ GOOD
var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
var response = await client.GetAsync(url);
```

### Violation 2: No Retry on Transient Failures
```csharp
// ❌ BAD - Single attempt (fails on transient network error)
var response = await _httpClient.GetAsync(url);

// ✅ GOOD - Retry with Polly
var response = await _retryPolicy.ExecuteAsync(() => _httpClient.GetAsync(url));
```

### Violation 3: New HttpClient Per Request
```csharp
// ❌ BAD - Exhausts sockets
public async Task<string> GetDataAsync()
{
    using var client = new HttpClient();
    return await client.GetStringAsync(url);
}

// ✅ GOOD - Singleton HttpClient
private readonly HttpClient _httpClient;
public MyService(HttpClient httpClient) => _httpClient = httpClient;
```

---

## SynXis-Specific External Integrations

### 1. Channel Managers (Expedia, Booking.com, OTAs)
- [ ] OTA XML/JSON schema validated
- [ ] Push/pull inventory synchronization resilient
- [ ] Rate parity enforced
- [ ] Connectivity failures logged to Splunk

### 2. Payment Gateways (Stripe, Authorize.Net)
- [ ] PCI compliance for tokenization
- [ ] Payment retry logic for declined transactions
- [ ] Idempotency for charge operations
- [ ] Webhook signature verification

### 3. GDS Systems (Sabre, Amadeus, Worldspan)
- [ ] SOAP contract version locked
- [ ] Connection pooling for GDS sessions
- [ ] Session timeout handling
- [ ] Fallback to cached GDS data

### 4. PMS Integrations (Opera, Protel)
- [ ] Bidirectional sync resilience
- [ ] Conflict resolution strategy
- [ ] Polling interval appropriate
- [ ] Error queue for failed syncs

---

## Severity Mapping

| Violation Type | Severity | Risk | Blocking? |
|----------------|----------|------|-----------|
| No timeout configured | 🔴 Critical | Service hangs | YES |
| New HttpClient per request | 🔴 Critical | Socket exhaustion | YES |
| No retry logic for booking API | 🔴 Critical | Lost revenue | YES |
| No webhook signature verification | 🔴 Critical | Security breach | YES |
| No idempotency for payment | 🔴 Critical | Duplicate charges | YES |
| No circuit breaker | 🟠 High | Cascading failures | YES |
| No rate limiting | 🟠 High | API ban | YES |
| No fallback for non-critical API | 🟡 Medium | Degraded UX | NO |
| Missing correlation ID | 🟡 Medium | Hard to debug | NO |

---

## Review Output Format

### Category W - External Integrations & Resilience
**Status**: [✅ PASS | ⚠️ FAIL | ➖ N/A]  
**Issues Found**: [count] | **Critical**: [count]

| # | Issue | File | External Service | Risk | Fix |
|---|-------|------|------------------|------|-----|
| 1 | [Issue description] | [file.cs](path#L10-L15) | [Expedia API] | 🔴 | [Add retry with backoff] |

**Summary**: [Brief description of resilience issues and recommended fixes]
