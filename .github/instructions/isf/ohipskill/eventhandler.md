# Create Event Handler and Request Builder

This instruction guides the agent to create the business event handler and request builder methods for a new OHIP action type.

## Input Requirements

From YAML input file:
- `action.name` - Action type name
- `action.events[]` - List of event names
- `consolidation.*` - Consolidation rules
- `api_integration.required` - Whether OHIP API call is needed
- `routing.*` - Routing type enums
- `sample_payload` - Sample business event JSON

## Files to Create/Modify

**Create:**
1. `BusinessEvents\EventHandlers\{ActionName}EventHandler.cs`

**Modify:**
1. `BusinessEvents\EventHandlers\BusinessEventHandlerFactory.cs`
2. `BusinessEvents\RequestBuilder\IOhipRequestBuilder.cs`
3. `BusinessEvents\RequestBuilder\OhipRequestBuilder.cs`

---

## Part 1: Register Handler in Factory

**File:** `InterfaceBusinessOHIP\BusinessEvents\EventHandlers\BusinessEventHandlerFactory.cs`

Add the new handler to the factory dictionary in the constructor.

**Standard dependencies:**
- `requestBuilder` - IOhipRequestBuilder
- `requestSender` - ICommunicationUtilityRequestSender
- `responseResolver` - IDeliverConversationResponseResolver
- `hotelRepository` - IOhipHotelRepository (only if hotel lookups needed)

**Find the constructor and add registration:**
```csharp
public BusinessEventHandlerFactory(IOhipHotelRepository hotelRepository,
                                   IOhipRequestBuilder requestBuilder,
                                   ICommunicationUtilityRequestSender requestSender,
                                   IDeliverConversationResponseResolver responseResolver)
{
    _handlers = new Dictionary<OhipActionType, IBusinessEventHandler>
    {
        { OhipActionType.SummaryTotals, new SummaryTotalsEventHandler(hotelRepository, requestBuilder, requestSender, responseResolver) },
        { OhipActionType.InventoryControl, new InventoryControlEventHandler(requestBuilder, requestSender, responseResolver) },
        { OhipActionType.StayRestrictions, new DefaultEventHandler() },
        { OhipActionType.RatePlanDetails, new RatePlanDetailsEventHandler(requestBuilder, requestSender, responseResolver) },
        { OhipActionType.RatePlan, new RatePlanEventHandler(hotelRepository, requestBuilder, requestSender, responseResolver) },
        { OhipActionType.Blocks, new BlocksEventHandler(requestBuilder, requestSender, responseResolver) },
        { OhipActionType.Profiles, new ProfilesEventHandler(requestBuilder, requestSender, responseResolver) },
        { OhipActionType.{ActionName}, new {ActionName}EventHandler(requestBuilder, requestSender, responseResolver) }  //  Add this
    };
}
```

**Note:** Only include `hotelRepository` parameter if the handler needs hotel information.

---

## Part 2: Create Event Handler Class

**File:** `InterfaceBusinessOHIP\BusinessEvents\EventHandlers\{ActionName}EventHandler.cs`

All event handlers implement `IBusinessEventHandler` interface with two methods:
1. `ConsolidateBusinessEvents` - Consolidates multiple events based on defined rules
2. `ProcessBusinessEvent` - Processes a single business event

**Required using statements:**
```csharp
using JetBrains.Annotations;
using SHS.Platform.ServiceFx.Logging;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.ReponseResolver;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.RequestBuilder;
using Synxis.Application.InterfaceBusinessOHIP.Common;
using Synxis.Application.OHIPDataStructures.BusinessEvent;
using Synxis.Application.OHIPDataStructures.{ActionNameDataStructureNamespace}; // e.g., Blocks, Profiles

** IMPORTANT:** After completing handler implementation, you MUST generate unit tests as per testing.md instructions.
using Synxis.Enterprise.Business.Hotels;
using Synxis.Enterprise.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
```

**Class template:**
```csharp
namespace Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.EventHandlers
{
    public class {ActionName}EventHandler : IBusinessEventHandler
    {
        private readonly IOhipRequestBuilder _requestBuilder;
        private readonly ICommunicationUtilityRequestSender _requestSender;
        private readonly IDeliverConversationResponseResolver _responseResolver;

        private static readonly ILogWrapper _logWrapper = LogWrapperProvider.GetLoggerWrapper(typeof({ActionName}EventHandler));

        public {ActionName}EventHandler(IOhipRequestBuilder requestBuilder,
                                        ICommunicationUtilityRequestSender requestSender,
                                        IDeliverConversationResponseResolver responseResolver)
        {
            _requestBuilder = requestBuilder -> throw new ArgumentNullException(nameof(requestBuilder));
            _requestSender = requestSender -> throw new ArgumentNullException(nameof(requestSender));
            _responseResolver = responseResolver -> throw new ArgumentNullException(nameof(responseResolver));
        }

        [NotNull]
        public List<BusinessEvent> ConsolidateBusinessEvents([NotNull] List<BusinessEvent> businessEvents)
        {
            // Implement consolidation logic based on YAML input (see Part 3)
        }

        [NotNull]
        public IOhipApiResult ProcessBusinessEvent([NotNull] BusinessEvent businessEvent, [CanBeNull] Dictionary<int, Hotel> hotelLookup = null)
        {
            // Implement processing logic (see Part 4)
        }
    }
}
```

**Consolidation Implementation:**

Based on `consolidation.*` from input:

1. **If `consolidation.enabled: false`:**
   ```csharp
   return businessEvents; // No consolidation needed
   ```

2. **If `consolidation.strategy: MostRecent`:**
   ```csharp
   // Extract keys from each event
   var consolidated = businessEvents
       .GroupBy(e => ExtractConsolidationKey(e))
       .Select(g => g.OrderByDescending(e => e.Header.TimeStamp).First())
       .ToList();
---

## Part 3: Implement Consolidation Logic

Based on `consolidation.*` from YAML input:

### Option 1: No Consolidation
If `consolidation.enabled: false`:
```csharp
[NotNull]
public List<BusinessEvent> ConsolidateBusinessEvents([NotNull] List<BusinessEvent> businessEvents)
{
    return businessEvents; // No consolidation logic needed
}
```

### Option 2: Simple Strategy (MostRecent/Earliest)

**For `consolidation.strategy: MostRecent` (keep latest event per key):**
```csharp
[NotNull]
public List<BusinessEvent> ConsolidateBusinessEvents([NotNull] List<BusinessEvent> businessEvents)
{
    if (businessEvents is null || businessEvents.Count == 0)
    {
        return new List<BusinessEvent>();
    }

    // Group by consolidation key and take the most recent event
    var consolidated = businessEvents
        .GroupBy(e => e.BusinessEventType?.Header?.PrimaryKey)
        .Select(g => g.OrderByDescending(e => e.BusinessEventType.Header.TimeStamp).First())
        .ToList();

    return consolidated;
}
```

**For `consolidation.strategy: Earliest` (keep first event per key):**
```csharp
var consolidated = businessEvents
    .GroupBy(e => e.BusinessEventType?.Header?.PrimaryKey)
    .Select(g => g.OrderBy(e => e.BusinessEventType.Header.TimeStamp).First())
    .ToList();
```

### Option 3: Custom Consolidation

**Example: Consolidate by composite key (e.g., PrimaryKey + EventName):**
```csharp
[NotNull]
public List<BusinessEvent> ConsolidateBusinessEvents([NotNull] List<BusinessEvent> businessEvents)
{
    if (businessEvents is null || businessEvents.Count == 0)
    {
        return new List<BusinessEvent>();
    }

    // Define which events should be consolidated
    var eventsForConsolidation = businessEvents
        .Where(e => OhipConstants.{ActionName}EventsForConsolidation.Contains(
            e.BusinessEventType?.Header?.EventName, StringComparer.OrdinalIgnoreCase))
        .ToList();

    // Consolidate by PrimaryKey (or custom key)
    var consolidated = eventsForConsolidation
        .GroupBy(e => e.BusinessEventType?.Header?.PrimaryKey)
        .Select(g => g.First())
        .ToList();

    // Keep other events unchanged
    var otherEvents = businessEvents
        .Where(e => !OhipConstants.{ActionName}EventsForConsolidation.Contains(
            e.BusinessEventType?.Header?.EventName, StringComparer.OrdinalIgnoreCase))
        .ToList();

    consolidated.AddRange(otherEvents);
    return consolidated;
}
```

**Example: Multi-key consolidation with action type transformation (like Profiles):**
```csharp
[NotNull]
public List<BusinessEvent> ConsolidateBusinessEvents([NotNull] List<BusinessEvent> businessEvents)
{
    if (businessEvents is null || businessEvents.Count == 0)
    {
        return new List<BusinessEvent>();
    }

    // Group by composite key: ProfileId + ChainCode
    var consolidated = businessEvents
        .GroupBy(be => new
        {
            ProfileId = GetProfileIdFromBusinessEvent(be),
            PmsChainCode = be.Metadata.PmsChainCode
        })
        .Where(grp => !string.IsNullOrWhiteSpace(grp.Key.ProfileId) && !string.IsNullOrEmpty(grp.Key.PmsChainCode))
        .SelectMany(group =>
        {
            var groupEvents = group.OrderBy(e => e.BusinessEventType.Header.TimeStamp).ToList();

            if (groupEvents.Count == 1)
            {
                return groupEvents;
            }

            // Separate by action types
            var newEvents = groupEvents
                .Where(e => string.Equals(e.BusinessEventType.Header.ActionType, OhipConstants.New{ActionName}, StringComparison.OrdinalIgnoreCase))
                .ToList();

            var updateEvents = groupEvents
                .Where(e => string.Equals(e.BusinessEventType.Header.ActionType, OhipConstants.Update{ActionName}, StringComparison.OrdinalIgnoreCase))
                .ToList();

            // NEW + UPDATE(s)  Use latest UPDATE, change action to NEW
            if (newEvents.Count > 0 && updateEvents.Count > 0)
            {
                var latestUpdate = updateEvents.Last();
                latestUpdate.BusinessEventType.Header.ActionType = OhipConstants.New{ActionName};

                _logWrapper.AppLogger.Info("{ActionName}Consolidation_NewAndUpdate",
                    "Info".ToKvp("Consolidated NEW with UPDATE events"),
                    "ConsolidationKey".ToKvp(group.Key.ToString()),
                    "NewEventCount".ToKvp(newEvents.Count),
                    "UpdateEventCount".ToKvp(updateEvents.Count),
                    "ConsolidatedEventId".ToKvp(latestUpdate.Metadata.UniqueEventId));

                return new List<BusinessEvent> { latestUpdate };
            }

            // Multiple UPDATEs  Use latest
            if (updateEvents.Count > 1)
            {
                var latestUpdate = updateEvents.Last();

                _logWrapper.AppLogger.Info("{ActionName}Consolidation_MultipleUpdates",
                    "Info".ToKvp("Consolidated multiple UPDATE events"),
                    "ConsolidationKey".ToKvp(group.Key.ToString()),
                    "UpdateEventCount".ToKvp(updateEvents.Count),
                    "ConsolidatedEventId".ToKvp(latestUpdate.Metadata.UniqueEventId));

                return new List<BusinessEvent> { latestUpdate };
            }

            return groupEvents;
        }).ToList();

    return consolidated;
}

// Helper method to extract consolidation key from event
private string GetProfileIdFromBusinessEvent(BusinessEvent businessEvent)
{
    var profileIdDetail = businessEvent.BusinessEventType.Details?
        .FirstOrDefault(detail => detail.ElementName == OhipConstants.{KeyElementName});

    return profileIdDetail?.NewValue;
}
```

**Add required constant to OhipConstants.cs (if custom consolidation):**
```csharp
public static readonly IReadOnlyList<string> {ActionName}EventsForConsolidation = new List<string>
{
    "NEW {Event1}",
    "UPDATE {Event1}"
};
```

---

## Part 4: Implement ProcessBusinessEvent

This method processes a single business event. It should:
1. Build the OHIP API request
2. Send request via CMU
3. Resolve response
4. Handle errors with correlation IDs

**Standard pattern (API call required):**
```csharp
[NotNull]
public IOhipApiResult ProcessBusinessEvent([NotNull] BusinessEvent businessEvent, [CanBeNull] Dictionary<int, Hotel> hotelLookup = null)
{
    try
    {
        var conversationRequest = _requestBuilder.BuildOhipRequestFor{ActionName}(businessEvent);

        if (conversationRequest is null)
        {
            _logWrapper.AppLogger.Error("NullConversationRequest",
                                        "Info".ToKvp("Skipping event since no request could be built"),
                                        "PrimaryKey".ToKvp(businessEvent.BusinessEventType.Header.PrimaryKey),
                                        "UniqueEventId".ToKvp(businessEvent.Metadata.UniqueEventId));

            return _responseResolver.CreateHandlerResult<{ResponseType}>(OhipHandlerResultStatus.Error,
                $"Request could not be built for Business Event with Primary Key - {businessEvent.BusinessEventType.Header.PrimaryKey}");
        }

        var deliverConversationResponse = _requestSender.SendRequest(conversationRequest);

        var ohipApiResponse = _responseResolver.ResolveResponse<{ResponseType}>(deliverConversationResponse);

        return ohipApiResponse;
    }
    catch (Exception ex)
    {
        _logWrapper.AppLogger.Error("{ActionName}EventHandler_ProcessBusinessEventError", ex,
                                    "Reason".ToKvp("Error occurred while processing OHIP business event in {ActionName}EventHandler"),
                                    "UniqueEventId".ToKvp(businessEvent.Metadata.UniqueEventId),
                                    "HotelId".ToKvp(businessEvent.BusinessEventType.Header.HotelId),
                                    "PrimaryKey".ToKvp(businessEvent.BusinessEventType.Header.PrimaryKey));

        return _responseResolver.CreateHandlerResult<{ResponseType}>(OhipHandlerResultStatus.Error, ex.Message);
    }
}
```

**Pattern with hotel lookup:**
```csharp
[NotNull]
public IOhipApiResult ProcessBusinessEvent([NotNull] BusinessEvent businessEvent, [CanBeNull] Dictionary<int, Hotel> hotelLookup = null)
{
    try
    {
        var hotelId = int.Parse(businessEvent.BusinessEventType.Header.HotelId);

        var hotel = hotelLookup != null && hotelLookup.TryGetValue(hotelId, out var value)
            ? value
            : _hotelRepository.GetHotel(hotelId);

        if (hotel is null)
        {
            _logWrapper.AppLogger.Error(nameof(ProcessBusinessEvent), "Hotel not found", "HotelId".ToKvp(hotelId));
            return _responseResolver.CreateHandlerResult<{ResponseType}>(OhipHandlerResultStatus.Error, $"Hotel with ID - {hotelId} not found");
        }

        // ... rest of processing logic
    }
    catch (Exception ex)
    {
        // ... error handling
    }
}
```

**Pattern for no API call (like StayRestrictions):**
```csharp
[NotNull]
public IOhipApiResult ProcessBusinessEvent([NotNull] BusinessEvent businessEvent, [CanBeNull] Dictionary<int, Hotel> hotelLookup = null)
{
    return _responseResolver.CreateHandlerResult<object>(OhipHandlerResultStatus.NoApiCallNeeded);
}
```

**Pattern with conditional API call:**
```csharp
[NotNull]
public IOhipApiResult ProcessBusinessEvent([NotNull] BusinessEvent businessEvent, [CanBeNull] Dictionary<int, Hotel> hotelLookup = null)
{
    try
    {
        var hotelId = int.Parse(businessEvent.BusinessEventType.Header.HotelId);
        var hotel = hotelLookup != null && hotelLookup.TryGetValue(hotelId, out var value)
            ? value
            : _hotelRepository.GetHotel(hotelId);

        if (hotel is null)
        {
            _logWrapper.AppLogger.Error(nameof(ProcessBusinessEvent), "Hotel not found", "HotelId".ToKvp(hotelId));
            return _responseResolver.CreateHandlerResult<{ResponseType}>(OhipHandlerResultStatus.Error, $"Hotel with ID - {hotelId} not found");
        }

        var eventName = businessEvent.BusinessEventType.Header.EventName;

        // Skip API call for certain event types
        if (string.Equals(eventName, OhipConstants.Delete{ActionName}Event, StringComparison.OrdinalIgnoreCase))
        {
            return _responseResolver.CreateHandlerResult<{ResponseType}>(OhipHandlerResultStatus.NoApiCallNeeded);
        }

        var conversationRequest = _requestBuilder.BuildOhipRequestFor{ActionName}(businessEvent);
        
        if (conversationRequest is null)
        {
            _logWrapper.AppLogger.Error(nameof(ProcessBusinessEvent), "Skipping event since no request could be built", "PrimaryKey".ToKvp(businessEvent.BusinessEventType.Header.PrimaryKey));
            return _responseResolver.CreateHandlerResult<{ResponseType}>(OhipHandlerResultStatus.Error,
                $"Request could not be built for Business Event with Primary Key - {businessEvent.BusinessEventType.Header.PrimaryKey}");
        }

        var conversationResponse = _requestSender.SendRequest(conversationRequest);

        return _responseResolver.ResolveResponse<{ResponseType}>(conversationResponse);
    }
    catch (Exception ex)
    {
        _logWrapper.AppLogger.Error($"{nameof({ActionName}EventHandler)} Error occurred while processing OHIP business event", ex,
                                "UniqueEventId".ToKvp(businessEvent.Metadata.UniqueEventId),
                                "HotelId".ToKvp(businessEvent.BusinessEventType.Header.HotelId),
                                "PrimaryKey".ToKvp(businessEvent.BusinessEventType.Header.PrimaryKey));

        return _responseResolver.CreateHandlerResult<{ResponseType}>(OhipHandlerResultStatus.Error, ex.Message);
    }
}
```

**Response types:** Use the appropriate response type from `Synxis.Application.OHIPDataStructures.{ActionNamespace}`:
- `Block` for Blocks
- `Profile` for Profiles
- `RatePlanInfo` for RatePlan
- `InventoryStatisticsResponse` for InventoryControl/SummaryTotals
- `List<{Type}>` if API returns array

---

## Part 5: Add Request Builder Interface Method

**File:** `InterfaceBusinessOHIP\BusinessEvents\RequestBuilder\IOhipRequestBuilder.cs`

Add method signature to the interface:

```csharp
/// <summary>
/// Builds a request to retrieve {action name} information for the specified business event.
/// </summary>
/// <param name="businessEvent">The business event containing the context and parameters for the request.</param>
/// <returns>A <see cref="DeliverConversationRequest"/> object for Delivering a conversation using CMU</returns>
DeliverConversationRequest BuildOhipRequestFor{ActionName}(BusinessEvent businessEvent);
```

---

## Part 6: Implement Request Builder

**File:** `InterfaceBusinessOHIP\BusinessEvents\RequestBuilder\OhipRequestBuilder.cs`

Implement the request builder method. This builds a `DeliverConversationRequest` for CMU.

**Standard pattern:**
```csharp
[NotNull]
public DeliverConversationRequest BuildOhipRequestFor{ActionName}([NotNull] BusinessEvent businessEvent)
{
    try
    {
        var ariSwitch = _switchRepository.GetAriSwitchByCode(OhipConstants.OhipSwitchCode);

        if (ariSwitch is null)
        {
            _logger.AppLogger.Error(nameof(OhipRequestBuilder), "SwitchCode".ToKvp(OhipConstants.OhipSwitchCode), "AriSwitch".ToNullOrEmptyKvp());
            return null;
        }

        // Extract required parameters from BusinessEvent.Details
        var primaryKey = businessEvent.BusinessEventType.Header.PrimaryKey;
        
        // Example: Extract ProfileId from Details
        var profileId = businessEvent.BusinessEventType.Details?
            .FirstOrDefault(d => string.Equals(d.ElementName, OhipConstants.{KeyElementName}, StringComparison.InvariantCulture) &&
                                !string.IsNullOrEmpty(d.NewValue))?.NewValue;

        if (string.IsNullOrEmpty(profileId))
        {
            _logger.AppLogger.Error("BuildOhipRequestFor{ActionName}_MissingKey",
                                    "PrimaryKey".ToKvp(primaryKey),
                                    "Info".ToKvp("Key element not found in business event details"));
            return null;
        }

        // Build API request model
        var requestModel = new Ohip{ActionName}Request
        {
            HotelId = businessEvent.BusinessEventType.Header.HotelId,
            {KeyProperty} = profileId,
            // Add other properties from api_integration section of YAML
            FetchInstructions = OhipConstants.{ActionName}FetchInstructionsList.ToList()
        };

        var endpoint = GetAriEndpoint(ariSwitch, businessEvent.BusinessEventType.Header.HotelId);

        if (endpoint is null)
        {
            _logger.AppLogger.Error("BuildOhipRequestFor{ActionName}_NullEndpoint",
                                    "HotelId".ToKvp(businessEvent.BusinessEventType.Header.HotelId),
                                    "SwitchCode".ToKvp(OhipConstants.OhipSwitchCode));
            return null;
        }

        var deliverConversationRequest = new DeliverConversationRequest
        {
            ConversationRequestType = ConversationRequestType.{ConversationRequestType}, // From routing.conversation_request_type
            AriRequestType = AriRequestType.{AriRequestType}, // From routing.ari_request_type
            SourceData = new SourceData
            {
                SourceDataType = SourceDataType.{SourceDataType}, // From routing.source_data_type
                DataMessage = JsonConvert.SerializeObject(requestModel),
                RecordId = businessEvent.Metadata.UniqueEventId
            },
            Endpoint = endpoint,
            HotelId = int.Parse(businessEvent.BusinessEventType.Header.HotelId)
        };

        return deliverConversationRequest;
    }
    catch (Exception ex)
    {
        _logger.AppLogger.Error(nameof(BuildOhipRequestFor{ActionName}), ex);
        throw;
    }
}
```

**Required helper method (if not exists):**
```csharp
private Endpoint GetAriEndpoint(AriSwitch ariSwitch, string hotelId)
{
    if (ariSwitch?.Endpoints is null || !ariSwitch.Endpoints.Any())
    {
        _logger.AppLogger.Error("GetAriEndpoint_NoEndpoints",
                                "SwitchCode".ToKvp(ariSwitch?.Code),
                                "HotelId".ToKvp(hotelId));
        return null;
    }

    return ariSwitch.Endpoints.FirstOrDefault();
}
```

**Add constants to OhipConstants.cs:**
```csharp
// Element name for extracting key from BusinessEvent.Details
public const string {KeyElementName} = "{ElementName}"; // e.g., "NAME ID" for profiles

// Fetch instructions (if applicable)
private static readonly List<string> _{ActionName}FetchInstructions = new List<string>
{
    "Address",
    "Communication",
    "Comment"
};
public static IReadOnlyList<string> {ActionName}FetchInstructionsList => _{ActionName}FetchInstructions;
```

**Create API Request Model class (if needed):**

**File:** `InterfaceBusiness\Ohip\ApiModels\Ohip{ActionName}Request.cs`

```csharp
using System.Collections.Generic;

namespace Synxis.Application.InterfaceBusiness.Ohip.ApiModels
{
    /// <summary>
    /// Request model for {ActionName} OHIP API calls
    /// </summary>
    public sealed class Ohip{ActionName}Request
    {
        public string HotelId { get; set; }
        
        public string {KeyProperty} { get; set; }
        
        public List<string> FetchInstructions { get; set; }
        
        // Add other properties based on api_integration section of YAML
    }
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

 Handler registered in `BusinessEventHandlerFactory` with correct dependencies
 Handler class created implementing `IBusinessEventHandler`
 Consolidation logic implemented based on YAML input
 ProcessBusinessEvent implemented with proper error handling
 Interface method added to `IOhipRequestBuilder` with XML comments
 Request builder implemented in `OhipRequestBuilder`
 API request model created (if `api_integration.required: true`)
 Constants added to `OhipConstants` (no hardcoded strings)
 Logging includes correlation IDs (UniqueEventId)
 XML comments on all public members
 JetBrains.Annotations `[NotNull]` and `[CanBeNull]` used
 Build passes without errors
