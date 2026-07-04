# OHIP Skill Manifest

## Purpose

Handle OHIP domain, mode guidance, and implementation requests with route-specific loading.

## Boundaries

- In scope: OHIP architecture, mode behavior, action onboarding workflow.
- Out of scope: tax subsystem, generic nomenclature lookup, .NET standards review.

## Primary Files by Concern

- Overview: `OHIP_DOMAIN_OVERVIEW.md`
- Registry: `OHIP_ACTION_REGISTRY.md`
- Mode files: `neweventtype.md`, `eventhandler.md`, `apiintegration.md`, `dtomapping.md`, `testing.md`, `validate.md`, `preflight.md`

## Loading Objective

Always load overview first, then exactly one mode/registry file.
