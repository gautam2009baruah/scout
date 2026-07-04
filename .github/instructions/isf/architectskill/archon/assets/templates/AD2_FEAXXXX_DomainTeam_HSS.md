# HSS — FEAXXXX <Feature Name>

← Back to Index: [AD2_FEAXXXX_Index.md](AD2_FEAXXXX_Index.md)

> **HSS (Hospitality Shared Services)** — Core .NET service layer for availability, reservations, rates/inventory, and the primary hotel data model. Orchestrates other services (JavaPaymentService for PSP integration, JavaSecurityService for auth tokens).

## Overview

<!-- Describe what HSS is responsible for in this feature. -->

## Reference Links

- <!-- [Internal doc or API reference](path) -->

## Tech Tasks

<!-- Tasks must be specific and atomic. Format: X.Y <description>
     These numbers are stable after developer handoff — do not renumber.
     Each task must include a pseudocode block describing implementation logic.
     Omit pseudocode only for pure configuration or UI-text-only tasks. -->

1.1 <!-- e.g., Add POST /v2/reservations/{id}/pay endpoint to ReservationController.cs -->
    ```pseudocode
    // describe the implementation logic here
    ```
1.2

## Code References

<!-- List real files discovered by scanning shs_synxis.projectx/, shs_synxis.domain-bridge/, and related hss repos.
     Use workspace-root-relative paths. Mark unconfirmed files [UNVERIFIED]. -->

- <!-- `shs_synxis.projectx/src/.../ReservationController.cs` — entry point for reservation operations -->
- <!-- `shs_synxis.projectx/src/.../IPaymentGatewayClient.cs` — interface for PSP calls delegated to JavaPaymentService -->
