# Validation Checklist

This instruction guides the agent to perform comprehensive validation of OHIP implementation.

## Overview

Validation can be run at any time to verify implementation completeness and quality. User specifies what to validate.

## Validation Scope

User can request validation for:
- **Phase 1 Only:** Event type registration + handler + API integration (if applicable)
- **Phase 2 Only:** DTO mapping components
- **Complete:** Both phases
- **Specific Component:** Individual files/classes

---

## Phase 1 Validation

### Files Checklist

**Core Configuration:**
- [ ] `OhipActionType.cs` - Enum value added
- [ ] `OhipConstants.cs` - Action constant added (format: `{ActionName}Action`)
- [ ] `OhipConstants.cs` - Event constants added (one per event, format: `{EventName}Event`)
- [ ] `OhipActionTypeParser.cs` - Parser mapping added to dictionary
- [ ] `OhipEventMessageTypeFilter.cs` - Event mapping added to dictionary
- [ ] `OhipEventFetcherFactory.cs` - Supported type added to HashSet

**Event Handler:**
- [ ] `BusinessEventHandlerFactory.cs` - Handler registered in dictionary
- [ ] `EventHandlers\{ActionName}EventHandler.cs` - Class created
- [ ] `IOhipRequestBuilder.cs` - Interface method added
- [ ] `OhipRequestBuilder.cs` - Method implemented
- [ ] `InterfaceBusiness\Ohip\ApiModels\{RequestModel}.cs` - Request model created (if API integration required)

**API Integration (if `api_integration.required: true`):**
- [ ] `DumboBrokerService\Broker\Ohip{ActionName}RequestDispatcher.cs` - Created
- [ ] `DumboBrokerService\ResponseHandlers\Ohip\Ohip{ActionName}ResponseHandler.cs` - Created
- [ ] `CommunicationUtilityWebSvcHost\Spring\MessageBrokerConfiguration.cs` - Dispatcher registered in `RequestDispatcherFactory()`
- [ ] `CommunicationUtilityWebSvcHost\Spring\MessageBrokerConfiguration.cs` - Response handler registered in `GetResponseHandlers()`
- [ ] `DumboBrokerService\Bootstrapping\Bootstrapper.Outbound.RequestDispatchers.cs` - Dispatcher registered
- [ ] `DumboBrokerService\Bootstrapping\Bootstrapper.Outbound.ResponseHandlers.cs` - Response handler registered

**Tests:**
- [ ] `PropertyConnect.Tests.Unit\Ohip\EventHandlers\{ActionName}EventHandlerTests.cs` - Created
- [ ] `PropertyConnect.Tests.Unit\Ohip\RequestBuilders\OhipRequestBuilder{ActionName}Tests.cs` - Created

### Code Quality Checks

**Naming Conventions:**
- [ ] Enum value is PascalCase (matches `action.name`)
- [ ] Action constant follows pattern: `{ActionName}Action = "{ActionName}"`
- [ ] Event constants follow pattern: `{EventName}Event = "EVENT NAME"`
- [ ] Class names follow pattern: `{ActionName}EventHandler`, `Ohip{ActionName}RequestDispatcher`

**Constants Usage:**
- [ ] No hardcoded event names in code (use constants from `OhipConstants`)
- [ ] List parameters use `IReadOnlyList<string>` pattern in `OhipConstants`
- [ ] Request builder references constants via `OhipConstants.{ConstantName}`

**Logging Standards:**
- [ ] All log messages include `CorrelationId`
- [ ] Log messages use `.ToKvp()` for structured fields
- [ ] Component name included in log messages
- [ ] Error logs include exception details

**Error Handling:**
- [ ] Null checks for all parameters
- [ ] Try-catch blocks in critical methods
- [ ] Meaningful error messages
- [ ] Errors logged before throwing/returning

**XML Documentation:**
- [ ] All public classes have `<summary>` tags
- [ ] All public methods have `<summary>` tags
- [ ] Parameter descriptions included where non-obvious

**C# Best Practices:**
- [ ] Classes are `sealed`
- [ ] Switch expressions used (not statements)
- [ ] LINQ extension methods used (not keywords)
- [ ] Null propagation/coalescing used
- [ ] Object initializers used
- [ ] Proper `using` statements/declarations

### Build Verification

```powershell
# InterfaceBusinessOHIP
dotnet build "Synxis\Application\Interfaces\InterfaceBusiness.OHIP\InterfaceBusinessOHIP\InterfaceBusinessOHIP.csproj"

# DumboBrokerService (if API integration)
dotnet build "Synxis\Application\Ari\DumboBrokerService\DumboBrokerService.csproj"

# CMU (if API integration)
dotnet build "SHS\EnterpriseServices\ServiceHosts\CommunicationUtilityWebSvcHost\CommunicationUtilityWebSvcHost.csproj"
```

**Expected Results:**
- [ ] All builds succeed with 0 errors
- [ ] No warnings related to new code
- [ ] No ReSharper/analyzer warnings

### Test Verification

```powershell
# Run all new tests
dotnet test "Synxis\Application\Integration\PropertyConnect.Tests.Unit\PropertyConnect.Tests.Unit.csproj" --filter "FullyQualifiedName~{ActionName}"
```

**Expected Results:**
- [ ] All tests pass
- [ ] Coverage  80% for new code
- [ ] No skipped tests

---

## Phase 2 Validation

### Files Checklist

**DTO Components:**
- [ ] `InterfaceDto\{OxiDtoClass}.cs` - DTO class exists
- [ ] `InterfaceBusinessOHIP\Dto\{ActionName}\{AssemblerClassName}.cs` - Assembler + Handler file created
- [ ] `OhipDtoRequestHandlerFactory.cs` - Handler registered in `GetHandler()` method
- [ ] `OhipDtoRequestHandlerFactory.cs` - Handler initialized in `InitializeHandlers()` method

**Tests:**
- [ ] `PropertyConnect.Tests.Unit\Ohip\DtoAssemblers\{ActionName}DtoAssemblerTests.cs` - Created
- [ ] `PropertyConnect.Tests.Unit\Ohip\DtoHandlers\{ActionName}DtoHandlerTests.cs` - Created

### Code Quality Checks

**DTO Structure:**
- [ ] DTO class is `sealed`
- [ ] Properties have proper types
- [ ] XML documentation present
- [ ] Appropriate attributes (e.g., `[JsonProperty]`) if needed

**Assembler:**
- [ ] Returns `{OxiDtoClass}` type from input
- [ ] Null checks implemented
- [ ] Error handling with try-catch
- [ ] TODO comments for manual field mappings (if skeleton only)
- [ ] Helper methods for nested mappings

**Handler:**
- [ ] Singleton pattern implemented (`Instance` property)
- [ ] Constructor validates parameters
- [ ] Pub/Sub topic name matches input (`dto_mapping.pubsub_topic`)
- [ ] Correlation ID propagated to Pub/Sub message
- [ ] Error handling implemented

**Logging:**
- [ ] Assembler logs errors with correlation ID
- [ ] Handler logs success/failure
- [ ] Structured logging with `.ToKvp()`

### Build & Test Verification

```powershell
# Build
dotnet build "Synxis\Application\Interfaces\InterfaceBusiness.OHIP\InterfaceBusinessOHIP\InterfaceBusinessOHIP.csproj"

# Test
dotnet test "Synxis\Application\Integration\PropertyConnect.Tests.Unit\PropertyConnect.Tests.Unit.csproj" --filter "FullyQualifiedName~{ActionName}Dto"
```

**Expected Results:**
- [ ] Build succeeds
- [ ] All DTO tests pass
- [ ] Coverage  80%

---

## Complete Validation Report

Agent should generate a report with:

### Summary
```
Action Type: {ActionName}
Validation Scope: {Phase 1 / Phase 2 / Complete}
Validation Date: {Date}
Overall Status: {PASS / FAIL / WARNING}
```

### Results by Category

**Files Created: X / Y**
- List missing files (if any)

**Code Quality: X / Y checks passed**
- List failing checks (if any)

**Builds: X / Y succeeded**
- List build errors (if any)

**Tests: X / Y passed**
- List failing tests (if any)
- Coverage: X%

### Issues Found

For each issue:
- **Severity:** Critical / Warning / Info
- **Category:** Files / Code Quality / Build / Tests
- **Description:** What's wrong
- **Location:** File and line number (if applicable)
- **Fix:** Suggested remediation

### Recommendations

- Suggestions for improvement
- Optional enhancements
- Performance considerations

---

## Validation Commands for Agent

**Check if file exists:**
```powershell
Test-Path "path\to\file.cs"
```

**Search for pattern in file:**
```powershell
Select-String -Path "path\to\file.cs" -Pattern "PatternToFind"
```

**Count occurrences:**
```powershell
(Select-String -Path "path\to\file.cs" -Pattern "PatternToFind").Count
```

**Run build and capture errors:**
```powershell
dotnet build "path\to\project.csproj" 2>&1
```

**Run tests with filter:**
```powershell
dotnet test "path\to\test.csproj" --filter "FullyQualifiedName~{ActionName}" --logger "console;verbosity=detailed"
```

---

## Success Criteria

 All required files exist
 All code quality checks pass
 All builds succeed
 **Unit tests generated and pass with 80% coverage**
 No critical issues found
 Validation report generated

 **If any critical issues found:** Implementation is NOT complete
