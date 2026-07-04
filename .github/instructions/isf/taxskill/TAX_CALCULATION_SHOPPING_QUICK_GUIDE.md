# Tax Calculation During Shopping Availability (Quick Guide)

## Purpose

This guide is the default `tax-shopping` asset for fast, low-token responses.
Use it for shopping and availability questions unless the user explicitly asks for deep implementation details.

## Scope

- Shopping request flow and tax touchpoints.
- Daily and stay tax behavior at a high level.
- Core data structures exposed in shopping results.
- Common troubleshooting checks.

For full deep-dive internals, use:
- `TAX_CALCULATION_SHOPPING_AVAILABILITY.md`

## End-to-End Flow

1. Shopping request arrives with dates, occupancy, hotel, and channel context.
2. Availability engine loads candidate products (rate and room combinations).
3. Tax data is loaded for matching date range and assignments.
4. Daily taxes are calculated per night and per product.
5. Stay taxes are calculated once per reservation.
6. Totals are aggregated and returned with tax and fee breakdowns.

## Where Taxes Are Applied

- Hotel-level taxes: apply to all products.
- Room-level taxes: apply only to assigned rooms.
- Rate-level taxes: apply only to assigned rates.
- Package-level taxes: apply to package content when configured.

## Daily Tax Rules (Per Night)

- Date and season must match.
- Optional price and length-of-stay ranges must match.
- Charge type controls multiplier:
  - per room
  - per person
  - per adult
  - per child
- Tax can be percentage or fixed amount.
- Ceiling caps can limit final amount.
- Inclusive taxes are extracted from displayed room price.
- Exclusive taxes are added on top of room price.

## Stay Tax Rules (Per Reservation)

- Triggered by per-stay frequency.
- Calculated once per booking, not per night.
- Often used for fees like resort or facility charges.
- Can optionally be distributed across day-item display values.

## Shopping Result Fields to Expect

At product level:
- `TotalPrice`
- `TotalPriceWithTaxesAndFees`
- `TotalTaxAmount`
- `TotalFeeAmount`
- `StayTaxAmount`
- `StayFeeAmount`
- `AveragePriceWithTaxesAndFees`

At day-item level:
- date
- nightly room price
- nightly tax amount
- nightly fee amount
- nightly total with taxes and fees

Breakdown level:
- itemized taxes and fees by code/type/level
- per-stay vs per-night marker
- pay-now vs pay-at-property behavior

## Fast Diagnostic Checklist

1. Tax missing:
- confirm assignment (hotel/room/rate/package)
- confirm season overlaps requested dates
- confirm tax is active
- confirm channel restrictions allow use

2. Tax amount wrong:
- verify percent/amount and charge type
- verify guest count and child age offsets
- verify base vs subtotal calculation mode
- verify ceiling behavior

3. Stay tax missing:
- verify frequency is per-stay
- verify stay-tax evaluation executed

4. Slow shopping responses:
- verify tax cache hit behavior
- verify single-query tax load strategy
- verify product filtering occurs before expensive tax work

## Token-Efficient Response Pattern

When answering shopping tax questions, prefer:

1. One-line summary.
2. 3-5 bullets for flow and rules.
3. Optional short troubleshooting section only if requested.

Avoid loading deep implementation and large architecture blocks unless explicitly requested.

## Escalation Rule

Escalate to `TAX_CALCULATION_SHOPPING_AVAILABILITY.md` only when user asks for:

- class or method-level walk-through
- schema-level SQL details
- performance benchmark internals
- full sequence diagrams
- code-level troubleshooting scripts
