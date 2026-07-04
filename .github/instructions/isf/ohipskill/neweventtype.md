# Register New Event Type

This instruction guides the agent to register a new OHIP action type into the system by updating core enums, constants, parsers, and filters.

## Input Requirements

From YAML input file (`.github/templates/ohip-action-input.yaml`):
- `action.name` - PascalCase action type name
- `action.events[]` - List of business events (UPPERCASE WITH SPACES)

**Note:** In EndToEnd mode, automatically read this file unless user provides different input.

## Files to Modify

All files are under `InterfaceBusinessOHIP\` base path:

1. `BusinessEvents\OhipActionType.cs`
2. `Common\OhipConstants.cs`
3. `BusinessEvents\OhipActionTypeParser.cs`
4. `BusinessEvents\OhipEventMessageTypeFilter.cs`
5. `BusinessEvents\DataAccess\OhipEventFetcherFactory.cs`

---

## Step 1: Add Enum Value

**File:** `BusinessEvents\OhipActionType.cs`

**Action:** Add new enum value using action name from input

**Code Pattern:**
```csharp
namespace Synxis.Application.InterfaceBusinessOHIP.BusinessEvents
{
    public enum OhipActionType
    {
        None,
        SummaryTotals,
        InventoryControl,
        StayRestrictions,
        RatePlan,
        RatePlanDetails,
        Blocks,
        Profiles,         //  Add new value (from action.name)
        Hurdles           //  Another example
    }
}
```

**Rules:**
- Use exact PascalCase name from `action.name`
- Add before closing brace
- No trailing comma needed

---

## Step 2: Add Constants

**File:** `Common\OhipConstants.cs`

**Action:** Add action constant + event constants

### 2A: Action Constant

Add to the action constants section:

```csharp
public const string SummaryTotalsAction = "SummaryTotals";
public const string InventoryControlAction = "InventoryControl";
public const string StayRestrictionsAction = "StayRestrictions";
public const string RatePlanAction = "RatePlan";
public const string RatePlanDetailsAction = "RatePlanDetails";
public const string BlocksAction = "Blocks";
public const string ProfilesAction = "Profiles";  //  Add: {ActionName}Action = "{ActionName}"
```

**Pattern:** `public const string {ActionName}Action = "{ActionName}";`

### 2B: Event Constants

For each event in `action.events[]`, add a constant:

```csharp
// Block events
public const string NewBlockHeaderEvent = "NEW BLOCK HEADER";
public const string UpdateBlockHeaderEvent = "UPDATE BLOCK HEADER";
public const string DeleteBlockHeaderEvent = "DELETE BLOCK HEADER";

// Profile events
public const string NewProfileEvent = "NEW PROFILE";      //  From "NEW PROFILE"
public const string UpdateProfileEvent = "UPDATE PROFILE"; //  From "UPDATE PROFILE"
```

**Naming Convention:**
- Convert "NEW PROFILE"  `NewProfileEvent`
- Remove spaces, capitalize each word, append "Event"
- Value is exact event name from input (preserve casing/spaces)

---

## Step 3: Register Parser Mapping

**File:** `BusinessEvents\OhipActionTypeParser.cs`

**Action:** Map action constant to enum value

**Find the dictionary:**
```csharp
private static readonly Dictionary<string, OhipActionType> _actionTypeMap =
    new Dictionary<string, OhipActionType>(StringComparer.InvariantCultureIgnoreCase)
    {
        { OhipConstants.SummaryTotalsAction, OhipActionType.SummaryTotals },
        { OhipConstants.InventoryControlAction, OhipActionType.InventoryControl },
        { OhipConstants.StayRestrictionsAction, OhipActionType.StayRestrictions },
        { OhipConstants.RatePlanAction, OhipActionType.RatePlan },
        { OhipConstants.RatePlanDetailsAction, OhipActionType.RatePlanDetails },
        { OhipConstants.BlocksAction, OhipActionType.Blocks },
        { OhipConstants.ProfilesAction, OhipActionType.Profiles }  //  Add mapping
    };
```

**Pattern:** `{ OhipConstants.{ActionName}Action, OhipActionType.{ActionName} }`

---

## Step 4: Map Action to Events

**File:** `BusinessEvents\OhipEventMessageTypeFilter.cs`

**Action:** Map action type to its business events

**Find the dictionary:**
```csharp
public static Dictionary<OhipActionType, IEnumerable<DomainEventType>> OhipEventMessageType = 
    new Dictionary<OhipActionType, IEnumerable<DomainEventType>>
    {
        { OhipActionType.SummaryTotals, CreateEvents("SUMMARY TOTALS") },
        { OhipActionType.InventoryControl, CreateEvents("NEW INVENTORY CONTROL", "UPDATE INVENTORY CONTROL", "DELETE INVENTORY CONTROL") },
        { OhipActionType.StayRestrictions, CreateEvents("RATE RESTRICTIONS") },
        { OhipActionType.RatePlan, CreateEvents("NEW RATE HEADER", "UPDATE RATE HEADER", "DELETE RATE HEADER") },
        { OhipActionType.RatePlanDetails, CreateEvents("NEW RATE SET", "UPDATE RATE SET", "DELETE RATE SET", "APPLY DAILY RATES", "DELETE DAILY RATES") },
        { OhipActionType.Blocks, CreateEvents("NEW BLOCK HEADER", "UPDATE BLOCK HEADER", "DELETE BLOCK HEADER", "UPDATE BLOCK GRID", "UPDATE RATES") },
        { OhipActionType.Profiles, CreateEvents("NEW PROFILE", "UPDATE PROFILE") }  //  Add mapping
    };
```

**Rules:**
- Key: enum value from Step 1
- Value: `CreateEvents(...)` with all event names from `action.events[]`
- Event names must be EXACT (preserve casing and spaces)
- Separate multiple events with commas

---

## Step 5: Add to Supported Types

**File:** `BusinessEvents\DataAccess\OhipEventFetcherFactory.cs`

**Action:** Add enum value to supported types HashSet

**Find the HashSet:**
```csharp
private readonly HashSet<OhipActionType> _supportedActionTypes = new HashSet<OhipActionType>
{
    OhipActionType.SummaryTotals,
    OhipActionType.InventoryControl,
    OhipActionType.StayRestrictions,
    OhipActionType.RatePlan,
    OhipActionType.RatePlanDetails,
    OhipActionType.Blocks,
    OhipActionType.Profiles  //  Add enum value
};
```

---

## Step 6: Update Test Files

 **MANDATORY:** When adding a new event type, you MUST update these test files:

### 6A: OhipEventFetcherTests

**File:** `PropertyConnect.Tests.Unit\Inbound\Pms\Ohip\BusinessEvents\OhipEventFetcherTests.cs`

**Action:** Add new TestCase attribute for the new action type

**Code Pattern:**
```csharp
[TestCase(OhipActionType.SummaryTotals)]
[TestCase(OhipActionType.InventoryControl)]
[TestCase(OhipActionType.StayRestrictions)]
[TestCase(OhipActionType.RatePlan)]
[TestCase(OhipActionType.RatePlanDetails)]
[TestCase(OhipActionType.Blocks)]
[TestCase(OhipActionType.Profiles)]
[TestCase(OhipActionType.Hurdles)]  //  Add this line for new action type
public void Create_ValidActionType_ReturnsOhipEventFetcher(OhipActionType actionType)
{
    var repoFactoryMock = new Mock<IEventRepositoryFactory>();
    var factory = new OhipEventFetcherFactory(repoFactoryMock.Object);

    var fetcher = factory.Create(actionType);

    Assert.NotNull(fetcher);
    Assert.IsInstanceOf<OhipEventFetcher>(fetcher);
}
```

**Rules:**
- Add `[TestCase(OhipActionType.{ActionName})]` before the test method
- Use exact enum value from Step 1
- Add in alphabetical/logical order with other TestCase attributes

### 6B: OhipEventMessageTypeFilterTests

**File:** `PropertyConnect.Tests.Unit\Inbound\Pms\Ohip\BusinessEvents\OhipEventMessageTypeFilterTests.cs`

**Action:** Add a complete test section for the new action type

**Code Pattern:**
```csharp
#region {ActionName} Tests

[Test]
public void OhipEventMessageType_{ActionName}_ShouldExist()
{
    // Act & Assert
    OhipEventMessageTypeFilter.OhipEventMessageType
        .Should().ContainKey(OhipActionType.{ActionName});
}

[Test]
public void OhipEventMessageType_{ActionName}_ShouldHaveAtLeastOneEvent()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.{ActionName}];
    // Assert
    events.Should().NotBeEmpty();
}

[Test]
public void OhipEventMessageType_{ActionName}_ShouldHave{Count}Events()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.{ActionName}];

    // Assert
    events.Should().HaveCount({EventCount});  // Use actual count from action.events[]
}

[Test]
public void OhipEventMessageType_{ActionName}_ShouldContainSpecificEvents()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.{ActionName}];
    var eventNames = events.Select(e => e.Name).ToList();

    // Assert
    eventNames.Should().Contain("{EventName1}");  // e.g., "NEW HURDLE"
    eventNames.Should().Contain("{EventName2}");  // e.g., "UPDATE HURDLE"
    eventNames.Should().Contain("{EventName3}");  // e.g., "DELETE HURDLE"
    // ... add for each event from action.events[]
}

#endregion {ActionName} Tests
```

**Rules:**
- Replace `{ActionName}` with action name from input
- Replace `{Count}` with word form of number (e.g., "Three" for 3 events)
- Replace `{EventCount}` with actual number from `action.events[]` length
- Add one `eventNames.Should().Contain(...)` assertion per event
- Use exact event names from input (preserve casing and spaces)
- Insert this section before the `#region DomainEventType Tests` section

---

## Build & Verify

After all changes, verify the project builds successfully:

```powershell
# Build InterfaceBusinessOHIP project
dotnet build "C:\Synxis\ProjectX\Synxis\Application\Interfaces\InterfaceBusiness.OHIP\InterfaceBusinessOHIP\InterfaceBusinessOHIP.csproj"

# Verify build succeeded
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build succeeded" -ForegroundColor Green
} else {
    Write-Host "Build failed - check errors above" -ForegroundColor Red
    exit 1
}
```

---

## Success Criteria

 Enum value added to `OhipActionType`
 Action constant added to `OhipConstants` (format: `{ActionName}Action`)
 Event constants added to `OhipConstants` (one per event)
 Parser mapping added to `OhipActionTypeParser`
 Event mapping added to `OhipEventMessageTypeFilter`
 Supported type added to `OhipEventFetcherFactory`
 **TestCase added to `OhipEventFetcherTests.cs`** (mandatory)
 **Test section added to `OhipEventMessageTypeFilterTests.cs`** (mandatory)
 Build passes
 **Unit tests generated** (see testing.md for requirements)

---

## Common Issues

**Issue:** Event name casing mismatch
- **Fix:** Use exact event names from input (e.g., "NEW PROFILE", not "new profile")

**Issue:** Missing comma in dictionary/HashSet
- **Fix:** Ensure previous entry has trailing comma

**Issue:** Constant naming inconsistency
- **Fix:** Follow patterns: `{ActionName}Action`, `{EventName}Event`
