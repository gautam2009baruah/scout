# SynxisNom Conditional Loading Rules

## Rule Set

- If input contains an exact app code pattern like `HSS-`, `ARI-`, `PRC-`, `SV-`, `UI-`, `GD-`, `CHC-`, load `SYNXIS_SERVICE_DISCOVERY_DICTIONARY.md` first, then `SYNXIS_APP_ID_REGISTRY.md` only if the user wants inventory or comparison.
- If input contains a known alias or short service name like `Frontman`, `ControlCenter`, `Cockpit`, `Dumbo`, `DumboBroker`, `OXI`, `ICE`, `OES`, `Sabre DCX`, `Ctrip`, load `SYNXIS_SERVICE_DISCOVERY_DICTIONARY.md`.
- If input asks for service tier, service type, or service description, load `SYNXIS_SERVICE_DISCOVERY_DICTIONARY.md`.
- If input contains solution/path keywords, load `SYNXIS_SOLUTION_FILE_MAP.md`.
- If input contains domain or naming-format keywords, load `SYNXIS_NOMENCLATURE_OVERVIEW.md`.
- If input asks for multiple concerns, load discovery dictionary first, then one additional matching file.
- If input asks for full breakdown, load in this order: discovery dictionary -> overview -> app registry -> solution map.

## Precision Guards

- Do not load the full app registry for a single alias or single service-description question.
- Do not load solution map for pure app-definition or tier-definition lookups.
- For compound requests that feed `impact`, `deep-discover`, or `archon`, prefer the discovery dictionary first so canonical IDs and expansion terms are available before search.
