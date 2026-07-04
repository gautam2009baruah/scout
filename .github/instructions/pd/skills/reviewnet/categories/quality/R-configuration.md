# Category R: Configuration & Feature Flags

## Priority: MEDIUM (Phase 4)
**Blocking Status:** NO - But configuration errors cause runtime failures

## Overview
Validates configuration management, feature flag implementation, environment-specific settings, and secrets handling to prevent runtime configuration errors and deployment failures.

## Critical Checks

### 1. Configuration Defaults & Migration
- [ ] New config keys have default values or migration scripts
- [ ] Default values documented in appsettings.json
- [ ] Configuration schema validated on startup
- [ ] Missing config keys detected early (fail fast on startup)
- [ ] Breaking config changes flagged for deployment coordination

### 2. Environment-Specific Configuration
- [ ] No hardcoded environment-specific values (URLs, server names, ports)
- [ ] Environment transformation files consistent (dev, staging, prod)
- [ ] Connection strings parameterized (not hardcoded)
- [ ] Environment variable overrides supported
- [ ] Configuration per environment tested

### 3. Secrets Management
- [ ] No secrets in appsettings.json (API keys, passwords, connection strings)
- [ ] Secrets stored in Azure Key Vault / AWS Secrets Manager / HashiCorp Vault
- [ ] Secrets loaded at runtime (not compile time)
- [ ] No secrets in source control (checked via `.gitignore`)
- [ ] Secrets rotation strategy defined

### 4. Feature Flags
- [ ] Feature flags implemented consistently (not scattered `if` statements)
- [ ] Feature flag names documented
- [ ] Feature flag defaults defined
- [ ] Feature flags removable (not permanent technical debt)
- [ ] Feature flag state logged at startup
- [ ] A/B test flags tracked with metrics

### 5. Configuration Validation
- [ ] Configuration values validated on startup (ranges, formats)
- [ ] Invalid configuration prevents application startup (fail fast)
- [ ] Configuration changes logged
- [ ] Required vs optional configuration distinguished
- [ ] Type-safe configuration classes (not raw strings everywhere)

### 6. Dependency Injection Configuration
- [ ] DI registrations environment-aware (mock external services in dev)
- [ ] Configuration classes registered in DI container
- [ ] `IOptions<T>` pattern used for strongly-typed config
- [ ] Configuration reload supported for non-secret values
- [ ] DI configuration errors detected at startup (ValidateOnStart)

### 7. Logging Configuration
- [ ] Log levels configurable per environment (Debug in dev, Info in prod)
- [ ] Sensitive data not logged (credit cards, passwords)
- [ ] Log retention policy defined
- [ ] Log aggregation configured (Splunk, ELK, Azure Monitor)
- [ ] Structured logging used (not string interpolation)

## Common Violations

### ❌ BAD: Hardcoded connection string
```csharp
public class ReservationRepository
{
    private const string ConnectionString = 
        "Server=prod-db.synxis.com;Database=Reservations;User=admin;Password=P@ssw0rd";
    // Hardcoded credentials, server name - WRONG!
}
```

### ✅ GOOD: Connection string from configuration
```csharp
public class ReservationRepository
{
    private readonly string _connectionString;
    
    public ReservationRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("ReservationsDb");
    }
}

// appsettings.json
{
  "ConnectionStrings": {
    "ReservationsDb": "Server=#{DbServer}#;Database=Reservations;..."
  }
}

// appsettings.Production.json
{
  "ConnectionStrings": {
    "ReservationsDb": "Server=prod-db.synxis.com;Database=Reservations;..."
  }
}
```

### ❌ BAD: API key in source code
```csharp
public class PropertyApiClient
{
    private const string ApiKey = "sk_live_abc123xyz"; // Secret in source control!
    
    public async Task<Property> GetProperty(int id)
    {
        _httpClient.DefaultRequestHeaders.Add("X-API-Key", ApiKey);
        ...
    }
}
```

### ✅ GOOD: API key from Azure Key Vault
```csharp
public class PropertyApiClient
{
    private readonly string _apiKey;
    
    public PropertyApiClient(IConfiguration configuration)
    {
        _apiKey = configuration["PropertyApi:ApiKey"]; // Loaded from Key Vault
    }
    
    public async Task<Property> GetProperty(int id)
    {
        _httpClient.DefaultRequestHeaders.Add("X-API-Key", _apiKey);
        ...
    }
}

// Program.cs
var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsProduction())
{
    var keyVaultUrl = builder.Configuration["KeyVaultUrl"];
    builder.Configuration.AddAzureKeyVault(
        new Uri(keyVaultUrl),
        new DefaultAzureCredential());
}
```

### ❌ BAD: Feature flag scattered throughout code
```csharp
public class ReservationService
{
    public ReservationResponse CreateReservation(ReservationRequest request)
    {
        if (ConfigurationManager.AppSettings["EnableLoyaltyPoints"] == "true")
        {
            // Loyalty logic
        }
        
        if (ConfigurationManager.AppSettings["EnableLoyaltyPoints"] == "true")
        {
            // More loyalty logic - duplicated check!
        }
    }
}
```

### ✅ GOOD: Feature flag centralized
```csharp
public class FeatureFlags
{
    public bool EnableLoyaltyPoints { get; set; }
    public bool EnableDynamicPricing { get; set; }
    public bool EnableGuestPreferences { get; set; }
}

public class ReservationService
{
    private readonly IOptions<FeatureFlags> _featureFlags;
    
    public ReservationService(IOptions<FeatureFlags> featureFlags)
    {
        _featureFlags = featureFlags;
    }
    
    public ReservationResponse CreateReservation(ReservationRequest request)
    {
        if (_featureFlags.Value.EnableLoyaltyPoints)
        {
            ApplyLoyaltyPoints(request);
        }
    }
}

// appsettings.json
{
  "FeatureFlags": {
    "EnableLoyaltyPoints": false,
    "EnableDynamicPricing": true,
    "EnableGuestPreferences": false
  }
}
```

### ❌ BAD: No configuration validation
```csharp
public class EmailService
{
    private readonly string _smtpServer;
    private readonly int _smtpPort;
    
    public EmailService(IConfiguration configuration)
    {
        _smtpServer = configuration["Email:SmtpServer"]; // Could be null!
        _smtpPort = int.Parse(configuration["Email:SmtpPort"]); // Could throw!
    }
}
```

### ✅ GOOD: Configuration validation on startup
```csharp
public class EmailSettings
{
    [Required]
    public string SmtpServer { get; set; }
    
    [Range(1, 65535)]
    public int SmtpPort { get; set; }
    
    [Required, EmailAddress]
    public string FromAddress { get; set; }
}

// Program.cs
builder.Services.AddOptions<EmailSettings>()
    .Bind(builder.Configuration.GetSection("Email"))
    .ValidateDataAnnotations()
    .ValidateOnStart(); // Fail fast on startup if invalid

public class EmailService
{
    private readonly EmailSettings _settings;
    
    public EmailService(IOptions<EmailSettings> settings)
    {
        _settings = settings.Value;
    }
}
```

### ❌ BAD: Environment-specific code branches
```csharp
public void ConfigureServices(IServiceCollection services)
{
    if (Environment.MachineName == "DEV-SERVER-01")
    {
        services.AddSingleton<IPaymentGateway, MockPaymentGateway>();
    }
    else if (Environment.MachineName == "PROD-SERVER-01")
    {
        services.AddSingleton<IPaymentGateway, RealPaymentGateway>();
    }
    // Machine-specific logic - FRAGILE!
}
```

### ✅ GOOD: Environment-based configuration
```csharp
public void ConfigureServices(IServiceCollection services)
{
    if (_environment.IsDevelopment())
    {
        services.AddSingleton<IPaymentGateway, MockPaymentGateway>();
    }
    else
    {
        services.AddSingleton<IPaymentGateway, RealPaymentGateway>();
    }
}

// Or even better: configuration-driven
public void ConfigureServices(IServiceCollection services)
{
    var paymentGatewayType = _configuration["PaymentGateway:Type"]; // "Mock" or "Real"
    
    if (paymentGatewayType == "Mock")
        services.AddSingleton<IPaymentGateway, MockPaymentGateway>();
    else
        services.AddSingleton<IPaymentGateway, RealPaymentGateway>();
}
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| Secrets in source control | 🔴 CRITICAL | ✅ YES | Security violation |
| Hardcoded production URLs | 🟠 MAJOR | ⚠️ PARTIAL | Deployment fails |
| No config validation | 🟡 WARNING | ❌ NO | Runtime errors |
| Feature flags not centralized | 🟡 WARNING | ❌ NO | Technical debt |
| Missing default config values | 🟠 MAJOR | ⚠️ PARTIAL | Deployment fails |
| Environment-specific code branches | 🟡 WARNING | ❌ NO | Fragile, hard to test |

## Remediation Patterns

### Pattern 1: Strongly-Typed Configuration
```csharp
public class SynxisApiSettings
{
    public string BaseUrl { get; set; }
    public string ApiKey { get; set; }
    public int TimeoutSeconds { get; set; }
    public bool EnableRetry { get; set; }
}

// Startup.cs
services.Configure<SynxisApiSettings>(
    configuration.GetSection("SynxisApi"));

// Usage
public class SynxisApiClient
{
    private readonly SynxisApiSettings _settings;
    
    public SynxisApiClient(IOptions<SynxisApiSettings> settings)
    {
        _settings = settings.Value;
    }
}
```

### Pattern 2: Feature Management (Microsoft.FeatureManagement)
```csharp
// appsettings.json
{
  "FeatureManagement": {
    "LoyaltyPoints": true,
    "DynamicPricing": {
      "EnabledFor": [
        {
          "Name": "Percentage",
          "Parameters": {
            "Value": 50
          }
        }
      ]
    }
  }
}

// Startup.cs
services.AddFeatureManagement();

// Usage
public class ReservationService
{
    private readonly IFeatureManager _featureManager;
    
    public async Task<ReservationResponse> CreateReservation(ReservationRequest request)
    {
        if (await _featureManager.IsEnabledAsync("LoyaltyPoints"))
        {
            ApplyLoyaltyPoints(request);
        }
    }
}
```

### Pattern 3: Azure Key Vault Integration
```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    var keyVaultUrl = builder.Configuration["KeyVault:Url"];
    var credential = new DefaultAzureCredential();
    
    builder.Configuration.AddAzureKeyVault(
        new Uri(keyVaultUrl),
        credential);
}

// Secrets automatically loaded from Key Vault
// Configuration["DatabasePassword"] resolves to Key Vault secret
```

### Pattern 4: Configuration Validation
```csharp
public class DatabaseSettings : IValidatableObject
{
    [Required]
    public string Server { get; set; }
    
    [Required]
    public string Database { get; set; }
    
    [Range(1, 300)]
    public int CommandTimeoutSeconds { get; set; } = 30;
    
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Server.Contains("localhost") && 
            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production")
        {
            yield return new ValidationResult(
                "Cannot use localhost database server in production",
                new[] { nameof(Server) });
        }
    }
}
```

## Testing Requirements

### 1. Configuration Loading Test
```csharp
[Test]
public void Configuration_LoadsCorrectly()
{
    // Arrange
    var config = new ConfigurationBuilder()
        .AddJsonFile("appsettings.json")
        .Build();
    
    // Act
    var emailSettings = config.GetSection("Email").Get<EmailSettings>();
    
    // Assert
    Assert.IsNotNull(emailSettings);
    Assert.IsNotNull(emailSettings.SmtpServer);
    Assert.Greater(emailSettings.SmtpPort, 0);
}
```

### 2. Feature Flag Test
```csharp
[Test]
public async Task ReservationService_WhenLoyaltyDisabled_SkipsLoyaltyLogic()
{
    // Arrange
    var featureManager = new Mock<IFeatureManager>();
    featureManager.Setup(f => f.IsEnabledAsync("LoyaltyPoints"))
        .ReturnsAsync(false);
    
    var service = new ReservationService(featureManager.Object);
    
    // Act
    var result = await service.CreateReservation(new ReservationRequest());
    
    // Assert
    Assert.AreEqual(0, result.LoyaltyPointsEarned);
}
```

## Review Output Format

```markdown
### Category R: Configuration & Feature Flags

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| PropertyApiClient.cs | 12 | API key hardcoded in source | 🔴 CRITICAL | Move to Key Vault |
| ReservationRepository.cs | 23 | Hardcoded connection string | 🟠 MAJOR | Use IConfiguration |
| EmailService.cs | 45 | No config validation | 🟡 WARNING | Use IOptions with ValidateOnStart |
| ReservationService.cs | 78 | Feature flag check duplicated | 🟡 WARNING | Use IFeatureManager |

**Category Status:** ❌ FAIL (1 critical security issue)
**Blocking:** YES - Secrets in source control must be removed
**Recommendation:** Migrate all secrets to Azure Key Vault
```

## References
- [Configuration in ASP.NET Core](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/configuration/)
- [Azure Key Vault Configuration Provider](https://docs.microsoft.com/en-us/aspnet/core/security/key-vault-configuration)
- [Microsoft.FeatureManagement](https://github.com/microsoft/FeatureManagement-Dotnet)
- [Options Pattern](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/configuration/options)
