# Unit Testing Guide

This instruction guides the agent to generate comprehensive unit tests for OHIP components with 80%+ code coverage.

## Overview

** MANDATORY REQUIREMENT:** Tests MUST be generated as part of EVERY implementation workflow, regardless of mode. Do NOT wait for explicit test requests.

**Default Behavior:**
- After implementing any OHIP component (event type, handler, DTO mapping, etc.), automatically generate corresponding unit tests
- Tests are NOT optional - they are a required step in the implementation checklist
- Build verification alone is NOT sufficient - tests must be created and verified to compile

**Testing applies to:**
- EndToEnd workflows
- Individual component implementations  
- API integrations
- DTO mappings
- All OHIP development tasks

**Special Requirement for New Event Types:**
- Whenever a new OHIP action type is added (in ANY mode), you MUST update:
  1. `OhipEventFetcherTests.cs` - Add TestCase for new action type
  2. `OhipEventMessageTypeFilterTests.cs` - Add complete test section for new action type
- This applies to: NewEventType mode, EndToEnd mode, or any mode where new event types are registered
- See Section 0 below for detailed instructions

## Prerequisites - Review Existing Test Patterns

**BEFORE writing new tests, you MUST:**

1. **Review existing test files** in `C:\Synxis\ProjectX\Synxis\Application\Integration\PropertyConnect.Tests.Unit\Inbound\Pms\Ohip\BusinessEvents\`
2. **Understand the patterns** used in existing tests (naming conventions, mock setup, helper methods, test structure)
3. **Follow the same patterns** when creating new tests to maintain consistency

**Existing test files to review:**
- `ProfilesEventHandlerTests.cs` - Example of EventHandler tests
- `OhipBlocksDtoAssemblerTests.cs` - Example of DtoAssembler tests
- `OhipRequestBuilderTests.cs` - Example of RequestBuilder tests
- Other similar test files for the component type you're testing

## Test Project

**Location:** `Synxis\Application\Integration\PropertyConnect.Tests.Unit\Inbound\Pms\Ohip\BusinessEvents\`

**Test Structure:**
```
PropertyConnect.Tests.Unit/
  Inbound/
    Pms/
      Ohip/
        BusinessEvents/
          OhipEventFetcherTests.cs (UPDATE when adding new event type)
          OhipEventMessageTypeFilterTests.cs (UPDATE when adding new event type)
          {ActionName}EventHandlerTests.cs
          Ohip{ActionName}DtoAssemblerTests.cs
          OhipRequestBuilderTests.cs  (add tests to existing file)
```

---

## 0. Factory and Filter Tests (MANDATORY for New Event Types)

 **CRITICAL:** When adding a new OHIP action type in ANY mode (NewEventType, EndToEnd, etc.), you MUST update these existing test files. This is NOT optional.

### 0A: OhipEventFetcherTests

**File:** `Inbound\Pms\Ohip\BusinessEvents\OhipEventFetcherTests.cs`

**Action Required:** Add new TestCase attribute for the action type to the existing test method

**Implementation:**
1. Locate the `Create_ValidActionType_ReturnsOhipEventFetcher` test method
2. Add a new `[TestCase(OhipActionType.{ActionName})]` attribute
3. Insert in logical order with other TestCase attributes

**Example:**
```csharp
[TestCase(OhipActionType.SummaryTotals)]
[TestCase(OhipActionType.InventoryControl)]
[TestCase(OhipActionType.StayRestrictions)]
[TestCase(OhipActionType.RatePlan)]
[TestCase(OhipActionType.RatePlanDetails)]
[TestCase(OhipActionType.Blocks)]
[TestCase(OhipActionType.Profiles)]
[TestCase(OhipActionType.Hurdles)]  //  ADD THIS LINE
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
- Use exact enum value from `OhipActionType` enum
- Add only ONE line: `[TestCase(OhipActionType.{ActionName})]`
- Do NOT modify the test method body

---

### 0B: OhipEventMessageTypeFilterTests

**File:** `Inbound\Pms\Ohip\BusinessEvents\OhipEventMessageTypeFilterTests.cs`

**Action Required:** Add a complete test section (4 test methods) for the new action type

**Implementation:**
1. Locate the last action type test section (e.g., `#region Profiles Tests`)
2. After its `#endregion`, insert the new test section
3. Insert BEFORE the `#region DomainEventType Tests` section

**Template:**
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
public void OhipEventMessageType_{ActionName}_ShouldHave{NumberWord}Events()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.{ActionName}];

    // Assert
    events.Should().HaveCount({EventCount});
}

[Test]
public void OhipEventMessageType_{ActionName}_ShouldContainSpecificEvents()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.{ActionName}];
    var eventNames = events.Select(e => e.Name).ToList();

    // Assert
    eventNames.Should().Contain("{EventName1}");
    eventNames.Should().Contain("{EventName2}");
    eventNames.Should().Contain("{EventName3}");
    // ... add one per event from action.events[]
}

#endregion {ActionName} Tests
```

**Rules:**
- Replace `{ActionName}` with action name from input (e.g., "Hurdles")
- Replace `{NumberWord}` with word form of count: "One", "Two", "Three", "Five", etc.
- Replace `{EventCount}` with actual number (e.g., 3)
- Add one `eventNames.Should().Contain(...)` for each event in `action.events[]`
- Use exact event names from input (preserve casing/spaces: "NEW HURDLE", not "new hurdle")
- Follow FluentAssertions syntax (`.Should().ContainKey()`, `.Should().HaveCount()`)

**Example for Hurdles action:**
```csharp
#region Hurdles Tests

[Test]
public void OhipEventMessageType_Hurdles_ShouldExist()
{
    // Act & Assert
    OhipEventMessageTypeFilter.OhipEventMessageType
        .Should().ContainKey(OhipActionType.Hurdles);
}

[Test]
public void OhipEventMessageType_Hurdles_ShouldHaveAtLeastOneEvent()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.Hurdles];
    // Assert
    events.Should().NotBeEmpty();
}

[Test]
public void OhipEventMessageType_Hurdles_ShouldHaveThreeEvents()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.Hurdles];

    // Assert
    events.Should().HaveCount(3);
}

[Test]
public void OhipEventMessageType_Hurdles_ShouldContainSpecificEvents()
{
    // Act
    var events = OhipEventMessageTypeFilter.OhipEventMessageType[OhipActionType.Hurdles];
    var eventNames = events.Select(e => e.Name).ToList();

    // Assert
    eventNames.Should().Contain("NEW HURDLE");
    eventNames.Should().Contain("UPDATE HURDLE");
    eventNames.Should().Contain("DELETE HURDLE");
}

#endregion Hurdles Tests
```

---

## Test Categories

User can request tests for any combination of:
- Event handlers (always generate)
- Request builders (if API integration exists)
- DTO handlers (always generate if DTO mapping exists)
- **DTO assemblers (ONLY generate AFTER developer implements logic - NOT during initial skeleton creation)**
- Factory and filter tests (always update when new event type added)

**CRITICAL:** Do NOT generate DTO assembler tests during initial implementation. Assembler is created as skeleton with `NotImplementedException`. Developer must implement the logic first, then explicitly request test generation.

---

## 1. Event Handler Tests

**File:** `Inbound\Pms\Ohip\BusinessEvents\{ActionName}EventHandlerTests.cs`

**Template:**
```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Moq;
using NUnit.Framework;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.EventHandlers;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.RequestBuilder;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.ResponseHandler;
using Synxis.Domain.BusinessEventType;

namespace PropertyConnect.Tests.Unit.Inbound.Pms.Ohip.BusinessEvents
{
    [TestFixture]
    public sealed class {ActionName}EventHandlerTests
    {
        private Mock<IOhipRequestBuilder> _mockRequestBuilder;
        private Mock<IOhipRequestSender> _mockRequestSender;
        private Mock<IOhipResponseResolver> _mockResponseResolver;
        private {ActionName}EventHandler _handler;

        [SetUp]
        public void Setup()
        {
            _mockRequestBuilder = new Mock<IOhipRequestBuilder>();
            _mockRequestSender = new Mock<IOhipRequestSender>();
            _mockResponseResolver = new Mock<IOhipResponseResolver>();
            
            _handler = new {ActionName}EventHandler(
                _mockRequestBuilder.Object,
                _mockRequestSender.Object,
                _mockResponseResolver.Object);
        }

        #region Constructor Tests

        [Test]
        public void Constructor_NullRequestBuilder_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => 
                new {ActionName}EventHandler(null, _mockRequestSender.Object, _mockResponseResolver.Object));
        }

        [Test]
        public void Constructor_NullRequestSender_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => 
                new {ActionName}EventHandler(_mockRequestBuilder.Object, null, _mockResponseResolver.Object));
        }

        [Test]
        public void Constructor_NullResponseResolver_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => 
                new {ActionName}EventHandler(_mockRequestBuilder.Object, _mockRequestSender.Object, null));
        }

        #endregion

        #region ConsolidateBusinessEvents Tests

        [Test]
        public void ConsolidateBusinessEvents_NullInput_ReturnsEmptyList()
        {
            var result = _handler.ConsolidateBusinessEvents(null);
            
            Assert.IsNotNull(result);
            Assert.IsEmpty(result);
        }

        [Test]
        public void ConsolidateBusinessEvents_EmptyList_ReturnsEmptyList()
        {
            var result = _handler.ConsolidateBusinessEvents(new List<BusinessEvent>());
            
            Assert.IsNotNull(result);
            Assert.IsEmpty(result);
        }

        [Test]
        public void ConsolidateBusinessEvents_SingleEvent_ReturnsSameEvent()
        {
            var businessEvent = CreateSampleBusinessEvent("1807233", "NEW {ACTION}");
            var events = new List<BusinessEvent> { businessEvent };

            var result = _handler.ConsolidateBusinessEvents(events);

            Assert.AreEqual(1, result.Count);
            Assert.AreSame(businessEvent, result[0]);
        }

        [Test]
        public void ConsolidateBusinessEvents_MultipleEventsWithSameKey_KeepsMostRecent()
        {
            var oldEvent = CreateSampleBusinessEvent("1807233", "NEW {ACTION}", DateTime.Parse("2025-01-01"));
            var newEvent = CreateSampleBusinessEvent("1807233", "UPDATE {ACTION}", DateTime.Parse("2025-01-02"));
            var events = new List<BusinessEvent> { oldEvent, newEvent };

            var result = _handler.ConsolidateBusinessEvents(events);

            Assert.AreEqual(1, result.Count);
            Assert.AreSame(newEvent, result[0]);
        }

        [Test]
        public void ConsolidateBusinessEvents_MultipleEventsWithDifferentKeys_ReturnsAll()
        {
            var event1 = CreateSampleBusinessEvent("1807233", "NEW {ACTION}");
            var event2 = CreateSampleBusinessEvent("1807234", "NEW {ACTION}");
            var events = new List<BusinessEvent> { event1, event2 };

            var result = _handler.ConsolidateBusinessEvents(events);

            Assert.AreEqual(2, result.Count);
        }

        #endregion

        #region ProcessBusinessEvent Tests

        [Test]
        public void ProcessBusinessEvent_NullBusinessEvent_ReturnsError()
        {
            var expectedResult = CreateErrorResult("Business event is null");
            _mockResponseResolver
                .Setup(r => r.CreateHandlerResult<object>(OhipHandlerResultStatus.Error, "Business event is null"))
                .Returns(expectedResult);

            var result = _handler.ProcessBusinessEvent(null);

            Assert.AreSame(expectedResult, result);
        }

        [Test]
        public void ProcessBusinessEvent_ValidEvent_CallsRequestBuilder()
        {
            var businessEvent = CreateSampleBusinessEvent("1807233", "NEW {ACTION}");
            var conversationRequest = new DeliverConversationRequest();
            
            _mockRequestBuilder
                .Setup(b => b.BuildOhipRequestFor{ActionName}(businessEvent))
                .Returns(conversationRequest);
            
            _mockRequestSender
                .Setup(s => s.SendRequest(conversationRequest))
                .Returns(new DeliverConversationResponse());
            
            _mockResponseResolver
                .Setup(r => r.ResolveResponse<object>(It.IsAny<DeliverConversationResponse>()))
                .Returns(CreateSuccessResult());

            _handler.ProcessBusinessEvent(businessEvent);

            _mockRequestBuilder.Verify(b => b.BuildOhipRequestFor{ActionName}(businessEvent), Times.Once);
        }

        [Test]
        public void ProcessBusinessEvent_RequestBuilderReturnsNull_ReturnsError()
        {
            var businessEvent = CreateSampleBusinessEvent("1807233", "NEW {ACTION}");
            var expectedResult = CreateErrorResult("Failed to build OHIP request");
            
            _mockRequestBuilder
                .Setup(b => b.BuildOhipRequestFor{ActionName}(businessEvent))
                .Returns((DeliverConversationRequest)null);
            
            _mockResponseResolver
                .Setup(r => r.CreateHandlerResult<object>(
                    OhipHandlerResultStatus.Error, 
                    It.IsAny<string>()))
                .Returns(expectedResult);

            var result = _handler.ProcessBusinessEvent(businessEvent);

            Assert.AreSame(expectedResult, result);
            _mockRequestSender.Verify(s => s.SendRequest(It.IsAny<DeliverConversationRequest>()), Times.Never);
        }

        [Test]
        public void ProcessBusinessEvent_SendRequestSucceeds_ReturnsResolvedResponse()
        {
            var businessEvent = CreateSampleBusinessEvent("1807233", "NEW {ACTION}");
            var conversationRequest = new DeliverConversationRequest();
            var conversationResponse = new DeliverConversationResponse();
            var expectedResult = CreateSuccessResult();

            _mockRequestBuilder
                .Setup(b => b.BuildOhipRequestFor{ActionName}(businessEvent))
                .Returns(conversationRequest);
            
            _mockRequestSender
                .Setup(s => s.SendRequest(conversationRequest))
                .Returns(conversationResponse);
            
            _mockResponseResolver
                .Setup(r => r.ResolveResponse<object>(conversationResponse))
                .Returns(expectedResult);

            var result = _handler.ProcessBusinessEvent(businessEvent);

            Assert.AreSame(expectedResult, result);
        }

        [Test]
        public void ProcessBusinessEvent_ExceptionThrown_ReturnsError()
        {
            var businessEvent = CreateSampleBusinessEvent("1807233", "NEW {ACTION}");
            var exception = new InvalidOperationException("Test exception");
            var expectedResult = CreateErrorResult($"Exception processing event: {exception.Message}");

            _mockRequestBuilder
                .Setup(b => b.BuildOhipRequestFor{ActionName}(businessEvent))
                .Throws(exception);
            
            _mockResponseResolver
                .Setup(r => r.CreateHandlerResult<object>(
                    OhipHandlerResultStatus.Error,
                    It.IsAny<string>()))
                .Returns(expectedResult);

            var result = _handler.ProcessBusinessEvent(businessEvent);

            Assert.AreSame(expectedResult, result);
        }

        #endregion

        #region Helper Methods

        private BusinessEvent CreateSampleBusinessEvent(
            string identifier, 
            string eventName,
            DateTime? timestamp = null)
        {
            return new BusinessEvent
            {
                HotelId = 26801,
                RecordId = "TESTRECORD",
                Header = new BusinessEventHeader
                {
                    EventName = eventName,
                    TimeStamp = timestamp -> DateTime.UtcNow,
                    UniqueEventId = Guid.NewGuid().ToString()
                },
                Details = new List<BusinessEventDetail>
                {
                    new BusinessEventDetail
                    {
                        ElementName = "ID_FIELD",  // TODO: Use actual field name from consolidation keys
                        NewValue = identifier
                    }
                },
                MetaData = new BusinessEventMetaData
                {
                    PmsChainCode = "TESTCHAIN"
                }
            };
        }

        private IOhipApiResult CreateSuccessResult()
        {
            var mock = new Mock<IOhipApiResult>();
            mock.Setup(r => r.Status).Returns(OhipHandlerResultStatus.Success);
            return mock.Object;
        }

        private IOhipApiResult CreateErrorResult(string message)
        {
            var mock = new Mock<IOhipApiResult>();
            mock.Setup(r => r.Status).Returns(OhipHandlerResultStatus.Error);
            mock.Setup(r => r.ErrorMessage).Returns(message);
            return mock.Object;
        }

        #endregion
    }
}
```

---

## 2. Request Builder Tests

**File:** `Inbound\Pms\Ohip\BusinessEvents\OhipRequestBuilderTests.cs` (add tests to existing file)

**Template:**
```csharp
using System;
using System.Collections.Generic;
using Moq;
using Newtonsoft.Json;
using NUnit.Framework;
using Synxis.Application.InterfaceBusinessOHIP.BusinessEvents.RequestBuilder;
using Synxis.Application.InterfaceBusiness.Ohip.ApiModels;
using Synxis.Domain.BusinessEventType;

namespace PropertyConnect.Tests.Unit.Inbound.Pms.Ohip.BusinessEvents
{
    [TestFixture]
    public sealed class OhipRequestBuilder{ActionName}Tests
    {
        private Mock<ILogger> _mockLogger;
        private OhipRequestBuilder _builder;

        [SetUp]
        public void Setup()
        {
            _mockLogger = new Mock<ILogger>();
            _builder = new OhipRequestBuilder(_mockLogger.Object);
        }

        [Test]
        public void BuildOhipRequestFor{ActionName}_NullBusinessEvent_ReturnsNull()
        {
            var result = _builder.BuildOhipRequestFor{ActionName}(null);
            Assert.IsNull(result);
        }

        [Test]
        public void BuildOhipRequestFor{ActionName}_MissingRequiredField_ReturnsNull()
        {
            var businessEvent = new BusinessEvent
            {
                HotelId = 26801,
                Details = new List<BusinessEventDetail>() // Missing required field
            };

            var result = _builder.BuildOhipRequestFor{ActionName}(businessEvent);

            Assert.IsNull(result);
            _mockLogger.Verify(l => l.AppLogger.Error(
                It.IsAny<string>(),
                It.IsAny<object[]>()), Times.Once);
        }

        [Test]
        public void BuildOhipRequestFor{ActionName}_ValidEvent_ReturnsConversationRequest()
        {
            var businessEvent = CreateValidBusinessEvent();

            var result = _builder.BuildOhipRequestFor{ActionName}(businessEvent);

            Assert.IsNotNull(result);
            Assert.AreEqual(26801, result.HotelId);
            Assert.IsNotNull(result.SourceData);
        }

        [Test]
        public void BuildOhipRequestFor{ActionName}_ValidEvent_SetsCorrectRoutingTypes()
        {
            var businessEvent = CreateValidBusinessEvent();

            var result = _builder.BuildOhipRequestFor{ActionName}(businessEvent);

            // TODO: Replace with actual routing types from YAML input
            Assert.AreEqual(AriRequestType.Create{ActionName}, result.AriRequestType);
            Assert.AreEqual(ConversationRequestType.Create{ActionName}, result.ConversationRequestType);
            Assert.AreEqual(SourceDataType.{ActionName}Dto, result.SourceData.SourceDataType);
        }

        [Test]
        public void BuildOhipRequestFor{ActionName}_ValidEvent_SerializesRequestModel()
        {
            var businessEvent = CreateValidBusinessEvent();

            var result = _builder.BuildOhipRequestFor{ActionName}(businessEvent);

            Assert.IsNotNull(result.SourceData.DataMessage);
            
            // TODO: Replace with actual request model class
            var requestModel = JsonConvert.DeserializeObject<Ohip{ActionName}Request>(
                result.SourceData.DataMessage);
            
            Assert.IsNotNull(requestModel);
            Assert.AreEqual(26801, requestModel.HotelId);
        }

        private BusinessEvent CreateValidBusinessEvent()
        {
            return new BusinessEvent
            {
                HotelId = 26801,
                RecordId = "TESTRECORD",
                Header = new BusinessEventHeader
                {
                    UniqueEventId = Guid.NewGuid().ToString()
                },
                Details = new List<BusinessEventDetail>
                {
                    new BusinessEventDetail
                    {
                        ElementName = "ID_FIELD",  // TODO: Use actual field name
                        NewValue = "TEST123"
                    }
                }
            };
        }
    }
}
```

---

## 3. DTO Assembler Tests

**File:** `Inbound\Pms\Ohip\BusinessEvents\Ohip{ActionName}DtoAssemblerTests.cs`

**Template:**
```csharp
using System;
using NUnit.Framework;
using Synxis.Application.InterfaceDto;
using Synxis.Application.InterfaceBusinessOHIP.Dto.{ActionName};

namespace PropertyConnect.Tests.Unit.Inbound.Pms.Ohip.BusinessEvents
{
    [TestFixture]
    public sealed class {ActionName}DtoAssemblerTests
    {
        private {AssemblerClassName} _assembler;

        [SetUp]
        public void Setup()
        {
            _assembler = new {AssemblerClassName}();
        }

        [Test]
        public void AssembleDto_NullApiResponse_ReturnsNull()
        {
            var result = _assembler.AssembleDto(null, 26801, "test-correlation-id");
            Assert.IsNull(result);
        }

        [Test]
        public void AssembleDto_EmptyApiResponse_ReturnsNull()
        {
            var result = _assembler.AssembleDto(string.Empty, 26801, "test-correlation-id");
            Assert.IsNull(result);
        }

        [Test]
        public void AssembleDto_ValidApiResponse_ReturnsDto()
        {
            var apiResponse = CreateSampleApiResponse();

            var result = _assembler.AssembleDto(apiResponse, 26801, "test-correlation-id");

            Assert.IsNotNull(result);
            Assert.AreEqual(26801, result.HotelId);
            // TODO: Add assertions for mapped fields
        }

        [Test]
        public void AssembleDto_InvalidJson_ReturnsNull()
        {
            var invalidJson = "{ invalid json }";

            var result = _assembler.AssembleDto(invalidJson, 26801, "test-correlation-id");

            Assert.IsNull(result);
        }

        // TODO: Add tests for specific field mappings
        // TODO: Add tests for nested object mappings
        // TODO: Add tests for collection mappings

        private string CreateSampleApiResponse()
        {
            // TODO: Create realistic sample API response
            return @"{
                ""hotelId"": 26801,
                ""data"": {
                    ""field1"": ""value1"",
                    ""field2"": ""value2""
                }
            }";
        }
    }
}
```

---

## 4. DTO Handler Tests

**File:** `Inbound\Pms\Ohip\BusinessEvents\Ohip{ActionName}DtoHandlerTests.cs`

**Template:**
```csharp
using System;
using Moq;
using NUnit.Framework;
using Google.Cloud.PubSub.V1;
using Synxis.Application.InterfaceBusinessOHIP.Dto.{ActionName};
using Synxis.Domain.ConversationRepository;

namespace PropertyConnect.Tests.Unit.Inbound.Pms.Ohip.BusinessEvents
{
    [TestFixture]
    public sealed class {ActionName}DtoHandlerTests
    {
        private Mock<{AssemblerClassName}> _mockAssembler;
        private Mock<PublisherClient> _mockPublisher;
        private {HandlerClassName} _handler;

        [SetUp]
        public void Setup()
        {
            _mockAssembler = new Mock<{AssemblerClassName}>();
            _mockPublisher = new Mock<PublisherClient>();
            _handler = new {HandlerClassName}(_mockAssembler.Object, _mockPublisher.Object);
        }

        [Test]
        public void Constructor_NullAssembler_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => 
                new {HandlerClassName}(null, _mockPublisher.Object));
        }

        [Test]
        public void Constructor_NullPublisher_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => 
                new {HandlerClassName}(_mockAssembler.Object, null));
        }

        [Test]
        public void HandleDtoRequest_NullConversation_ThrowsArgumentNullException()
        {
            Assert.Throws<ArgumentNullException>(() => 
                _handler.HandleDtoRequest(null));
        }

        // TODO: Add tests for successful DTO processing
        // TODO: Add tests for Pub/Sub publishing
        // TODO: Add tests for error scenarios
    }
}
```

---

## Build & Verify

Before running tests, ensure the main project builds successfully:

```powershell
# Build InterfaceBusinessOHIP project first
dotnet build "C:\Synxis\ProjectX\Synxis\Application\Interfaces\InterfaceBusiness.OHIP\InterfaceBusinessOHIP\InterfaceBusinessOHIP.csproj"

# Verify build succeeded
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build succeeded - ready to run tests" -ForegroundColor Green
} else {
    Write-Host "Build failed - fix errors before running tests" -ForegroundColor Red
    exit 1
}
```

---

## Review Tests Before Running

**After generating tests:**
1. Present the generated test code to the user
2. Wait for user approval/feedback
3. Make any requested adjustments
4. Only proceed to run tests after user confirms tests look correct

---

## Running Tests

**IMPORTANT:** Run ONLY tests in the OHIP BusinessEvents folder, not all tests in the project.

```powershell
# Run ONLY OHIP BusinessEvents tests (recommended)
dotnet test "C:\Synxis\ProjectX\Synxis\Application\Integration\PropertyConnect.Tests.Unit\PropertyConnect.Tests.Unit.csproj" --filter "FullyQualifiedName~PropertyConnect.Tests.Unit.Inbound.Pms.Ohip.BusinessEvents"

# Run specific test class
dotnet test "C:\Synxis\ProjectX\Synxis\Application\Integration\PropertyConnect.Tests.Unit\PropertyConnect.Tests.Unit.csproj" --filter "FullyQualifiedName~{ActionName}EventHandlerTests"

# Run with coverage (OHIP BusinessEvents only)
dotnet test "C:\Synxis\ProjectX\Synxis\Application\Integration\PropertyConnect.Tests.Unit\PropertyConnect.Tests.Unit.csproj" --filter "FullyQualifiedName~PropertyConnect.Tests.Unit.Inbound.Pms.Ohip.BusinessEvents" --collect:"XPlat Code Coverage"
```

---

## Handling Test Failures

**When tests fail, follow these rules:**

### 1. Newly Added Tests
- **Fix immediately** - These are tests you just created, so failures indicate issues in your test code or implementation
- Analyze the failure and correct the test or implementation logic

### 2. Existing Tests That Fail Due to Your Changes
- **Modify and fix** - If your new code breaks existing tests, you must update those tests to accommodate the changes
- Example: You added a new enum value, existing switch statements may need updating
- Verify the test still validates the correct behavior after modification

### 3. Existing Tests That Fail But Are Unrelated to Your Changes
- **DO NOT FIX** - These failures existed before your changes
- **Report to user** - Alert the user about these pre-existing failures:
  ```
   Found pre-existing test failures unrelated to new changes:
  - TestClassName.TestMethodName
  - (Brief description of failure)
  
  These failures are not caused by the new implementation and should be investigated separately.
  ```
- Continue with your work - Don't let unrelated failures block progress

### How to Determine Relatedness
- Check if the failing test exercises code you modified
- Check if the test references new classes, methods, or enums you added
- If unsure, ask the user: "Test X is failing. Should I fix it or is this a pre-existing issue?"

---

## Success Criteria

 All test methods follow naming: `MethodName_Scenario_ExpectedResult`
 All public methods have tests
 Success paths tested
 Error paths tested  
 Edge cases covered (null, empty, invalid)
 Mocks used appropriately
 Helper methods for test data creation
 **TestCase added to `OhipEventFetcherTests.cs` (if new event type added)**
 **Test section added to `OhipEventMessageTypeFilterTests.cs` (if new event type added)**
 All tests pass
 Coverage  80%

---

## Notes

- Tests are NOT tied to phases - generate for any component at any time
- User specifies which components to test
- Add TODO comments where developer must customize based on actual implementation
