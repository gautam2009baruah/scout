---
description: "SynxisNom Skill technical intelligence  architecture, dispatch mechanics, token model, asset map, and limitations. Loaded by ISF when authoring or reviewing synxisnomskill assets."
applyTo: ".github/instructions/isf/**"
---

# SynxisNom Skill  Technical Intelligence

**Skill:** `synxisnom-skill`  
**Folder:** `.github/instructions/isf/synxisnomskill/`  
**Version:** 1.0.0 | **Adopted:** April 3, 2026 | **Updated:** April 3, 2026  
**Source:** `Synxis VS solutions` v1.1.0

---

## 1. Purpose

The SynxisNom skill provides **fast, no-crawl answers** to questions about SynXis application naming conventions: domain IDs, application codes, service types, solution file locations, namespace patterns, and tech stack composition.

Without this skill, every "what is HSS-LKM" or "which solution is ARI in" query would trigger a workspace search  consuming 5,00015,000 tokens by crawling `.sln`, `.csproj`, and `.xml` files. This skill compresses that knowledge into 3 indexed assets that load on demand for 2,500 tokens total.

---

## 2. Skill Architecture

```
User message (nom intent)
    
     codenova.task.run("synxisnom-skill", subject)
          
           BRIDGE 0: STM lookup  check codenova.bridge for acronym expansion
             CONFIRMED?  answer from STM (0 extra tokens)  skill not needed
             INFERRED / UNKNOWN?  continue
          
           Bridge 1: Skill dispatch  load ONE asset from synxisnom.skillindex
                Domain overview / app count / tech stack  nom-overview
                Specific app ID lookup (e.g. HSS-LKM, PRC-OXI)  nom-appid
                Solution file / namespace / path question  nom-solutions
```

---

## 3. Asset Map

| Asset | Intent Tag | Token Estimate | When to Load |
|---|---|---|---|
| `SYNXIS_NOMENCLATURE_OVERVIEW.md` | `nom-overview` | 600 tokens | Domain summaries, app counts, tech stack, naming convention explanation |
| `SYNXIS_APP_ID_REGISTRY.md` | `nom-appid` | 1,800 tokens | Specific app ID  name  type lookup; "what does HSS-API do?"; "which apps are in SV domain?" |
| `SYNXIS_SOLUTION_FILE_MAP.md` | `nom-solutions` | 700 tokens | Solution file locations, namespace patterns, source root layout, CI/CD pipeline |

**Default load for ambiguous NOM question:** `nom-overview` first. Escalate to `nom-appid` only if a specific app ID is mentioned.

---

## 4. Dispatch Protocol

### Path A  Domain / Overview Question
> "What domains does SynXis have?" / "How many apps are in PRC?" / "What tech stack does SynXis use?"

1. Check STM for acronym expansion (BRIDGE 0)
2. Load `nom-overview` only
3. Answer directly  do not load appid or solutions

### Path B  Application ID Lookup
> "What is HSS-LKM?" / "What service type is ARI-DMB?" / "Which app is the Frontman?"

1. Check STM for entry (BRIDGE 0)
2. STM has high-level definition?  supplement from `nom-appid` for full details
3. Load `nom-appid` only  do not load overview or solutions unless asked

### Path C  Solution / Path / Namespace Question
> "Which solution contains ARI services?" / "What namespace does the ProfileManager use?" / "Where is the GCP config?"

1. Load `nom-solutions` only
2. Do not load `nom-appid` or `nom-overview` unless asked

### Path D  Combined / All-Topics Question
> "Give me a full breakdown of the HSS domain" / "Explain the solution structure and list all UI apps"

1. Load `nom-overview` first
2. Load `nom-appid` or `nom-solutions` as needed based on which aspect the user asked about
3. Still prefer loading both over loading all three unless all three topics are explicitly asked

---

## 5. Intent Trigger Table

| Category | Trigger Words / Phrases |
|---|---|
| **Direct** | app code, app id, application id, application code, nom, nomenclature, app name, service code |
| **Domain identity** | HSS, PRC, SV, UI, GD, CHC, ARI, what domain, which domain, domain breakdown |
| **App lookup** | what is HSS-*, what is PRC-*, what is ARI-*, what is CHC-*, what is SV-*, what is GD-*, what is UI-* |
| **Solution / path** | solution file, which solution, solution contains, where is the source, namespace, project path |
| **Tech stack** | tech stack, frameworks, programming languages, build tools, infrastructure used |
| **Naming convention** | naming convention, how are apps named, app id format, domain prefix |

---

## 6. STM Relationship

The STM (`codenova.bridge`) already contains high-level acronym expansions for `HSS`, `ARI`, `CHC`, `PRC`, `GDS`, etc. with brief one-line definitions.

**Division of responsibility:**

| Source | Contains | Use for |
|---|---|---|
| STM | 1-row acronym expansion per domain (e.g., `HSS  Hospitality Service Suite  Enterprise WCF/.NET services layer`) | Quick acronym lookup  BRIDGE 0 fast path |
| `nom-overview` | Domain summaries with app counts, tech stack, architectural description | "Tell me more about HSS", "how many apps are in PRC?" |
| `nom-appid` | All 121 app IDs with names, type, and description | Specific app code lookup |
| `nom-solutions` | Solution file paths, namespace patterns, source root layout | Developer navigation  "which .sln?" |

**Do NOT duplicate STM content into nom skill assets.** The skill complements the STM; it does not replace it.

---

## 7. Token Model

| Operation | Tokens Consumed |
|---|---|
| STM already in context (BRIDGE 0 check) | 0 (already loaded) |
| Load `nom-overview` only | 600 |
| Load `nom-appid` only | 1,800 |
| Load `nom-solutions` only | 700 |
| Load overview + appid | 2,400 |
| Load all three assets | 3,100 |
| Without skill  raw workspace search | 5,00015,000 |

---

## 8. Source Data

This skill was generated from `Synxis VS solutions` maintained in the StayCortex Intelligence Service:

**Source path:** `Synxis VS solutions`  
**Schema:** `schemas/synxis-codemapping.schema.json`  
**CI/CD generation pipeline:** `Cortex.jenkinsfile`  auto-generates + validates on pushes to projectx

When the CI/CD pipeline regenerates `Synxis VS solutions`, the ISF skill assets should be refreshed using `codenova, refresh nom skill`.

---

## 9. Limitations

| Limitation | Detail |
|---|---|
| **No live code cross-reference** | The skill assets are point-in-time snapshots; new apps added after the last generation will not appear |
| **No deep dependency mapping** | The full `dependencyMapping` layers in the JSON are not indexed  only app IDs, names, and types |
| **No auto-refresh Layer 3** | Unlike the Tax skill, there is no FileSystemWatcher or Git hook for SynxisNom  manual refresh required |
| **Library components** | 5 entries (ARI-DumboFramework, ARI-ShoppingLib, ARI-ThrottlingLib, Expedia-MsgBuildingLib, DataAccess-PubSubLib) are libraries, not deployable services |
| **SV-SCM cross-domain** | SabreConnectionManagerService (SV-SCM) is listed in the SV domain in the mapping but deployed with GD |

---

## 10. Refresh Command

```
codenova, refresh nom skill
```

When executed, CodeNova should:
1. Re-read `Synxis VS solutions` from its source path
2. Compare app IDs in the JSON against `SYNXIS_APP_ID_REGISTRY.md`
3. Report new, removed, or changed entries
4. Optionally update the skill assets with confirmed changes
