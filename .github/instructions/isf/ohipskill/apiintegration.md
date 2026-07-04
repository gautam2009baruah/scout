# API Integration - DumboBroker

This instruction guides the agent to implement DumboBroker integration for OHIP API calls.

**Note:** Only implement this if `api_integration.required: true` in the input file.

## Input Requirements

From YAML input file:
- `action.name` - Action type name
- `api_integration.endpoint_path` - API endpoint
- `api_integration.path_parameters[]` - Path parameter extraction
- `api_integration.query_parameters[]` - Query parameters
- `api_integration.request_model.class_name` - Request model class name

## Files to Create/Modify

**Create:**
1. `DumboBrokerService\Broker\Ohip{ActionName}RequestDispatcher.cs`
2. `DumboBrokerService\ResponseHandlers\Ohip\Ohip{ActionName}ResponseHandler.cs`

**Modify:**
1. `CommunicationUtilityWebSvcHost\Spring\MessageBrokerConfiguration.cs` (2 places)
2. `DumboBrokerService\Bootstrapping\Bootstrapper.Outbound.RequestDispatchers.cs`
3. `DumboBrokerService\Bootstrapping\Bootstrapper.Outbound.ResponseHandlers.cs`

---

## Part 1: Create Request Dispatcher

**File:** `DumboBrokerService\Broker\Ohip{ActionName}RequestDispatcher.cs`

**Template:**
```csharp
using System;
using System.Linq;
using Newtonsoft.Json;
using Synxis.Application.DumboBrokerService.Broker.Ohip;
using Synxis.Application.InterfaceBusiness.Ohip.ApiModels;
using Synxis.Domain.ConversationRepository;
using Synxis.Domain.HotelRepository;

namespace Synxis.Application.DumboBrokerService.Broker
{
    /// <summary>
    /// Dispatches {ActionName} requests to OHIP API
    /// </summary>
    public sealed class Ohip{ActionName}RequestDispatcher : IRequestDispatcher
    {
        private readonly IOhipHttpRequestManager _ohipHttpRequestManager;
        private readonly IHotelRepository _hotelRepository;

        public Ohip{ActionName}RequestDispatcher(
            IOhipHttpRequestManager ohipHttpRequestManager,
            IHotelRepository hotelRepository)
        {
            _ohipHttpRequestManager = ohipHttpRequestManager -> throw new ArgumentNullException(nameof(ohipHttpRequestManager));
            _hotelRepository = hotelRepository -> throw new ArgumentNullException(nameof(hotelRepository));
        }

        /// <summary>
        /// Dispatches the {ActionName} request to OHIP API
        /// </summary>
        public void DispatchRequest(Conversation conversation)
        {
            if (conversation?.ConversationSourceData?.DataMessage == null)
            {
                throw new ArgumentException("Conversation or DataMessage is null", nameof(conversation));
            }

            try
            {
                // Deserialize request model
                var requestModel = JsonConvert.DeserializeObject<{RequestModelClassName}>(
                    conversation.ConversationSourceData.DataMessage);

                if (requestModel == null)
                {
                    throw new InvalidOperationException("Failed to deserialize request model");
                }

                // Load hotel information
                var hotel = _hotelRepository.LoadHotel(requestModel.HotelId);
                if (hotel == null)
                {
                    throw new InvalidOperationException($"Hotel not found: {requestModel.HotelId}");
                }

                var pmsCode = hotel.PmsCode;
                var chainCode = hotel.PrimaryChain?.ShortID;

                if (string.IsNullOrEmpty(pmsCode) || string.IsNullOrEmpty(chainCode))
                {
                    throw new InvalidOperationException($"Missing PmsCode or ChainCode for Hotel {requestModel.HotelId}");
                }

                // Build endpoint URL
                // Based on api_integration.endpoint_path and path_parameters
                var endpoint = $"/crm/v1/profiles/{requestModel.ProfileId}";
                
                // Build query string
                // Based on api_integration.query_parameters
                var queryParams = string.Empty;
                if (requestModel.FetchInstructions != null && requestModel.FetchInstructions.Any())
                {
                    queryParams = "?" + string.Join("&", 
                        requestModel.FetchInstructions.Select(fi => $"fetchInstructions={fi}"));
                }

                var fullUrl = endpoint + queryParams;

                // Send GET request
                _ohipHttpRequestManager.SendGetRequestAndWrapResponse(
                    conversation,
                    fullUrl,
                    pmsCode,
                    chainCode);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    $"Error dispatching {ActionName} request: {ex.Message}", ex);
            }
        }
    }
}
```

**URL Building Logic:**

Based on input parameters:
1. Replace path variables: `/profiles/{{ProfileId}}`  `/profiles/{requestModel.ProfileId}`
2. Build query string from `query_parameters[]`
3. For repeatable params, join with `&`

---

## Part 2: Create Response Handler

**File:** `DumboBrokerService\ResponseHandlers\Ohip\Ohip{ActionName}ResponseHandler.cs`

**Template:**
```csharp
using System;
using Newtonsoft.Json;
using Synxis.Application.DumboBrokerService.ResponseHandlers.Ohip;
using Synxis.Domain.ConversationRepository;

namespace Synxis.Application.DumboBrokerService.ResponseHandlers.Ohip
{
    /// <summary>
    /// Handles {ActionName} responses from OHIP API
    /// </summary>
    public sealed class Ohip{ActionName}ResponseHandler : IResponseHandler
    {
        /// <summary>
        /// Processes the {ActionName} response from OHIP
        /// </summary>
        public void HandleResponse(Conversation conversation)
        {
            if (conversation == null)
            {
                throw new ArgumentNullException(nameof(conversation));
            }

            try
            {
                var httpResponse = conversation.ConversationBody?.HttpResponse;
                
                if (httpResponse == null)
                {
                    throw new InvalidOperationException("HttpResponse is null");
                }

                // Check HTTP status code
                var statusCode = httpResponse.HttpStatusCode;
                
                if (statusCode == 200 || statusCode == 201)
                {
                    // Success - store response
                    var responseMessage = new ResponseMessage
                    {
                        IsSuccess = true,
                        StatusCode = statusCode,
                        Response = httpResponse.Body -> string.Empty
                    };

                    conversation.ConversationBody.SetResponseDto(responseMessage);
                }
                else
                {
                    // Failure
                    var responseMessage = new ResponseMessage
                    {
                        IsSuccess = false,
                        StatusCode = statusCode,
                        ErrorMessage = httpResponse.Body -> $"HTTP {statusCode}",
                        Response = httpResponse.Body -> string.Empty
                    };

                    conversation.ConversationBody.SetResponseDto(responseMessage);
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    $"Error handling {ActionName} response: {ex.Message}", ex);
            }
        }
    }
}
```

---

## Part 3: Register Dispatcher (CMU)

**File:** `CommunicationUtilityWebSvcHost\Spring\MessageBrokerConfiguration.cs`

**Find the `RequestDispatcherFactory()` method and add to dictionary:**
```csharp
private Dictionary<AriRequestType, Func<IRequestDispatcher>> RequestDispatcherFactory()
{
    return new Dictionary<AriRequestType, Func<IRequestDispatcher>>
    {
        { AriRequestType.GetSummaryTotals, () => new OhipSummaryTotalsRequestDispatcher(_ohipHttpRequestManager, _hotelRepository) },
        { AriRequestType.GetInventoryControl, () => new OhipInventoryControlRequestDispatcher(_ohipHttpRequestManager, _hotelRepository) },
        { AriRequestType.GetStayRestrictions, () => new OhipStayRestrictionsRequestDispatcher(_ohipHttpRequestManager, _hotelRepository) },
        { AriRequestType.GetRatePlan, () => new OhipRatePlanRequestDispatcher(_ohipHttpRequestManager, _hotelRepository) },
        { AriRequestType.GetRatePlanDetails, () => new OhipRatePlanDetailsRequestDispatcher(_ohipHttpRequestManager, _hotelRepository) },
        { AriRequestType.GetBlocks, () => new OhipBlocksRequestDispatcher(_ohipHttpRequestManager, _hotelRepository) },
        { AriRequestType.CreateProfile, () => new OhipProfilesRequestDispatcher(_ohipHttpRequestManager, _hotelRepository) }  //  Add
    };
}
```

**Pattern:** `{ AriRequestType.{AriRequestType}, () => new Ohip{ActionName}RequestDispatcher(_ohipHttpRequestManager, _hotelRepository) }`

---

## Part 4: Register Dispatcher (DumboBroker)

**File:** `DumboBrokerService\Bootstrapping\Bootstrapper.Outbound.RequestDispatchers.cs`

**Find the `AddRequestDispatcherFactory()` method and add to dictionary:**
```csharp
private void AddRequestDispatcherFactory(IServiceCollection services)
{
    services.AddSingleton<Func<AriRequestType, IRequestDispatcher>>(provider =>
    {
        var ohipHttpRequestManager = provider.GetRequiredService<IOhipHttpRequestManager>();
        var hotelRepository = provider.GetRequiredService<IHotelRepository>();

        return ariRequestType => ariRequestType switch
        {
            AriRequestType.GetSummaryTotals => new OhipSummaryTotalsRequestDispatcher(ohipHttpRequestManager, hotelRepository),
            AriRequestType.GetInventoryControl => new OhipInventoryControlRequestDispatcher(ohipHttpRequestManager, hotelRepository),
            AriRequestType.GetStayRestrictions => new OhipStayRestrictionsRequestDispatcher(ohipHttpRequestManager, hotelRepository),
            AriRequestType.GetRatePlan => new OhipRatePlanRequestDispatcher(ohipHttpRequestManager, hotelRepository),
            AriRequestType.GetRatePlanDetails => new OhipRatePlanDetailsRequestDispatcher(ohipHttpRequestManager, hotelRepository),
            AriRequestType.GetBlocks => new OhipBlocksRequestDispatcher(ohipHttpRequestManager, hotelRepository),
            AriRequestType.CreateProfile => new OhipProfilesRequestDispatcher(ohipHttpRequestManager, hotelRepository),  //  Add
            _ => throw new ArgumentException($"Unknown AriRequestType: {ariRequestType}")
        };
    });
}
```

---

## Part 5: Register Response Handler (CMU)

**File:** `CommunicationUtilityWebSvcHost\Spring\MessageBrokerConfiguration.cs`

**Find the `GetResponseHandlers()` method and add to dictionary:**
```csharp
private Dictionary<ConversationRequestType, IResponseHandler> GetResponseHandlers()
{
    return new Dictionary<ConversationRequestType, IResponseHandler>
    {
        { ConversationRequestType.GetSummaryTotals, new OhipSummaryTotalsResponseHandler() },
        { ConversationRequestType.GetInventoryControl, new OhipInventoryControlResponseHandler() },
        { ConversationRequestType.GetStayRestrictions, new OhipStayRestrictionsResponseHandler() },
        { ConversationRequestType.GetRatePlan, new OhipRatePlanResponseHandler() },
        { ConversationRequestType.GetRatePlanDetails, new OhipRatePlanDetailsResponseHandler() },
        { ConversationRequestType.GetBlocks, new OhipBlocksResponseHandler() },
        { ConversationRequestType.CreateProfile, new OhipProfilesResponseHandler() }  //  Add
    };
}
```

---

## Part 6: Register Response Handler (DumboBroker)

**File:** `DumboBrokerService\Bootstrapping\Bootstrapper.Outbound.ResponseHandlers.cs`

**Find the `GetResponseHandlers()` method and add to dictionary:**
```csharp
private Dictionary<ConversationRequestType, IResponseHandler> GetResponseHandlers()
{
    return new Dictionary<ConversationRequestType, IResponseHandler>
    {
        { ConversationRequestType.GetSummaryTotals, new OhipSummaryTotalsResponseHandler() },
        { ConversationRequestType.GetInventoryControl, new OhipInventoryControlResponseHandler() },
        { ConversationRequestType.GetStayRestrictions, new OhipStayRestrictionsResponseHandler() },
        { ConversationRequestType.GetRatePlan, new OhipRatePlanResponseHandler() },
        { ConversationRequestType.GetRatePlanDetails, new OhipRatePlanDetailsResponseHandler() },
        { ConversationRequestType.GetBlocks, new OhipBlocksResponseHandler() },
        { ConversationRequestType.CreateProfile, new OhipProfilesResponseHandler() }  //  Add
    };
}
```

---

## Build & Verify

```powershell
# Build CommunicationUtilityWebSvcHost project
dotnet build "C:\Synxis\ProjectX\SHS\EnterpriseServices\ServiceHosts\CommunicationUtilityWebSvcHost\CommunicationUtilityWebSvcHost.csproj"

if ($LASTEXITCODE -eq 0) {
    Write-Host "CMU build succeeded" -ForegroundColor Green
} else {
    Write-Host "CMU build failed - check errors above" -ForegroundColor Red
    exit 1
}

# Build DumboBrokerService project
dotnet build "C:\Synxis\ProjectX\Synxis\Application\Ari\DumboBrokerService\DumboBrokerService.csproj"

if ($LASTEXITCODE -eq 0) {
    Write-Host "DumboBroker build succeeded" -ForegroundColor Green
} else {
    Write-Host "DumboBroker build failed - check errors above" -ForegroundColor Red
    exit 1
}
```

---

## Success Criteria

 Request dispatcher created in `DumboBrokerService\Broker\`
 Response handler created in `DumboBrokerService\ResponseHandlers\Ohip\`
 Dispatcher registered in CMU `MessageBrokerConfiguration.cs`
 Dispatcher registered in DumboBroker `Bootstrapper.Outbound.RequestDispatchers.cs`
 Response handler registered in CMU `MessageBrokerConfiguration.cs`
 Response handler registered in DumboBroker `Bootstrapper.Outbound.ResponseHandlers.cs`
 URL building logic matches input specifications
 Both projects build successfully
 **Unit tests generated** (see testing.md for requirements)
