---
name: OHIP Domain Overview
description: Compact domain context for OHIP  Oracle Hospitality Integration Platform in SynXis PropertyConnect
tags: [ohip, oracle, hospitality, propertyconnect, integration, DumboBroker, CMU]
category: domain-skill
priority: 1
---

# OHIP Domain Overview
## SynXis PropertyConnect  Oracle Hospitality Integration Platform

---

## What is OHIP

OHIP (Oracle Hospitality Integration Platform) is Oracle's modern REST-based PMS integration protocol. It replaces OXI (OPERA eXchange Interface) for newer Oracle PMS deployments. In SynXis, OHIP is implemented inside the **PropertyConnect** subsystem to handle inbound business events from a PMS and translate them into reservation/inventory/rate actions.

---

## Architecture Position

```
Oracle PMS (OHIP events)
    
PropertyConnect  InterfaceBusinessOHIP
     BusinessEventHandlerFactory   (routes event  handler)
     {ActionName}EventHandler      (handles specific event type)
     OhipRequestBuilder            (builds API request)
     DumboBrokerService            (dispatches to OHIP REST API)
            
    OHIP REST API (Oracle Hospitality Cloud)
            
    DtoAssembler  OXI DTO  Pub/Sub Queue  SynXis CR
```

---

## Key Components

| Component | Namespace / Project | Role |
|---|---|---|
| `InterfaceBusinessOHIP` | `Synxis.Application.InterfaceBusinessOHIP` | Core event handling, enums, constants, handlers, filters |
| `DumboBrokerService` | `Synxis.Application.DumboBrokerService` | Dispatches HTTP requests to OHIP REST API |
| `CMU` | `CommunicationUtilityWebSvcHost` | Message broker configuration and Spring wiring |
| `OhipActionType` | `BusinessEvents\OhipActionType.cs` | Enum of all registered OHIP action types |
| `OhipConstants` | `Common\OhipConstants.cs` | Action and event name constants |
| `BusinessEventHandlerFactory` | `BusinessEvents\EventHandlers\` | Factory mapping event  handler |
| `OhipRequestBuilder` | `BusinessEvents\RequestBuilder\` | Builds typed API request objects |
| `DtoAssembler` | `BusinessEvents\DtoAdapters\` | Transforms OHIP response to OXI DTO (skeleton only) |

---

## Implementation Modes

Each new OHIP action type is implemented in sequential phases:

| Mode | What it does |
|---|---|
| `neweventtype` | Registers enums, constants, parser mappings, event filters |
| `eventhandler` | Creates `{ActionName}EventHandler.cs` + request builder methods |
| `apiintegration` | Creates DumboBroker dispatcher + response handler + Spring wiring |
| `dtomapping` | Creates DTO assembler skeleton + handler (infrastructure only, no business logic) |
| `tests` | Generates unit tests with 80% coverage |
| `validate` | Validates completeness against a checklist |
| `endtoend` | Executes all modes in sequence |
| `preflight` | Validates input YAML only, no code generation |

---

## Input Template

Implementation requires a filled YAML input file. Fields:
- `action.name`  PascalCase (e.g. `Hurdles`)
- `action.events[]`  UPPERCASE WITH SPACES (e.g. `NEW HURDLE`)
- `consolidation.*`, `api.*`, `routing.*`, `dto_mapping.*`, `sample_payload`

Template: `.github/instructions/isf/ohipskill/ohip-action-input.yaml`

---

## Related STM Terms

- `OHIP`  Oracle Hospitality Integration Platform (PMS integration, modern OXI replacement)
- `OXI`  Legacy Oracle PMS integration protocol
- `PRC` / `PropertyConnect`  Parent subsystem containing OHIP integration
- `DumboBroker`  Service dispatching HTTP calls to external OHIP APIs
