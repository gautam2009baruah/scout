# Category O: Resource Management & Disposal

## Priority: CRITICAL (Phase 1)
**Blocking Status:** YES - Memory leaks and connection exhaustion cause production outages

## Overview
Validates proper lifecycle management of unmanaged resources (database connections, file handles, HTTP clients, memory streams) to prevent memory leaks, connection pool exhaustion, and resource contention in production.

## Critical Checks

### 1. IDisposable Implementation
- [ ] All `IDisposable` resources wrapped in `using` statements or `using` declarations
- [ ] No manual `Dispose()` calls without proper null checks
- [ ] `IDisposable` implementation follows standard pattern (dispose flag, suppress finalization)
- [ ] Dispose methods are idempotent (safe to call multiple times)

### 2. Async Disposal (C# 8.0+)
- [ ] `IAsyncDisposable` implemented for async resource cleanup
- [ ] `await using` statements used for async disposable resources
- [ ] Async disposal propagated through call chain
- [ ] No blocking `Dispose()` calls in async contexts

### 3. Database Connection Management
- [ ] Database connections always wrapped in `using` statements
- [ ] Connection pooling not circumvented by explicit disposal in hot paths
- [ ] No connection string modifications that disable pooling
- [ ] Transactions properly disposed even on exception paths
- [ ] NHibernate sessions explicitly closed/disposed

### 4. File Handle Management
- [ ] `FileStream`, `StreamReader`, `StreamWriter` always disposed
- [ ] File locks released in all code paths (success and exception)
- [ ] Temporary files cleaned up (even on exception)
- [ ] Directory watchers and file system watchers disposed

### 5. HTTP Client Lifecycle
- [ ] `HttpClient` instances managed as singletons or via `IHttpClientFactory`
- [ ] No `HttpClient` creation inside `using` blocks (socket exhaustion risk)
- [ ] `HttpResponseMessage` properly disposed after reading content
- [ ] WCF client proxies properly closed/aborted

### 6. Memory Stream Disposal
- [ ] `MemoryStream` instances disposed when no longer needed
- [ ] Large buffers released explicitly (not relying on GC)
- [ ] `ArrayPool<T>` used for temporary buffers with proper return

### 7. Event Handler Cleanup
- [ ] Event handlers unregistered to prevent memory leaks
- [ ] Weak event patterns used for long-lived publishers
- [ ] IObservable subscriptions disposed

## Common Violations

### ❌ BAD: No using statement for database connection
```csharp
public void SaveReservation(Reservation reservation)
{
    var connection = new SqlConnection(connectionString);
    connection.Open();
    var command = new SqlCommand("INSERT INTO Reservations...", connection);
    command.ExecuteNonQuery();
    // Connection never closed - LEAK!
}
```

### ✅ GOOD: Using statement ensures disposal
```csharp
public void SaveReservation(Reservation reservation)
{
    using (var connection = new SqlConnection(connectionString))
    {
        connection.Open();
        using (var command = new SqlCommand("INSERT INTO Reservations...", connection))
        {
            command.ExecuteNonQuery();
        }
    }
}
```

### ❌ BAD: HttpClient created per request (socket exhaustion)
```csharp
public async Task<string> GetPropertyData(int propertyId)
{
    using (var client = new HttpClient()) // WRONG - creates new socket per call
    {
        return await client.GetStringAsync($"https://api.example.com/properties/{propertyId}");
    }
}
```

### ✅ GOOD: HttpClient as singleton or via factory
```csharp
private static readonly HttpClient _httpClient = new HttpClient();

public async Task<string> GetPropertyData(int propertyId)
{
    return await _httpClient.GetStringAsync($"https://api.example.com/properties/{propertyId}");
}
```

### ❌ BAD: Async disposal not awaited
```csharp
public async Task ProcessFile(string path)
{
    using var stream = new FileStream(path, FileMode.Open);
    await ProcessStreamAsync(stream);
    // Dispose() called synchronously - may block!
}
```

### ✅ GOOD: Async disposal properly awaited
```csharp
public async Task ProcessFile(string path)
{
    await using var stream = new FileStream(path, FileMode.Open);
    await ProcessStreamAsync(stream);
    // DisposeAsync() properly awaited
}
```

### ❌ BAD: No disposal in exception path
```csharp
public void ImportData(string path)
{
    var reader = new StreamReader(path);
    
    if (!ValidateHeader(reader.ReadLine()))
        return; // Reader never disposed!
    
    ProcessData(reader);
    reader.Dispose();
}
```

### ✅ GOOD: Using statement handles all paths
```csharp
public void ImportData(string path)
{
    using var reader = new StreamReader(path);
    
    if (!ValidateHeader(reader.ReadLine()))
        return; // Reader automatically disposed
    
    ProcessData(reader);
}
```

### ❌ BAD: Event handler not unregistered
```csharp
public class ReservationMonitor
{
    public ReservationMonitor(IEventPublisher publisher)
    {
        publisher.ReservationCreated += OnReservationCreated;
        // LEAK: publisher holds reference to this instance forever
    }
}
```

### ✅ GOOD: Event handler cleanup in Dispose
```csharp
public class ReservationMonitor : IDisposable
{
    private readonly IEventPublisher _publisher;
    
    public ReservationMonitor(IEventPublisher publisher)
    {
        _publisher = publisher;
        _publisher.ReservationCreated += OnReservationCreated;
    }
    
    public void Dispose()
    {
        _publisher.ReservationCreated -= OnReservationCreated;
    }
}
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| Database connection not disposed | 🔴 CRITICAL | ✅ YES | Causes connection pool exhaustion |
| HttpClient created per request | 🔴 CRITICAL | ✅ YES | Causes socket exhaustion (SNAT port depletion) |
| FileStream not disposed | 🔴 CRITICAL | ✅ YES | File locks prevent other operations |
| MemoryStream not disposed | 🟡 WARNING | ❌ NO | GC will collect, but wastes memory |
| Event handler not unregistered | 🟠 MAJOR | ⚠️ PARTIAL | Memory leak in long-running services |
| Transaction not disposed | 🔴 CRITICAL | ✅ YES | Database locks held indefinitely |
| WCF proxy not closed | 🟠 MAJOR | ⚠️ PARTIAL | Channel faults may leak connections |

## Remediation Patterns

### Pattern 1: Using Declarations (C# 8.0+)
```csharp
public void ProcessReservation(int id)
{
    using var session = _sessionFactory.OpenSession();
    using var transaction = session.BeginTransaction();
    
    var reservation = session.Get<Reservation>(id);
    reservation.Status = "Confirmed";
    
    transaction.Commit();
    // Automatic disposal in reverse order
}
```

### Pattern 2: Async Disposal Chain
```csharp
public async Task ExportReservations(Stream outputStream)
{
    await using var session = _sessionFactory.OpenSession();
    await using var writer = new StreamWriter(outputStream, leaveOpen: true);
    
    var reservations = await session.Query<Reservation>().ToListAsync();
    
    foreach (var reservation in reservations)
    {
        await writer.WriteLineAsync(reservation.ToCsv());
    }
}
```

### Pattern 3: HttpClient Factory (ASP.NET Core)
```csharp
// Startup.cs
services.AddHttpClient<IPropertyApiClient, PropertyApiClient>();

// PropertyApiClient.cs
public class PropertyApiClient : IPropertyApiClient
{
    private readonly HttpClient _httpClient;
    
    public PropertyApiClient(HttpClient httpClient)
    {
        _httpClient = httpClient; // Managed by framework
    }
    
    public async Task<Property> GetProperty(int id)
    {
        var response = await _httpClient.GetAsync($"/properties/{id}");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<Property>();
    }
}
```

### Pattern 4: WCF Proxy Safe Disposal
```csharp
public async Task<ReservationResponse> CreateReservation(ReservationRequest request)
{
    var client = new ReservationServiceClient();
    try
    {
        var response = await client.CreateReservationAsync(request);
        client.Close();
        return response;
    }
    catch
    {
        client.Abort(); // Don't close on fault
        throw;
    }
}
```

### Pattern 5: Pooled Buffer Management
```csharp
public byte[] CompressData(byte[] input)
{
    var buffer = ArrayPool<byte>.Shared.Rent(input.Length * 2);
    try
    {
        var compressedLength = Compress(input, buffer);
        return buffer.AsSpan(0, compressedLength).ToArray();
    }
    finally
    {
        ArrayPool<byte>.Shared.Return(buffer);
    }
}
```

## Testing Requirements

### 1. Resource Leak Detection
```csharp
[Test]
public void SaveReservation_DisposesConnection()
{
    // Arrange
    var connectionCountBefore = GetActiveConnectionCount();
    
    // Act
    _service.SaveReservation(new Reservation { ... });
    GC.Collect();
    GC.WaitForPendingFinalizers();
    
    // Assert
    var connectionCountAfter = GetActiveConnectionCount();
    Assert.AreEqual(connectionCountBefore, connectionCountAfter, 
        "Connection leak detected");
}
```

### 2. Disposal Verification
```csharp
[Test]
public void FileProcessor_DisposesStream()
{
    // Arrange
    var mockStream = new Mock<Stream>();
    
    // Act
    _processor.ProcessStream(mockStream.Object);
    
    // Assert
    mockStream.Verify(s => s.Dispose(), Times.Once);
}
```

### 3. Exception Path Testing
```csharp
[Test]
public void ImportData_DisposesOnException()
{
    // Arrange
    var filePath = "test.csv";
    File.WriteAllText(filePath, "invalid data");
    
    // Act & Assert
    Assert.Throws<InvalidDataException>(() => _importer.ImportData(filePath));
    
    // Verify file is not locked
    File.Delete(filePath); // Should not throw IOException
}
```

## Review Output Format

```markdown
### Category O: Resource Management & Disposal

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| ReservationService.cs | 45 | SqlConnection not disposed | 🔴 CRITICAL | Wrap in `using` statement |
| PropertyApiClient.cs | 23 | HttpClient created per request | 🔴 CRITICAL | Use IHttpClientFactory or singleton |
| FileImporter.cs | 78 | StreamReader leak in exception path | 🔴 CRITICAL | Use `using` statement |
| EventHandler.cs | 102 | Event handler not unregistered | 🟠 MAJOR | Implement IDisposable with cleanup |

**Category Status:** ❌ FAIL (4 critical issues found)
**Blocking:** YES - Must fix connection and file handle leaks before merge
```

## References
- [IDisposable Pattern (Microsoft)](https://docs.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-dispose)
- [Using Statement (C# Reference)](https://docs.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/using-statement)
- [HttpClient Guidelines](https://docs.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines)
- [ArrayPool\<T\> Class](https://docs.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1)
