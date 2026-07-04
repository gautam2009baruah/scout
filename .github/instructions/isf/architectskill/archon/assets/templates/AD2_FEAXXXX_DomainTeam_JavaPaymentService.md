# JavaPaymentService — FEAXXXX <Feature Name>

← Back to Index: [AD2_FEAXXXX_Index.md](AD2_FEAXXXX_Index.md)

> **JavaPaymentService** — Payment processing service. Owns gateway integrations, the full transaction lifecycle (auth/capture/refund/void), payment method storage, and all PCI-scoped flows.

## Overview

<!-- Describe what JavaPaymentService is responsible for in this feature. -->

## Reference Links

- <!-- [Payment gateway API docs](url) -->
- <!-- [Internal payment service API spec](path) -->

## Tech Tasks

<!-- Task numbers are stable after developer handoff — do not renumber.
     Each task must include a pseudocode block describing implementation logic.
     Omit pseudocode only for pure configuration or UI-text-only tasks. -->

1.1 <!-- e.g., Implement AdyenDirectConnection gateway adapter implementing IPaymentGateway -->
    ```pseudocode
    // describe the implementation logic here
    ```
1.2 <!-- e.g., Add POST /v2/payments/adyen/sessions endpoint -->
    ```pseudocode
    // describe the implementation logic here
    ```
1.3

## Code References

<!-- List real files discovered by scanning shs_java_domain/ — focus on payment/, gateway/, transaction/ packages.
     Use workspace-root-relative paths. Mark unconfirmed files [UNVERIFIED]. -->

- <!-- `shs_java_domain/<repo>/src/main/java/.../IPaymentGateway.java` — interface all gateway adapters must implement -->
- <!-- `shs_java_domain/<repo>/src/main/java/.../PaymentController.java` — existing entry point for payment operations -->
- <!-- `shs_java_domain/<repo>/src/main/java/.../TransactionRepository.java` — persistence layer for payment records -->
