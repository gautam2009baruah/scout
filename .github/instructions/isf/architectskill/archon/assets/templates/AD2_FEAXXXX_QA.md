# QA — FEAXXXX <Feature Name>

← Back to Index: [AD2_FEAXXXX_Index.md](AD2_FEAXXXX_Index.md)

## Test Strategy

| Layer | Approach | Owner |
|---|---|---|
| Unit | <!-- e.g., xUnit per service, target >80% coverage on new code --> | Dev teams |
| Integration | <!-- e.g., In-process tests against test DB and mock gateway --> | Dev teams |
| E2E | <!-- e.g., Postman/Newman against staging environment --> | QA team |

## Key Test Scenarios

### Happy Path

| # | Scenario | Expected Result |
|---|---|---|
| 1 | <!-- e.g., Guest completes payment with valid card --> | <!-- e.g., Reservation confirmed, payment record created --> |

### Edge Cases & Error Paths

| # | Scenario | Expected Result |
|---|---|---|
| 1 | <!-- e.g., Gateway returns timeout --> | <!-- e.g., Transaction marked failed, guest shown error message --> |
| 2 | <!-- e.g., Duplicate submission --> | <!-- e.g., Idempotency key prevents double charge --> |

### Security & Compliance Scenarios

| # | Scenario | Expected Result |
|---|---|---|
| 1 | <!-- e.g., Request with expired token --> | <!-- e.g., 401 returned, no data exposed --> |

## Test Data Requirements

<!-- Describe what test data must exist before tests can run. -->

- <!-- e.g., Test property with PMS connected in staging -->
- <!-- e.g., Adyen test card numbers (use Adyen sandbox) -->

## Environment Dependencies

| Dependency | Environment | Notes |
|---|---|---|
| <!-- e.g., Adyen sandbox --> | Staging | <!-- e.g., Test credentials in vault under adyen/sandbox --> |
| <!-- e.g., PMS simulator --> | Staging | |
