# SynXis Nomenclature Overview

**Scope:** SynXis CRS ProjectX (`shs_synxis.projectx`)
**Primary source:** `HS_ProjectX_CodeMapping.json`
**Summary:** 7 domains, 121 mapped applications, 7 main solution files.

Use this file for fast domain-level orientation. Use `SYNXIS_SERVICE_DISCOVERY_DICTIONARY.md` for acronym-heavy lookup and `SYNXIS_APP_ID_REGISTRY.md` for exhaustive app-level lookup.

---

## What This Skill Should Answer Quickly

1. What domain owns a service or acronym?
2. What does a domain or tier label mean?
3. Is a term an app ID, an alias, a protocol endpoint, or a solution/build concern?
4. Which solution or repo area should downstream search inspect?
5. What expansion terms should downstream semantic or grep search use?

## Domain Model

Every canonical app ID follows `{DOMAIN}-{CODE}`.

| Domain | Full Name | Tier Label | Authoritative Count | Direct Description | Primary Solution |
|---|---|---|---:|---|---|
| HSS | Hospitality Services Stack | HSS (Enterprise Services) | 19 | Enterprise manager services, utilities, and Frontman entry surfaces | `SHS.Services.All.sln` |
| PRC | Property Connect | IT (Integration/Property Connect) | 37 | PMS/property integrations, protocol endpoints, and async integration workers | `Synxis_Interface_All.sln` |
| SV | Legacy Services | SV (Services) | 21 | Background Windows services for scheduled or async CRS business processes | `Synxis_Services.sln` |
| UI | User Interface | UI (User Interface) | 7 | Admin/operator web applications and UI service edges | `Synxis_Web_HMS_2013.sln` |
| GD | Global Distribution System | GD (GDS) | 10 | Sabre, Amadeus, and Travelport GDS services and socket workers | `Synxis_Gds.sln` |
| CHC | Channel Connect | CH (Channel Connect) | 7 | OTA/channel partner connectors and feed services | `Synxis_Interface.sln` |
| ARI | Availability, Rates, Inventory | DM (Dumbo/ARI) | 10 | Dumbo broker, shopping, notifications, and ARI shared components | `Ari_Dependencies.sln` |

## Count Reconciliation Note

The deep mapping summary is the authoritative source for direct domain counts.
The expanded app registry intentionally includes deployable variants, supporting libraries, and lookup entries that are useful for user-facing discovery, so some domain sections in the registry are broader than the summary count.

## Domain Descriptions

### HSS
- Enterprise services tier for manager-style business capabilities.
- Common terms: Frontman, LookupManager, ProductManager, ProfileManager, KeyServer.
- Typical runtime: Web Service Host.

### PRC
- Property and PMS integration tier.
- Common terms: OXI, OES, ICE, OTA2010, Property Connect, InterfaceMessageRouter.
- Typical runtimes: Web Application and Windows Service.

### SV
- Legacy background-processing tier.
- Common terms: PaymentStatusService, RollingInventory, Faxer, Superset.
- Typical runtime: Windows Service.

### UI
- Admin/operator-facing UI tier.
- Common terms: ControlCenter, Cockpit, HES, BulkValidationApi.
- Typical runtime: Web Application.

### GD
- GDS integration tier.
- Common terms: Sabre DCX, Travelport DCX, Amadeus DCX, GDS sockets.
- Typical runtimes: WCF Web Service and Windows Service.

### CHC
- OTA/channel integration tier.
- Common terms: ChannelConnect, Expedia, Ctrip, Google Local Feed.
- Typical runtimes: Web Service, Linux Service, Windows Service.

### ARI
- Availability, rates, inventory, and Dumbo pipeline tier.
- Common terms: Dumbo, AriShopping, NotificationManager, MessageBuilder.
- Typical runtimes: Windows Service, Web Service Host, .NET Core service, shared library.

## ARI Flow Reference

```text
ARI Scheduler -> ARI-NTM -> ARI-DMBB -> ARI-AS2 / ARI-CMU -> ARI-DMB -> channels
```

Use this when the user mentions Dumbo, ARI shopping, or notification flows.

## Service Tier Meanings

| Tier | Direct Meaning |
|---|---|
| Web Service Host | Hosted business service endpoint, commonly HSS/ARI manager logic |
| Web Application | UI or protocol-facing site/application |
| Windows Service | Background worker or async processor |
| Web Service | HTTP, SOAP, or WCF endpoint |
| Web API | REST-style API surface |
| Linux Service | .NET Core service deployed on Linux |
| Library/Framework | Shared non-deployed reusable code |

## Routing Guidance

- User asks about domain meaning, tier labels, app-counts, or architecture hierarchy -> stay in this overview.
- User asks about a specific app ID, alias, or service description -> load `SYNXIS_SERVICE_DISCOVERY_DICTIONARY.md` first.
- User asks for exhaustive per-domain app inventory -> load `SYNXIS_APP_ID_REGISTRY.md`.
- User asks for `.sln`, namespace, build, Jenkins, Cake, or path questions -> load `SYNXIS_SOLUTION_FILE_MAP.md`.

## Downstream Use For Compound Workflows

When synxisnom feeds `impact`, `deep-discover`, or `archon`, pass forward:

- canonical app IDs
- expanded service names
- owning domains and tier labels
- likely solution files
- search expansion terms
