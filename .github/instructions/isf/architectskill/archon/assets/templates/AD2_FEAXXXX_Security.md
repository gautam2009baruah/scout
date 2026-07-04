# Security — FEAXXXX <Feature Name>

← Back to Index: [AD2_FEAXXXX_Index.md](AD2_FEAXXXX_Index.md)

## Authentication & Authorization Model

<!-- Describe how the feature authenticates requests and enforces authorization.
     e.g., JWT bearer tokens issued by JavaSecurityService, scoped to specific operations. -->

## PCI / Regulatory Scope

<!-- Is this feature in PCI scope? If yes, describe what card data is touched and how.
     Reference any applicable compliance standards (PCI-DSS, GDPR, etc.) -->

| Item | In Scope? | Notes |
|---|---|---|
| Card data transmitted | <!-- Yes / No --> | |
| Card data stored | <!-- Yes / No --> | |
| PCI-DSS controls required | <!-- Yes / No --> | |

## Data Sensitivity Classification

| Data Element | Classification | Storage / Transmission |
|---|---|---|
| <!-- e.g., Card number --> | <!-- PCI / PII / Internal --> | <!-- e.g., Never stored; tokenized before persistence --> |

## Threat Model Highlights

<!-- Identify the top risks and the controls that mitigate them. -->

| Threat | Mitigation |
|---|---|
| <!-- e.g., Token replay attack --> | <!-- e.g., Short-lived tokens, one-time use enforced by JavaSecurityService --> |

## Security Tasks

<!-- Reference task numbers from the relevant DomainTeam files. -->

| Task | Team | Description |
|---|---|---|
| <!-- e.g., 7.1 --> | JavaSecurityService | <!-- e.g., Issue scoped auth tokens for payment session --> |
