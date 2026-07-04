# SynXis Solution File Map

**Source:** Synxis VS solutions plus deep mapping context
**Repository root variable:** `{rootDirectory}` = `C:\Dev\git\projectx` (local dev), `C:\Dev\synxis\shs_synxis.projectx` (this workspace)

Use this file only when the question is about solution files, namespaces, build orchestration, source-root layout, or where downstream search should start.

---

## Fast Resolver

| Question Type | Answer From |
|---|---|
| "Which solution owns PRC or CHC?" | Main Solution Files |
| "Where should semantic or grep search start?" | Source Root Layout + Indexed Paths |
| "Which namespace pattern should I expect?" | Namespace Conventions |
| "Which Cake or Jenkins pipeline owns this domain?" | Per-Domain Build Configuration |

## Domain To Solution Map

| Domain | Primary Solution | Why It Matters |
|---|---|---|
| HSS | `SHS.Services.All.sln` | Main enterprise services solution |
| CHC | `Synxis_Interface.sln` | Channel/integration entry solution for CHC surfaces |
| ARI | `Ari_Dependencies.sln` | ARI/Dumbo services and dependencies |
| UI | `Synxis_Web_HMS_2013.sln` | ControlCenter, Cockpit, and UI surfaces |
| SV | `Synxis_Services.sln` | Legacy Windows service solution |
| GD | `Synxis_Gds.sln` | GDS direct-connect services |
| PRC | `Synxis_Interface_All.sln` | Property Connect integration solution |

## Search Expansion Hints

When nomenclature resolution feeds downstream code search:

- app ID -> expand to app ID + application name + domain path + solution name
- alias -> expand to alias + canonical app ID + full service name
- domain -> expand to domain ID + full domain name + primary solution + source root area

Example:

- `Frontman` -> `HSS-API Frontman HSS SHS.Services.All.sln SHS/EnterpriseServices`
- `PRC-OES` -> `PRC-OES OhipEventsSubscriberService Synxis_Interface_All.sln Synxis/Application/Integration`

---

## Main Solution Files

| Solution File | Domain | Path |
|---|---|---|
| `SHS.Services.All.sln` | HSS | `{rootDirectory}\SHS\EnterpriseServices\SHS.Services.All.sln` |
| `Synxis_Interface.sln` | CHC + PRC | `{rootDirectory}\Synxis\Application\Interfaces\Synxis_Interface.sln` |
| `Ari_Dependencies.sln` | ARI | `{rootDirectory}\Synxis\Application\Ari\Ari_Dependencies.sln` |
| `Synxis_Web_HMS_2013.sln` | UI | `{rootDirectory}\Synxis\Application\Web\Synxis_Web_HMS_2013.sln` |
| `Synxis_Services.sln` | SV | `{rootDirectory}\Synxis\Application\Services\Synxis_Services.sln` |
| `Synxis_Gds.sln` | GD | `{rootDirectory}\Synxis\Application\GDS\Synxis_Gds.sln` |
| `Synxis_Interface_All.sln` | PRC | `{rootDirectory}\Synxis\Application\Integration\Synxis_Interface_All.sln` |

---

## Source Root Layout

```
{rootDirectory}
     SHS/                         HSS Enterprise Services root
        EnterpriseServices/      Service implementations + solution
           SHS.Services.All.sln
           Services/            Service projects (one per manager)
           ServiceHosts/        WCF host projects (WebSvcHost per service)
        Platform/                Platform libraries (ServiceFx, Cache, etc.)
        Utilities/               Shared utilities (ServiceModelEx, Common.Packages)
    
     Synxis/
        Application/
           Interfaces/          CHC + channel connect projects
           Integration/         PRC integration projects
           Ari/                 ARI / Dumbo projects
           Web/                 UI (Control Center, Cockpit) projects
           Services/            SV legacy Windows service projects
           GDS/                 GD GDS integration projects
        Enterprise/              Shared enterprise libraries
           Synxis.Enterprise.Business
           Synxis.Enterprise.Logging
        Platform/                Cross-cutting platform libraries
            Synxis.Platform.Cache
            Synxis.Platform.ServiceFx (bindings, contracts)
    
     Configuration/
         ApplicationConfigTemplates/   Per-app configuration templates
         ReleaseManagement/
            GCP/                      GCP deployment configs
            Resources/CChelpfiles/    Control Center help files
         Schema/                       XML/JSON schemas
```

---

## Namespace Conventions

| Pattern | Description | Example |
|---|---|---|
| `SHS.Services.<Name>` | HSS service business logic project | `SHS.Services.LookupManager` |
| `SHS.Services.Common` | HSS shared service utilities |  |
| `SHS.Contracts.<Name>` | WCF contracts/interfaces | `SHS.Contracts.LookupManager` |
| `SHS.Platform.ServiceFx` | HSS service framework | `SHS.Platform.ServiceFx.Bindings` |
| `SHS.Common.Packages` | Shared NuGet package definitions |  |
| `Synxis.Enterprise.<Area>` | Enterprise cross-cutting libraries | `Synxis.Enterprise.Business`, `Synxis.Enterprise.Logging` |
| `Synxis.Platform.<Area>` | Platform-level libraries | `Synxis.Platform.Cache` |
| `Ari.<Name>` | ARI/Dumbo libraries | `Ari.ShoppingLibrary` |
| `GCPCommon` | GCP shared utilities | `{rootDirectory}\Synxis\Application\Utilities\GCPCommon` |

---

## Layer Architecture per HSS Service

Each HSS service follows a 3-layer dependency stack:

```
Libraries Layer           Platform libs, domain-shared; no service-specific logic
    
SFx / Contracts Layer     WCF service contracts, service framework bindings
    
ServiceHosts Layer        WCF host process (WebSvcHost); entry point for deployment
```

---

## Key Configuration Files

| File | Location | Purpose |
|---|---|---|
| `Synxis VS solutions` | `.github/instructions/isf/synxisnomskill/` (ISF copy) | Machine-readable app code map consumed by CodeNova |
| `synxis-codemapping.schema.json` | `schemas/` | JSON Schema validating the code mapping |
| `NuGet.Config` | `{rootDirectory}/` | NuGet feed configuration |
| `Directory.Build.props` | `{rootDirectory}/` | MSBuild global properties |
| `hss_consolidated.jenkinsfile` | CI/CD | HSS publish tier Jenkins pipeline |
| `Cortex.jenkinsfile` | CI/CD | CodeMapping generation/validation pipeline |

---

## Per-Domain Build Configuration

| Domain | Solution File | Cake Script | Jenkinsfile | Publish Task |
|---|---|---|---|---|
| HSS | `SHS.Services.All.sln` | `hss.cake` | `hss_consolidated.jenkinsfile` | `Publish-HSS-All` |
| CHC | `Synxis_Interface.sln` | `crs.cake` | `crs.jenkinsfile` | `Publish-ChannelConnect` |
| ARI | `Ari_Dependencies.sln` | `crs.cake` | `crs.jenkinsfile` | `Publish-Dumbo, Publish-DumboMessageBuilder` |
| UI | `Synxis_Web_HMS_2013.sln` | `crs.cake` | `crs.jenkinsfile` | `Publish-ControlCenter, Publish-Cockpit, Publish-BulkValidationApi, Publish-WlbHealthCheck` |
| SV | `Synxis_Services.sln` | `crs.cake` | `crs.jenkinsfile` | `Publish-CrsMiscServices` |
| GD | `Synxis_Gds.sln` | `crs.cake` | `crs.jenkinsfile` | `Publish-GDS` |
| PRC | `Synxis_Interface_All.sln` | `crs.cake` | `crs.jenkinsfile` | `Publish-PropertyConnect` |

> Cake script full paths: HSS uses `{rootDirectory}\Configuration\ReleaseManagement\GCP\hss\hss.cake`; all other domains use `{rootDirectory}\Configuration\ReleaseManagement\GCP\crs.cake`.

---

## CI/CD Integration

The `Synxis VS solutions` is automatically regenerated by the Jenkins pipeline:

1. **Generate**  Parses the projectx repository structure using configured indexed paths
2. **Validate**  Checks output against `schemas/synxis-codemapping.schema.json`
3. **Publish**  Updates the artifact at `Synxis VS solutions`

Pipeline: `Cortex.jenkinsfile`  
Artifact schema: `schemas/synxis-codemapping.schema.json`

---

## Indexed Paths (from mapping metadata)

| Key | Path |
|---|---|
| `projectxRoot` | `{rootDirectory}` |
| `ccHelpFiles` | `{rootDirectory}\Configuration\ReleaseManagement\Resources\CChelpfiles` |
| `configTemplates` | `{rootDirectory}\Configuration\ApplicationConfigTemplates` |
| `releaseManagement` | `{rootDirectory}\Configuration\ReleaseManagement\GCP` |
