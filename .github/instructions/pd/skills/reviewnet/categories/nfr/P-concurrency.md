# Category P: Concurrency & Thread Safety

## Priority: MEDIUM (Phase 5)
**Blocking Status:** NO - But race conditions cause subtle production bugs

## Overview
Validates thread safety of shared mutable state, concurrent collection usage, race condition prevention, and proper synchronization patterns to prevent data corruption and deadlocks.

## Critical Checks

### 1. Shared Mutable State
- [ ] No shared mutable static fields without synchronization
- [ ] Singleton DI registrations are thread-safe
- [ ] No race conditions in lazy initialization
- [ ] Static constructors used for thread-safe initialization
- [ ] `readonly` fields used where possible
- [ ] Immutable types preferred for shared data

### 2. Thread-Safe Collections
- [ ] `ConcurrentDictionary<K, V>` used for concurrent access
- [ ] `ConcurrentBag<T>`, `ConcurrentQueue<T>` used appropriately
- [ ] `List<T>` not shared across threads without locking
- [ ] `Dictionary<K, V>` not mutated from multiple threads
- [ ] Collection modifications inside locks
- [ ] `ImmutableList<T>` used for read-heavy scenarios

### 3. Locking Patterns
- [ ] `lock` statements use private `readonly object` for lock target
- [ ] No locking on `this`, `typeof(T)`, or string literals
- [ ] Lock granularity appropriate (not too coarse, not too fine)
- [ ] No nested locks (deadlock risk)
- [ ] Lock order consistent across codebase
- [ ] `Monitor.TryEnter` used for timeout-based locking

### 4. Async/Await Thread Safety
- [ ] No `Task.WhenAll` with shared state mutation
- [ ] `SemaphoreSlim` used for async locking (not `lock`)
- [ ] Cancellation tokens propagated (`CancellationToken`)
- [ ] No `Task.Run` wrapping async methods unnecessarily
- [ ] `ConfigureAwait(false)` used in library code
- [ ] No `async void` methods (except event handlers)

### 5. DateTime & Random Thread Safety
- [ ] `DateTimeOffset.UtcNow` used instead of `DateTime.Now` in multi-threaded contexts
- [ ] `Random` instances not shared across threads (or use `Random.Shared` .NET 6+)
- [ ] `ThreadStatic` or `ThreadLocal<T>` used for thread-specific state
- [ ] Time zone conversions thread-safe

### 6. Task Parallelism
- [ ] `Parallel.ForEach` used correctly (not mutating shared collections)
- [ ] `Task.WhenAll` used for parallel async operations (not sequential `await`)
- [ ] Degree of parallelism limited (`ParallelOptions.MaxDegreeOfParallelism`)
- [ ] Exception handling in parallel loops
- [ ] Cancellation support in parallel operations

### 7. Interlocked & Atomic Operations
- [ ] `Interlocked` class used for atomic increments/decrements
- [ ] `volatile` keyword used appropriately (rare)
- [ ] Memory barriers understood if used
- [ ] `Lazy<T>` used for thread-safe lazy initialization
- [ ] `LazyInitializer` used for simple lazy patterns

## Common Violations

### ❌ BAD: Shared mutable static field without synchronization
```csharp
public class ReservationCache
{
    private static Dictionary<int, Reservation> _cache = new Dictionary<int, Reservation>();
    // Multiple threads can access and mutate - RACE CONDITION!
    
    public static void Add(int id, Reservation reservation)
    {
        _cache[id] = reservation; // Not thread-safe!
    }
    
    public static Reservation Get(int id)
    {
        return _cache.ContainsKey(id) ? _cache[id] : null; // Race condition!
    }
}
```

### ✅ GOOD: Thread-safe concurrent dictionary
```csharp
public class ReservationCache
{
    private static readonly ConcurrentDictionary<int, Reservation> _cache = 
        new ConcurrentDictionary<int, Reservation>();
    
    public static void Add(int id, Reservation reservation)
    {
        _cache[id] = reservation; // Thread-safe
    }
    
    public static Reservation Get(int id)
    {
        return _cache.TryGetValue(id, out var reservation) ? reservation : null;
    }
}
```

### ❌ BAD: Locking on this (public object)
```csharp
public class ReservationService
{
    private List<Reservation> _reservations = new List<Reservation>();
    
    public void AddReservation(Reservation reservation)
    {
        lock (this) // WRONG - external code can lock on this too!
        {
            _reservations.Add(reservation);
        }
    }
}
```

### ✅ GOOD: Locking on private object
```csharp
public class ReservationService
{
    private readonly List<Reservation> _reservations = new List<Reservation>();
    private readonly object _lock = new object();
    
    public void AddReservation(Reservation reservation)
    {
        lock (_lock) // Private lock object
        {
            _reservations.Add(reservation);
        }
    }
}
```

### ❌ BAD: Double-checked locking without volatile (incorrect)
```csharp
public class Singleton
{
    private static Singleton _instance;
    private static readonly object _lock = new object();
    
    public static Singleton Instance
    {
        get
        {
            if (_instance == null) // First check (not thread-safe)
            {
                lock (_lock)
                {
                    if (_instance == null) // Second check
                        _instance = new Singleton(); // Can be reordered by compiler!
                }
            }
            return _instance;
        }
    }
}
```

### ✅ GOOD: Lazy initialization (thread-safe)
```csharp
public class Singleton
{
    private static readonly Lazy<Singleton> _instance = 
        new Lazy<Singleton>(() => new Singleton());
    
    public static Singleton Instance => _instance.Value;
    
    private Singleton() { }
}
```

### ❌ BAD: Shared Random instance
```csharp
public class ReservationCodeGenerator
{
    private static readonly Random _random = new Random();
    // Multiple threads calling Next() can cause data corruption!
    
    public static string GenerateCode()
    {
        return _random.Next(100000, 999999).ToString();
    }
}
```

### ✅ GOOD: Thread-local Random or Random.Shared (.NET 6+)
```csharp
public class ReservationCodeGenerator
{
    [ThreadStatic]
    private static Random _random;
    
    private static Random RandomInstance => _random ??= new Random();
    
    public static string GenerateCode()
    {
        return RandomInstance.Next(100000, 999999).ToString();
    }
}

// Or .NET 6+:
public class ReservationCodeGenerator
{
    public static string GenerateCode()
    {
        return Random.Shared.Next(100000, 999999).ToString();
    }
}
```

### ❌ BAD: Using lock with async (blocks thread)
```csharp
public async Task<Reservation> GetReservationAsync(int id)
{
    lock (_lock) // WRONG - lock blocks thread during async operation!
    {
        var reservation = await _repository.GetAsync(id);
        return reservation;
    }
}
```

### ✅ GOOD: Using SemaphoreSlim for async synchronization
```csharp
private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);

public async Task<Reservation> GetReservationAsync(int id)
{
    await _semaphore.WaitAsync();
    try
    {
        var reservation = await _repository.GetAsync(id);
        return reservation;
    }
    finally
    {
        _semaphore.Release();
    }
}
```

### ❌ BAD: Sequential async calls (not parallel)
```csharp
public async Task<ReservationSummary> GetReservationSummaryAsync(int id)
{
    var reservation = await _reservationService.GetAsync(id);
    var guest = await _guestService.GetAsync(reservation.GuestId);
    var room = await _roomService.GetAsync(reservation.RoomId);
    // Three sequential calls - SLOW!
    
    return new ReservationSummary { Reservation = reservation, Guest = guest, Room = room };
}
```

### ✅ GOOD: Parallel async calls with Task.WhenAll
```csharp
public async Task<ReservationSummary> GetReservationSummaryAsync(int id)
{
    var reservation = await _reservationService.GetAsync(id);
    
    // Fetch guest and room in parallel
    var guestTask = _guestService.GetAsync(reservation.GuestId);
    var roomTask = _roomService.GetAsync(reservation.RoomId);
    
    await Task.WhenAll(guestTask, roomTask);
    
    return new ReservationSummary
    {
        Reservation = reservation,
        Guest = await guestTask,
        Room = await roomTask
    };
}
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| Shared mutable static without lock | 🟠 MAJOR | ⚠️ PARTIAL | Race condition, data corruption |
| List<T> shared across threads | 🟠 MAJOR | ⚠️ PARTIAL | Collection modified exception |
| Locking on `this` or public object | 🟡 WARNING | ❌ NO | Deadlock risk |
| Shared Random instance | 🟠 MAJOR | ⚠️ PARTIAL | Data corruption |
| `lock` inside async method | 🟠 MAJOR | ⚠️ PARTIAL | Thread starvation |
| Sequential async calls (not parallel) | 🟡 WARNING | ❌ NO | Performance issue |
| No cancellation token support | 🟡 WARNING | ❌ NO | Cannot cancel long operations |

## Remediation Patterns

### Pattern 1: Concurrent Collections
```csharp
// Thread-safe dictionary
private readonly ConcurrentDictionary<int, Reservation> _cache = 
    new ConcurrentDictionary<int, Reservation>();

public Reservation GetOrAdd(int id, Func<int, Reservation> factory)
{
    return _cache.GetOrAdd(id, factory); // Atomic operation
}

// Thread-safe queue
private readonly ConcurrentQueue<ReservationEvent> _events = 
    new ConcurrentQueue<ReservationEvent>();

public void AddEvent(ReservationEvent evt)
{
    _events.Enqueue(evt);
}

public bool TryGetEvent(out ReservationEvent evt)
{
    return _events.TryDequeue(out evt);
}
```

### Pattern 2: SemaphoreSlim for Async Throttling
```csharp
private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(10, 10); // Max 10 concurrent

public async Task<Property> GetPropertyAsync(int id, CancellationToken cancellationToken)
{
    await _semaphore.WaitAsync(cancellationToken);
    try
    {
        return await _httpClient.GetFromJsonAsync<Property>($"/properties/{id}", cancellationToken);
    }
    finally
    {
        _semaphore.Release();
    }
}
```

### Pattern 3: Parallel.ForEach with Thread-Safe Aggregation
```csharp
public void ProcessReservations(List<Reservation> reservations)
{
    var successCount = 0;
    var errorCount = 0;
    
    Parallel.ForEach(reservations, new ParallelOptions { MaxDegreeOfParallelism = 4 }, 
        reservation =>
        {
            try
            {
                ProcessReservation(reservation);
                Interlocked.Increment(ref successCount); // Atomic increment
            }
            catch
            {
                Interlocked.Increment(ref errorCount);
            }
        });
    
    _logger.LogInformation("Processed {SuccessCount} reservations, {ErrorCount} errors", 
        successCount, errorCount);
}
```

### Pattern 4: Lazy Thread-Safe Initialization
```csharp
public class ExpensiveResource
{
    private static readonly Lazy<ExpensiveResource> _instance = 
        new Lazy<ExpensiveResource>(() => new ExpensiveResource(), 
            LazyThreadSafetyMode.ExecutionAndPublication);
    
    public static ExpensiveResource Instance => _instance.Value;
    
    private ExpensiveResource()
    {
        // Expensive initialization
    }
}
```

## Testing Requirements

### 1. Thread Safety Test
```csharp
[Test]
public void ReservationCache_ConcurrentAccess_IsThreadSafe()
{
    // Arrange
    var cache = new ReservationCache();
    var tasks = new List<Task>();
    
    // Act - 100 threads adding items concurrently
    for (int i = 0; i < 100; i++)
    {
        int id = i;
        tasks.Add(Task.Run(() =>
        {
            cache.Add(id, new Reservation { Id = id });
        }));
    }
    
    Task.WaitAll(tasks.ToArray());
    
    // Assert - no exceptions, all items added
    Assert.AreEqual(100, cache.Count);
}
```

### 2. Race Condition Test
```csharp
[Test]
public void Counter_ConcurrentIncrements_NoRaceCondition()
{
    // Arrange
    var counter = new ThreadSafeCounter();
    var tasks = Enumerable.Range(0, 1000)
        .Select(_ => Task.Run(() => counter.Increment()))
        .ToArray();
    
    // Act
    Task.WaitAll(tasks);
    
    // Assert
    Assert.AreEqual(1000, counter.Value);
}
```

## Review Output Format

```markdown
### Category P: Concurrency & Thread Safety

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| ReservationCache.cs | 12 | Static Dictionary without synchronization | 🟠 MAJOR | Use ConcurrentDictionary |
| CodeGenerator.cs | 23 | Shared Random instance | 🟠 MAJOR | Use ThreadStatic or Random.Shared |
| ReservationService.cs | 45 | lock inside async method | 🟠 MAJOR | Use SemaphoreSlim |
| SummaryService.cs | 67 | Sequential async calls | 🟡 WARNING | Use Task.WhenAll for parallelism |

**Category Status:** ⚠️ WARNING (3 major concurrency issues)
**Blocking:** NO - But race conditions risk data corruption
**Recommendation:** Replace shared mutable state with concurrent collections
```

## References
- [Threading in C#](https://www.albahari.com/threading/)
- [Async/Await Best Practices](https://docs.microsoft.com/en-us/archive/msdn-magazine/2013/march/async-await-best-practices-in-asynchronous-programming)
- [Concurrent Collections](https://docs.microsoft.com/en-us/dotnet/standard/collections/thread-safe/)
- [SemaphoreSlim Class](https://docs.microsoft.com/en-us/dotnet/api/system.threading.semaphoreslim)
