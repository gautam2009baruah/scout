---
name: OHIP Action Registry
description: Registry of known OHIP action types in SynXis PropertyConnect, their event names, and implementation status
tags: [ohip, action-type, registry, OhipActionType]
category: domain-skill
priority: 2
---

# OHIP Action Type Registry

All entries correspond to values in `InterfaceBusinessOHIP\BusinessEvents\OhipActionType.cs`.

---

## Registered Action Types

| Action Type | Event Names (OhipConstants) | API Integration | DTO Mapping | Status |
|---|---|---|---|---|
| `SummaryTotals` |  |  |  | Implemented |
| `InventoryControl` |  |  |  | Implemented |
| `StayRestrictions` |  |  |  | Implemented |
| `RatePlan` |  |  |  | Implemented |
| `RatePlanDetails` |  |  |  | Implemented |
| `Blocks` |  |  |  | Implemented |
| `Profiles` |  | Required | Required | Implemented |
| `Hurdles` | `NEW HURDLE`, `UPDATE HURDLE`, `DELETE HURDLE` | Required | Required | Example/Reference |

> **Note:** Event names, API endpoints, and DTO details for each action type should be confirmed from the codebase (`OhipConstants.cs`, `OhipActionTypeParser.cs`)  this registry is a reference baseline.

---

## Implementation Checklist (per action type)

### Phase 1  Core + Handler + API
- [ ] `OhipActionType.cs`  enum value added
- [ ] `OhipConstants.cs`  action constant + event constants
- [ ] `OhipActionTypeParser.cs`  parser mapping
- [ ] `OhipEventMessageTypeFilter.cs`  event mapping
- [ ] `OhipEventFetcherFactory.cs`  supported type
- [ ] `BusinessEventHandlerFactory.cs`  handler registered
- [ ] `{ActionName}EventHandler.cs`  created
- [ ] `IOhipRequestBuilder.cs` + `OhipRequestBuilder.cs`  method added
- [ ] DumboBroker dispatcher + response handler (if `api_integration.required: true`)
- [ ] CMU Spring `MessageBrokerConfiguration.cs`  wired

### Phase 2  DTO (skeleton only)
- [ ] `{AssemblerClassName}.cs`  assembler skeleton (`NotImplementedException`)
- [ ] `{HandlerClassName}.cs`  handler (infrastructure, fully implemented)
- [ ] `OhipDtoRequestHandlerFactory.cs`  handler registered
- [ ] `InterfaceRequestType.cs`  enum entry added

### Phase 3  Tests + Validate
- [ ] `{ActionName}EventHandlerTests.cs`
- [ ] `OhipRequestBuilder{ActionName}Tests.cs`
- [ ] Validation checklist passed (`codenova, ohip validate`)
