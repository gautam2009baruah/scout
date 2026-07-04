---
description: "Authoring guide for CodeNova prompt protocols. Focus on deterministic routing, small context, and executable steps."
agent: "agent"
---

# ISF Prompts Guide

## Purpose

This file defines how to write prompt protocols in `.github/prompts`.
Prompt files are loaded on demand and should contain executable flow, not large background theory.

## Required Frontmatter

Use only:

- `description`: one sentence describing protocol purpose.
- `agent`: use `agent` for executable protocols.

Do not include `applyTo` in prompt files.

## Prompt Design Rules

1. One prompt, one concern.
2. Deterministic step order.
3. Explicit branch conditions.
4. Explicit tool or executor handoff.
5. No primary workspace crawl if index/bridge path exists.

## CHAIN Checklist

- Called: trigger conditions are clear.
- Handoff: next executor/tool is explicit.
- Atomic: single concern per prompt.
- Intent-triggered: routing based on user intent.
- No-crawl-first: raw search is fallback only.

## Structure Template

1. Intent detection criteria.
2. Dispatch rules and priority.
3. Step-by-step execution.
4. Confidence/output format.
5. Anti-patterns.

## Anti-Patterns

- Duplicating always-on instructions in prompt files.
- Embedding large static domain docs inside prompts.
- Mixed concerns (routing + deep domain + review policy in one file).
- Unbounded search as the first step.

## Token Budgets

Keep these as defaults:

- ask/explain: <= 220 words
- discover: <= 300 words
- analyze enhancement: <= 180 words
- review output: <= 420 words

## Prompt Validation

Before shipping a prompt:

1. Confirm all referenced files exist.
2. Confirm each intent maps to one deterministic path.
3. Confirm fallback exists for no-match cases.
4. Confirm output remains concise and bounded.
5. Confirm examples reflect current executor names.

## Recommended Separation

- Routing contract: `.github/instructions/codenova.instructions.md`
- Prompt protocol: `.github/prompts/*.prompt.md`
- Domain assets: `.github/instructions/isf/<skill>/*.md`
- Lazy index: `.github/instructions/isf/<skill>/*.skillindex`

## Example Triggers

- Tax intent -> `codenova.task` `tax-skill`
- OHIP intent -> `codenova.task` `ohip-skill`
- Architect / archon intent -> `codenova.task` `architect-skill`
- SynXis nom / domain / app-code intent -> `codenova.task` `synxisnom`
- Ask/explain/discover -> `codenova.task` `ask` with deep-discover
- Workflow review intent -> `codenova.orchestrator`

> **Synxisnom guard:** messages that match `synxis` AND contain `guideline|standard|checklist` route to `review-synxis-guidelines` instead of `synxisnom`. The nom block skips when `isGuidelineRequest` is true.

## Maintenance Notes

- Keep prompt files ASCII where possible.
- Remove stale command names quickly.
- Prefer short examples over long prose.
