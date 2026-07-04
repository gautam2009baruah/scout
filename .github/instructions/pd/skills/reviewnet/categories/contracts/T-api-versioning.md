# Category T: API Versioning & Contract Evolution

## Priority: HIGH (Phase 2)
**Blocking Status:** YES - Breaking contract changes block backward compatibility

## Overview
Validates API versioning strategy, contract evolution patterns, and ensures v1 API stability when introducing v2 endpoints. Critical for SOAP/WCF services, REST APIs, and OpenAPI contracts in hospitality integrations.

## Critical Checks

### 1. Versioning Strategy Consistency
- [ ] Versioning mechanism consistent across all endpoints (URL path, header, query param)
- [ ] Version explicitly specified (not defaulting to latest)
- [ ] v1 routes unchanged when v2 introduced
- [ ] Version negotiation logic tested
- [ ] Content negotiation headers respected (`Accept`, `Content-Type`)

### 2. WSDL/SOAP Contract Changes
- [ ] WSDL version incremented for breaking changes
- [ ] Namespace versioning follows convention (`http://schemas.synxis.com/2024/v2/`)
- [ ] Message contracts backward compatible (optional new elements only)
- [ ] `[ServiceContract]` namespace attribute updated
- [ ] `[DataContract]` namespace versioned for breaking changes
- [ ] SOAP fault contracts preserved across versions

### 3. REST API Versioning
- [ ] URL path versioning (`/api/v1/reservations` vs `/api/v2/reservations`)
- [ ] Header-based versioning validated (`X-API-Version: 2`)
- [ ] Query parameter versioning documented (`?api-version=2`)
- [ ] OpenAPI/Swagger spec includes all versions
- [ ] Deprecation headers added (`Deprecation: true`, `Sunset: 2024-12-31`)

### 4. Data Contract Evolution
- [ ] New properties marked as optional (`[DataMember(IsRequired = false)]`)
- [ ] No required properties added to existing contracts
- [ ] Enum values not removed (only added)
- [ ] Collection properties default to empty (not null)
- [ ] DateTime precision preserved (no timezone changes without version bump)
- [ ] Decimal precision preserved (no scale changes)

### 5. Breaking Change Detection
- [ ] Property renames flagged as breaking
- [ ] Property type changes flagged as breaking
- [ ] Endpoint removal flagged as breaking
- [ ] HTTP verb changes flagged as breaking
- [ ] Response status code changes validated
- [ ] Error response schema changes validated

### 6. Deprecation Strategy
- [ ] Deprecated endpoints return warning headers
- [ ] Deprecation notices in API documentation
- [ ] Sunset date communicated to consumers
- [ ] Migration guide provided for deprecated features
- [ ] v1 endpoints maintained for minimum 6 months after v2 release
- [ ] Telemetry tracks deprecated endpoint usage

### 7. Client Compatibility
- [ ] v1 clients continue to work after v2 deployment
- [ ] Default version specified (usually latest stable, not bleeding edge)
- [ ] Version mismatch returns clear error (`406 Not Acceptable`)
- [ ] Client SDK packages versioned separately
- [ ] Integration tests cover multi-version scenarios

## Common Violations

### ❌ BAD: v1 endpoint modified instead of creating v2
```csharp
// BREAKING CHANGE - modifies existing v1 contract
[Route("api/reservations")]
[HttpPost]
public ReservationResponse CreateReservation(ReservationRequest request)
{
    // Added new required property "LoyaltyNumber" - breaks v1 clients!
    if (string.IsNullOrEmpty(request.LoyaltyNumber))
        return BadRequest("LoyaltyNumber is required");
    ...
}
```

### ✅ GOOD: v2 endpoint created, v1 preserved
```csharp
// v1 endpoint unchanged
[Route("api/v1/reservations")]
[HttpPost]
public ReservationResponse CreateReservationV1(ReservationRequestV1 request)
{
    // Original logic preserved
    ...
}

// v2 endpoint with new requirements
[Route("api/v2/reservations")]
[HttpPost]
public ReservationResponseV2 CreateReservationV2(ReservationRequestV2 request)
{
    // New required property OK in v2
    if (string.IsNullOrEmpty(request.LoyaltyNumber))
        return BadRequest("LoyaltyNumber is required");
    ...
}
```

### ❌ BAD: WSDL contract modified without version increment
```csharp
// BREAKING - namespace unchanged but contract modified
[ServiceContract(Namespace = "http://schemas.synxis.com/reservations/")]
public interface IReservationService
{
    [OperationContract]
    ReservationResponse CreateReservation(ReservationRequest request);
}

[DataContract]
public class ReservationRequest
{
    [DataMember(IsRequired = true)] // Changed from false to true - BREAKS CLIENTS!
    public string GuestEmail { get; set; }
}
```

### ✅ GOOD: Namespace versioned, v1 contract preserved
```csharp
// v1 service unchanged
[ServiceContract(Namespace = "http://schemas.synxis.com/reservations/v1/")]
public interface IReservationServiceV1
{
    [OperationContract]
    ReservationResponse CreateReservation(ReservationRequest request);
}

// v2 service with breaking changes
[ServiceContract(Namespace = "http://schemas.synxis.com/reservations/v2/")]
public interface IReservationServiceV2
{
    [OperationContract]
    ReservationResponseV2 CreateReservation(ReservationRequestV2 request);
}

[DataContract(Namespace = "http://schemas.synxis.com/reservations/v2/")]
public class ReservationRequestV2
{
    [DataMember(IsRequired = true)] // OK - new contract version
    public string GuestEmail { get; set; }
}
```

### ❌ BAD: Enum value removed (breaking change)
```csharp
public enum ReservationStatus
{
    Pending = 0,
    Confirmed = 1,
    // Cancelled = 2,  // REMOVED - breaks existing data!
    CheckedIn = 3,
    CheckedOut = 4
}
```

### ✅ GOOD: Enum value deprecated, not removed
```csharp
public enum ReservationStatus
{
    Pending = 0,
    Confirmed = 1,
    [Obsolete("Use Confirmed with CancellationDate instead")]
    Cancelled = 2,  // Deprecated but still supported
    CheckedIn = 3,
    CheckedOut = 4
}
```

### ❌ BAD: No deprecation warning for old endpoint
```csharp
[Route("api/properties")]
[HttpGet]
public List<Property> GetProperties()
{
    // Old implementation, should be deprecated
    ...
}
```

### ✅ GOOD: Deprecation headers and sunset date
```csharp
[Route("api/v1/properties")]
[HttpGet]
public IActionResult GetPropertiesV1()
{
    Response.Headers.Add("Deprecation", "true");
    Response.Headers.Add("Sunset", "2024-12-31");
    Response.Headers.Add("Link", "</api/v2/properties>; rel=\"successor-version\"");
    
    // Log usage for monitoring
    _telemetry.TrackDeprecatedEndpoint("GET /api/v1/properties");
    
    var properties = _service.GetProperties();
    return Ok(properties);
}
```

### ❌ BAD: Property type changed without versioning
```csharp
// Before: string
public string CheckInDate { get; set; } // "2024-05-15"

// After: DateTime - BREAKS JSON deserialization for v1 clients!
public DateTime CheckInDate { get; set; }
```

### ✅ GOOD: New property added, old preserved
```csharp
// v1 contract preserved
[DataMember]
public string CheckInDate { get; set; } // "2024-05-15"

// v2 contract with typed property
[DataMember]
public DateTime CheckInDateTime { get; set; }

// Internal mapping for backward compatibility
public void SetCheckInDate(DateTime dateTime)
{
    CheckInDateTime = dateTime;
    CheckInDate = dateTime.ToString("yyyy-MM-dd");
}
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| v1 endpoint modified (breaking) | 🔴 CRITICAL | ✅ YES | Breaks existing clients |
| Required property added to existing contract | 🔴 CRITICAL | ✅ YES | Deserialization fails |
| Enum value removed | 🔴 CRITICAL | ✅ YES | Data corruption risk |
| Property renamed | 🔴 CRITICAL | ✅ YES | Breaking change |
| WSDL namespace not versioned | 🟠 MAJOR | ⚠️ PARTIAL | Contract unclear |
| No deprecation headers | 🟡 WARNING | ❌ NO | Poor client experience |
| Version not in URL path | 🟡 WARNING | ❌ NO | Inconsistent convention |
| No migration guide for deprecated API | 🟡 WARNING | ❌ NO | Hard to upgrade clients |

## Remediation Patterns

### Pattern 1: URL Path Versioning (Recommended)
```csharp
[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
[ApiVersion("1.0")]
[ApiVersion("2.0")]
public class ReservationsController : ControllerBase
{
    [HttpGet]
    [MapToApiVersion("1.0")]
    public IActionResult GetReservationsV1([FromQuery] FilterV1 filter)
    {
        // v1 logic
    }
    
    [HttpGet]
    [MapToApiVersion("2.0")]
    public IActionResult GetReservationsV2([FromQuery] FilterV2 filter)
    {
        // v2 logic with new filtering options
    }
}
```

### Pattern 2: Header-Based Versioning
```csharp
[HttpGet]
[Route("api/reservations")]
public IActionResult GetReservations([FromHeader(Name = "X-API-Version")] string apiVersion)
{
    return apiVersion switch
    {
        "1" or "1.0" => GetReservationsV1(),
        "2" or "2.0" => GetReservationsV2(),
        _ => StatusCode(406, "Unsupported API version")
    };
}
```

### Pattern 3: Contract Versioning with Adapters
```csharp
// v1 contract (unchanged)
public class ReservationV1
{
    public string GuestName { get; set; }
    public string CheckInDate { get; set; } // string format
}

// v2 contract (new features)
public class ReservationV2
{
    public GuestDetails Guest { get; set; } // Expanded object
    public DateTime CheckInDateTime { get; set; } // Typed property
    public decimal? LoyaltyPoints { get; set; } // Optional new field
}

// Adapter for backward compatibility
public class ReservationAdapter
{
    public static ReservationV1 ToV1(ReservationV2 v2)
    {
        return new ReservationV1
        {
            GuestName = v2.Guest?.FullName,
            CheckInDate = v2.CheckInDateTime.ToString("yyyy-MM-dd")
        };
    }
    
    public static ReservationV2 ToV2(ReservationV1 v1)
    {
        return new ReservationV2
        {
            Guest = new GuestDetails { FullName = v1.GuestName },
            CheckInDateTime = DateTime.Parse(v1.CheckInDate),
            LoyaltyPoints = null // Not available in v1
        };
    }
}
```

### Pattern 4: Swagger Versioning
```csharp
// Startup.cs
services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "SynXis Reservation API v1",
        Version = "v1",
        Description = "Legacy API - deprecated, sunset 2024-12-31"
    });
    
    options.SwaggerDoc("v2", new OpenApiInfo
    {
        Title = "SynXis Reservation API v2",
        Version = "v2",
        Description = "Current API - recommended for new integrations"
    });
    
    options.DocInclusionPredicate((version, apiDescription) =>
    {
        var versions = apiDescription.ActionDescriptor
            .GetApiVersionModel()
            .DeclaredApiVersions
            .Select(v => $"v{v}");
        
        return versions.Contains(version);
    });
});
```

## Testing Requirements

### 1. Multi-Version Integration Test
```csharp
[Test]
public async Task CreateReservation_V1AndV2ClientsBothWork()
{
    // v1 client
    var v1Request = new { guestName = "John Doe", checkInDate = "2024-05-15" };
    var v1Response = await _httpClient.PostAsJsonAsync("/api/v1/reservations", v1Request);
    Assert.AreEqual(HttpStatusCode.OK, v1Response.StatusCode);
    
    // v2 client
    var v2Request = new
    {
        guest = new { fullName = "Jane Smith" },
        checkInDateTime = new DateTime(2024, 5, 15),
        loyaltyPoints = 100
    };
    var v2Response = await _httpClient.PostAsJsonAsync("/api/v2/reservations", v2Request);
    Assert.AreEqual(HttpStatusCode.OK, v2Response.StatusCode);
}
```

### 2. Deprecation Header Test
```csharp
[Test]
public async Task GetProperties_V1ReturnsDeprecationHeaders()
{
    // Act
    var response = await _httpClient.GetAsync("/api/v1/properties");
    
    // Assert
    Assert.IsTrue(response.Headers.Contains("Deprecation"));
    Assert.AreEqual("true", response.Headers.GetValues("Deprecation").First());
    Assert.IsTrue(response.Headers.Contains("Sunset"));
}
```

### 3. Contract Compatibility Test
```csharp
[Test]
public void ReservationV1_DeserializesFromV2Response()
{
    // Arrange
    var v2Json = @"{
        ""guest"": { ""fullName"": ""John Doe"" },
        ""checkInDateTime"": ""2024-05-15T14:00:00Z"",
        ""loyaltyPoints"": 100
    }";
    
    // Act - should not throw even with extra properties
    var v1Model = JsonConvert.DeserializeObject<ReservationV1>(v2Json);
    
    // Assert
    Assert.IsNotNull(v1Model);
}
```

## Review Output Format

```markdown
### Category T: API Versioning & Contract Evolution

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| ReservationController.cs | 45 | v1 endpoint modified (required field added) | 🔴 CRITICAL | Create v2 endpoint, preserve v1 |
| ReservationRequest.cs | 23 | Property renamed without versioning | 🔴 CRITICAL | Add new property, keep old for v1 |
| IReservationService.cs | 12 | WSDL namespace not versioned | 🟠 MAJOR | Update namespace to include /v2/ |
| PropertyController.cs | 67 | Deprecated endpoint missing headers | 🟡 WARNING | Add Deprecation and Sunset headers |

**Category Status:** ❌ FAIL (2 critical breaking changes found)
**Blocking:** YES - v1 clients will fail after deployment
**Recommendation:** Create versioned v2 contracts and preserve v1 unchanged
```

## References
- [ASP.NET Core API Versioning](https://github.com/dotnet/aspnet-api-versioning)
- [Semantic Versioning](https://semver.org/)
- [RFC 8594 - Sunset Header](https://datatracker.ietf.org/doc/html/rfc8594)
- [WCF Versioning Strategies](https://docs.microsoft.com/en-us/dotnet/framework/wcf/feature-details/service-versioning)
