# DTO Mapping - Assembler and Handler

This instruction guides the agent to create DTO assembler and handler for transforming OHIP API responses to OXI DTOs for publishing to Pub/Sub.

**CRITICAL - Skeleton Only:** 
- Agent creates **skeleton structure ONLY** with `NotImplementedException`
- **DO NOT implement any business logic** in the assembler
- **DO NOT write any field mapping code**
- **DO NOT generate unit tests** for the assembler (developer will implement logic first, then generate tests)
- Developer must implement actual field mappings based on user story requirements
- DTO Handler is fully implemented (this is infrastructure code, not business logic)

## Architecture Overview

**Two-class pattern (both in same file):**
1. **DtoAssembler** - Implements `IOhipDtoAssembler`, transforms OHIP response to OXI DTO
2. **DtoHandler** - Inherits `OhipRequestHandlerBase`, orchestrates assembly and publishing

**Flow:**
```
BusinessEvent  EventHandler  RequestBuilder  CMU API Call  DtoHandler.AssembleAndPublishMessage()
                                                                      
                                                      DtoAssembler.AssembleMessage(businessEvent, ohipResponse)
                                                                      
                                                         OXI DTO  DtoWrapper  Pub/Sub Queue
```

## Input Requirements

From YAML input file:
- `action.name` - Action type name
- `action.interface_request_type_id` - Unique integer ID for InterfaceRequestType enum (next available ID)
- `dto_mapping.handler_class_name` - Handler class name (e.g., "OhipProfilesDtoHandler")
- `dto_mapping.assembler_class_name` - Assembler class name (e.g., "OhipProfilesDtoAssembler")
- `dto_mapping.oxi_dto_class` - OXI DTO class name (e.g., "InventoryProfileDto")

## Files to Create/Modify

**Create:**
1. `BusinessEvents\DtoAdapters\{AssemblerClassName}.cs` - Assembler only
2. `BusinessEvents\RequestHandlers\{HandlerClassName}.cs` - Handler only

**Modify:**
1. `BusinessEvents\RequestHandlers\OhipDtoRequestHandlerFactory.cs` - Register handler
2. `Synxis.Enterprise.Business\Interfaces\InterfaceRequestType.cs` - Add enum entry

---

## Part 1: Create DTO Assembler

**File:** `InterfaceBusinessOHIP\BusinessEvents\DtoAdapters\{AssemblerClassName}.cs`

**Standard using statements:**
```csharp
using JetBrains.Annotations;
using Newtonsoft.Json;
using SHS.Platform.ServiceFx.Logging;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.DataAccess;
using Synxis.Application.InterfaceBusinessOHIP.Common;
using Synxis.Application.InterfaceDto;
using Synxis.Application.OHIPDataStructures.BusinessEvent;
using Synxis.Application.OHIPDataStructures.{ActionNamespace}; // e.g., Blocks, Profiles
using Synxis.Enterprise.Business;
using Synxis.Enterprise.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
```

**Template:**
```csharp
namespace Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.DtoAdapters
{
    /// <summary>
    /// Assembles {OxiDtoClass} from OHIP {ActionName} API response
    /// </summary>
    public class {AssemblerClassName} : IOhipDtoAssembler
    {
        public static readonly {AssemblerClassName} Instance = new {AssemblerClassName}();

        private static readonly ILogWrapper _logWrapper = LogWrapperProvider.GetLoggerWrapper(typeof({AssemblerClassName}));

        private static readonly ApplicationLogger _txtLogWrapper =
            LogManager.GetApplicationLoggerWrapper(typeof({AssemblerClassName}), "TextFileOnlyLogger");

        //this can be improved later by DI
        private readonly IOhipHotelRepository _ohipHotelRepository = new OhipHotelRepository(new SessionProvider());

        // only for unit testing
        public {AssemblerClassName}(IOhipHotelRepository ohipHotelRepository)
        {
            _ohipHotelRepository = ohipHotelRepository;
        }

        private {AssemblerClassName}()
        {
        }

        /// <summary>
        /// Assembles {OxiDtoClass} from business event and OHIP API response.
        /// </summary>
        /// <param name="businessEvent">The business event containing data.</param>
        /// <param name="requestMessage">The OHIP API response (or null if no API call made).</param>
        /// <returns>The assembled DTO or null if assembly fails.</returns>
        public IDtoMessage AssembleMessage(BusinessEvent businessEvent, object requestMessage)
        {
            // TODO: Developer must implement DTO assembly logic
            // This method should:
            // 1. Validate inputs (businessEvent, requestMessage)
            // 2. Extract data from business event or API response
            // 3. Create and populate {OxiDtoClass}
            // 4. Set Timestamp = DateTime.UtcNow
            // 5. Return the assembled DTO
            throw new NotImplementedException("Developer must implement {OxiDtoClass} assembly logic.");
        }
    }
}
```

**Special cases:**

**If no API call (like StayRestrictions, Hurdles):**
```csharp
        /// <summary>
        /// Assembles {OxiDtoClass} directly from business event (no API call needed).
        /// </summary>
        /// <param name="businessEvent">The business event containing hurdle data.</param>
        /// <param name="requestMessage">Not used (no API call for this action type).</param>
        /// <returns>The assembled DTO or null if assembly fails.</returns>
        public IDtoMessage AssembleMessage([NotNull] BusinessEvent businessEvent, [CanBeNull] object requestMessage)
        {
            // TODO: Developer must implement DTO assembly logic
            // This method should:
            // 1. Parse and validate HotelId from businessEvent.BusinessEventType.Header.HotelId
            // 2. Get hotel from _ohipHotelRepository.GetHotel(hotelId)
            // 3. Validate hotel status (active, not disabled, etc.)
            // 4. Extract details from businessEvent.BusinessEventType.Details
            // 5. Create and populate {OxiDtoClass}
            // 6. Set ID = Guid.NewGuid().ToString()
            // 7. Set Timestamp = DateTime.UtcNow
            // 8. Return the assembled DTO
            throw new NotImplementedException("Developer must implement {OxiDtoClass} assembly from business event.");
        }
```

**If conditional DTO creation (like RatePlan with delete events):**
```csharp
        /// <summary>
        /// Assembles {OxiDtoClass} from business event and OHIP API response.
        /// Handles different event types (NEW/UPDATE use API response, DELETE uses business event only).
        /// </summary>
        /// <param name="businessEvent">The business event.</param>
        /// <param name="requestMessage">The OHIP API response (may be null for DELETE events).</param>
        /// <returns>The assembled DTO or null if assembly fails.</returns>
        public IDtoMessage AssembleMessage(BusinessEvent businessEvent, object requestMessage)
        {
            // TODO: Developer must implement DTO assembly logic
            // This method should:
            // 1. Check businessEvent.BusinessEventType.Header.EventName
            // 2. If DELETE event: create minimal DTO from business event details
            // 3. If NEW/UPDATE event: validate requestMessage is {OhipResponseType}, create DTO from API response
            // 4. Set Timestamp = DateTime.UtcNow
            // 5. Return the assembled DTO
            throw new NotImplementedException("Developer must implement {OxiDtoClass} assembly with conditional logic.");
        }
```

---

## Part 2: Create DTO Handler

**File:** `InterfaceBusinessOHIP\BusinessEvents\RequestHandlers\{HandlerClassName}.cs`

**Standard using statements:**
```csharp
using SHS.Platform.ServiceFx.Logging;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.DtoAdapters;
using Synxis.Application.OHIPDataStructures.BusinessEvent;
using Synxis.Enterprise.Business.Interfaces;
using Synxis.Enterprise.Logging;
using System;
```

**IMPORTANT:** Include `using Synxis.Enterprise.Logging;` for the `.ToKvp()` extension method used in logging.

**Template:**
```csharp
namespace Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.RequestHandlers
{
    public class {HandlerClassName} : OhipRequestHandlerBase
    {
        public static readonly {HandlerClassName} Instance = new {HandlerClassName}();

        public override InterfaceRequestType InterfaceRequestType => InterfaceRequestType.Ohip{ActionName};

        public override InterfaceType InterfaceType => InterfaceType.Ohip;

        public override InterfaceTypeVersion InterfaceTypeVersion => InterfaceTypeVersion.OhipV1;

        public override IOhipDtoAssembler OhipDtoAssembler => {AssemblerClassName}.Instance;

        private {HandlerClassName}() { }

        private static readonly ILogWrapper _logWrapper = LogWrapperProvider.GetLoggerWrapper(typeof({HandlerClassName}));

        public override void AssembleAndPublishMessage(BusinessEvent businessEvent, object requestMessage)
        {
            try
            {
                if (!int.TryParse(businessEvent.BusinessEventType.Header.HotelId, out var hotelId))
                {
                    throw new FormatException($"Invalid HotelId: '{businessEvent.BusinessEventType.Header.HotelId}' cannot be parsed to int.");
                }

                var dto = OhipDtoAssembler.AssembleMessage(businessEvent, requestMessage);

                if (dto != null)
                {
                    var dtoWrapper = CreateDtoWrapper(dto, hotelId);
                    var integrationLoaderStats = requestMessage is null
                        ? null
                        : GetIntegrationLoaderStats(requestMessage);
                    PublishMessageToQueue(dtoWrapper, integrationLoaderStats);
                }
            }
            catch (Exception ex)
            {
                _logWrapper.AppLogger.Error("{HandlerClassName}_AssembleAndPublishMessageError", ex);
                throw;
            }
        }
    }
}
```

**Key points:**
- Inherits from `OhipRequestHandlerBase` (provides publishing infrastructure)
- Singleton pattern with `Instance` property
- Private constructor
- Override abstract properties: `InterfaceRequestType`, `InterfaceType`, `InterfaceTypeVersion`, `OhipDtoAssembler`
- `AssembleAndPublishMessage` orchestrates: parse hotelId  assemble DTO  create wrapper  publish

---

## Part 3: Register Handler in Factory

**File:** `InterfaceBusinessOHIP\BusinessEvents\RequestHandlers\OhipDtoRequestHandlerFactory.cs`

Add case to switch statement:

```csharp
public static IOhipRequestHandler GetDtoBuilderInstance(OhipActionType ohipActionType)
{
    switch (ohipActionType)
    {
        case OhipActionType.SummaryTotals:
            return OhipInventorySummaryTotalDtoHandler.Instance;
        case OhipActionType.InventoryControl:
            return OhipInventoryControlDtoHandler.Instance;
        case OhipActionType.StayRestrictions:
            return OhipStayRestrictionsDtoHandler.Instance;
        case OhipActionType.RatePlan:
            return OhipRatePlanDtoHandler.Instance;
        case OhipActionType.RatePlanDetails:
            return OhipRatePlanDetailsDtoHandler.Instance;
        case OhipActionType.Blocks:
            return OhipBlocksDtoHandler.Instance;
        case OhipActionType.{ActionName}:
            return {HandlerClassName}.Instance;  //  Add this
        default:
            _logWrapper.AppLogger.Info(nameof(OhipDtoRequestHandlerFactory), "Unknown OhipActionType in the factory", ohipActionType.ToString().ToKvp(ohipActionType));
            throw new NotSupportedException("Unknown OhipActionType in the factory");
    }
}
```

---

## Part 4: Add InterfaceRequestType Enum

**File:** `Synxis.Enterprise.Business\Interfaces\InterfaceRequestType.cs`

**Location:** `c:\Synxis\ProjectX\Synxis\Enterprise\Synxis.Enterprise.Business\Interfaces\InterfaceRequestType.cs`

**CRITICAL:** The numeric ID values in this enum correspond to `INTERFACE_REQUEST_TYP_ID` in the `Interface_Request_typ` database table. Once assigned, these mappings should **NEVER** change.

**Steps:**

1. **Determine next available ID:**
   - Check the input file for `action.interface_request_type_id`
   - This should be the next sequential ID after the last OHIP entry
   - Current OHIP IDs: OhipInventorySnapshot=102, OhipStayRestrictions=104, OhipRatePlanDetails=105, OhipRatePlan=106, OhipBlocks=107
   - **Use the ID from the input file, do NOT auto-increment**

2. **Add enum entry:**
```csharp
public enum InterfaceRequestType
{
    NotSpecified=0,
    // ... existing entries ...
    OhipInventorySnapshot = 102,
    MirrorRateAsyncJob = 103,
    OhipStayRestrictions = 104,
    OhipRatePlanDetails = 105,
    OhipRatePlan = 106,
    OhipBlocks = 107,
    Ohip{ActionName} = {InterfaceRequestTypeId}  //  Add this with ID from input
}
```

**Example:**
For Profiles action with ID 108:
```csharp
    OhipBlocks = 107,
    OhipProfiles = 108
}
```

**Notes:**
- Use exact PascalCase format: `Ohip{ActionName}`
- Ensure ID matches the input file value
- No trailing comma on last entry
- Add comma to previous last entry
```

---

## Build & Verify

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

 Assembler class created in `DtoAdapters` folder implementing `IOhipDtoAssembler`
 Assembler has singleton `Instance` property
 Assembler has private parameterless constructor
 Assembler has public constructor with `IOhipHotelRepository` for unit testing
 `AssembleMessage` method signature matches interface
 **`AssembleMessage` method body contains ONLY `throw new NotImplementedException(...)`**
 **NO implementation logic in assembler** (developer implements later)
 XML comments explain what developer needs to implement
 Handler class created in `RequestHandlers` folder inheriting `OhipRequestHandlerBase`
 Handler has singleton `Instance` property
 Handler overrides all abstract members
 Handler references assembler via `OhipDtoAssembler` property
 Handler is fully implemented (not skeleton)
 Factory updated with new case for action type
 `InterfaceRequestType` enum has entry with correct ID from input
 Enum entry uses format `Ohip{ActionName}`
 Enum ID matches database `INTERFACE_REQUEST_TYP_ID` value
 Logging includes correlation IDs and structured fields in handler
 XML comments on public members
 Build passes without errors
 **Unit tests generated ONLY for handler and event handler** (NOT for assembler - developer implements logic first)
 **Factory and filter tests updated** (see testing.md Section 0)

---

## Notes for Developer

**After agent creates skeleton:**

1. **Review skeleton structure** - Agent created assembler with `NotImplementedException` and fully implemented handler
2. **Identify OHIP response structure** - Review OHIP API documentation or sample responses (or business event structure if no API call)
3. **Identify OXI DTO structure** - Check InterfaceDto project for target DTO class
4. **Implement `AssembleMessage` method** in assembler - Replace `throw new NotImplementedException(...)` with actual logic
5. **Handle null/missing data** - Add validation and default values
6. **Generate unit tests** - After implementing assembler logic, run OhiPilot Tests mode to generate tests
7. **Test with sample data** - Verify tests pass with mock OHIP responses
8. **Verify Pub/Sub publishing** - Check messages arrive correctly in queue

**Common mapping patterns:**
- Extract nested data with `?.` null-conditional operator
- Use `.FirstOrDefault()` for single items from collections
- Use `.Select()` for transforming collections
- Add helper methods for complex nested object mappings
- Validate required fields before creating DTO
- Parse HotelId from string to int: `int.TryParse(businessEvent.BusinessEventType.Header.HotelId, out var hotelId)`
- Get detail values: `var value = businessEvent.BusinessEventType.Details.FirstOrDefault(d => d.ElementName == "FIELD_NAME")?.NewValue;`

**Important Workflow:**
- Agent generates skeleton assembler (with `NotImplementedException`)  Developer implements logic  Developer requests test generation  Agent generates tests

    #endregion
}
```

**Key Points:**

1. **Single File:** Both assembler and handler in one file with `#region` separators
2. **Skeleton Only:** Extensive TODO comments for developer
3. **Return Type:** Uses `{OxiDtoClass}` from input
4. **Singleton Pattern:** Handler uses static `Instance` property
5. **Pub/Sub Topic:** Uses topic name from input

---

## Part 3: Register DTO Handler

**File:** `InterfaceBusinessOHIP\Dto\OhipDtoRequestHandlerFactory.cs`

**Find the method that returns handler dictionary:**

```csharp
public IOhipDtoRequestHandler GetHandler(OhipActionType actionType)
{
    // Initialize handlers if needed
    if (!_initialized)
    {
        InitializeHandlers();
        _initialized = true;
    }

    var handlers = new Dictionary<OhipActionType, IOhipDtoRequestHandler>
    {
        { OhipActionType.SummaryTotals, SummaryTotalsDtoHandler.Instance },
        { OhipActionType.InventoryControl, InventoryControlDtoHandler.Instance },
        { OhipActionType.StayRestrictions, StayRestrictionsDtoHandler.Instance },
        { OhipActionType.RatePlan, RatePlanDtoHandler.Instance },
        { OhipActionType.RatePlanDetails, RatePlanDetailsDtoHandler.Instance },
        { OhipActionType.Blocks, BlocksDtoHandler.Instance },
        { OhipActionType.Profiles, ProfilesDtoHandler.Instance }  //  Add
    };

    return handlers.ContainsKey(actionType) 
        ? handlers[actionType] 
        : throw new ArgumentException($"No DTO handler for action type: {actionType}");
}

private void InitializeHandlers()
{
    var publisherClient = _publisherClientFactory.GetPublisherClient();
    
    SummaryTotalsDtoHandler.Initialize(publisherClient);
    InventoryControlDtoHandler.Initialize(publisherClient);
    StayRestrictionsDtoHandler.Initialize(publisherClient);
    RatePlanDtoHandler.Initialize(publisherClient);
    RatePlanDetailsDtoHandler.Initialize(publisherClient);
    BlocksDtoHandler.Initialize(publisherClient);
    ProfilesDtoHandler.Initialize(publisherClient);  //  Add
}
```

---

## Build & Verify

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

 OXI DTO class exists in `InterfaceDto` (created or verified)
 Combined assembler + handler file created
 File contains both classes with clear region separators
 Assembler has TODO comments for field mappings
 Handler has singleton pattern
 Handler registered in `OhipDtoRequestHandlerFactory`
 Initialize method called in factory
 Build passes

 **Manual Step Required:** Developer must implement field mappings in assembler based on user story

---

## Developer Checklist (After Skeleton Generation)

After agent creates skeleton, developer must:

1. Review OHIP API response structure (from user story/Swagger)
2. Define properties in `{OxiDtoClass}` to match requirements
3. Implement `AssembleDto()` method with actual field mappings
4. Create helper methods for nested objects/collections
5. Add proper error handling and logging
6. Add XML documentation comments
7. Test with sample API responses
