---
description: "ISF framework reference for routing, token control, and skill wiring. Load only when ISF architecture is requested."
agent: "agent"
---

# ISF Framework

## What ISF Is

ISF (Intelligent Agent Skill Framework) is a `.github` file system contract that enforces:

- deterministic routing
- minimal context loading
- indexed domain knowledge
- backend-first execution

## Primary Goals

1. Near-zero baseline token cost.
2. Deterministic command routing.
3. Skill knowledge freshness over time.

## Routing Model

Use the shortest valid path:

1. Bridge 0: STM fast lookup (`codenova.bridge`).
2. Bridge 1: Skill dispatch (`tax`, `ohip`, `synxisnom`, `reviewnet`).
3. Bridge 2: Deep-discover for ask/explain/discover.
4. Bridge 3: Named command to task/orchestrator.
5. Bridge 4: Raw tools fallback only.

Rule: never start with raw tool calls when a higher bridge applies.

## Token Rules

- Keep always-on files minimal.
- Keep `codenova.bridge` compact and lookup-oriented.
- Load one skill asset per query by default.
- Load full skill sets only on explicit full-overview requests.
- Keep procedural logic in prompt files, not always-on instruction files.

## ISF Layers

1. Instructions layer (`.github/instructions`): routing and scope rules.
2. Prompts layer (`.github/prompts`): on-demand executable protocols.
3. Skill index layer (`*.skillindex`): lazy asset selection.
4. Skill asset layer (`isf/<skill>/*.md`): domain content.

## Active Skills

- OHIP: `ohipskill/ohip.skillindex`
- Tax: `taxskill/tax.skillindex`
- SynxisNom: `synxisnomskill/synxisnom.skillindex`
- ReviewNet: `reviewnetskill/reviewnet.skillindex`

## Governance

- Use narrow `applyTo` scopes.
- Keep prompt files without `applyTo`.
- Avoid duplicated routing logic across files.
- Use concise, parse-friendly ASCII content in hot paths.

## Quality and Validation

For routing changes, validate:

1. intent detected
2. executor selected
3. strategy chosen (`backend-only`, `backend-first`, `backend-assisted-copilot`)
4. copilot invocation necessity
5. fallback reason when fallback occurs

## Related Files

- `.github/instructions/codenova.instructions.md`
- `.github/instructions/codenova.bridge`
- `.github/prompts/codenova-deep-discover.prompt.md`
- `.github/prompts/codenova-tax-skill.prompt.md`
- `.github/prompts/codenova-ohip.prompt.md`
