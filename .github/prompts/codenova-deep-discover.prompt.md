---
description: "Deep-discover execution protocol for ask/explain/discover intents with backend-first search and bounded synthesis."
agent: "agent"
---

# Deep-Discover Protocol

Execute in this exact order.

Expected input: canonicalized ask-family intent from `.github/instructions/codenova.instructions.md`
(`ask|explain|discover|summarize|identify|search|scan`).

## Step 0: Brain Lookup

`codenova.task.brainLookup(subject)`

- Read `.github/instructions/codenova.bridge`.
- Classify as `CONFIRMED`, `INFERRED`, or `UNKNOWN`.
- If `CONFIRMED`, skip Step 2.

## Step 1: Parse Subject

`codenova.task.parse(subject)`

- Extract canonical subject.
- Generate compact variants for code search.

## Step 2: Progressive-Disclosure Guard (Before Search)

- Load `.github/instructions/pd/shared/router-contract.md`.
- Load `.github/instructions/pd/shared/conditional-loader-patterns.md`.
- If subject intentionally chains multiple domain skills, load `.github/instructions/pd/shared/compound-skill-routing.md`.
- If subject maps to a known domain skill and high-confidence route exists, dispatch to that skill first.
- If subject maps to 2+ domain skills with dependency language, dispatch to compound routing instead of a single skill.
- When dispatching to compound routing, stop local deep-discover flow and return control to the compound orchestrator.
- Do not run Step 3 search for a high-confidence skill route.
- Only continue to raw search when no domain route matches or confidence remains low.

## Step 3: Search (Conditional)

`codenova.task.search(subject, variants)`

Run only when Step 0 is `INFERRED` or `UNKNOWN`, and Step 2 did not find a skill route.

- Run exact/regex search for identifiers and symbols.
- Run semantic search for conceptual matches.
- Return ranked evidence only.

## Step 4: Cross-Reference

`codenova.task.crossReference(results)`

- Correlate symbols, files, and architecture context.
- Mark evidence as direct or inferred.

## Step 5: Synthesize

`codenova.task.synthesize(crossReferencedEvidence)`

- Use `.github/instructions/pd/shared/response-style.md`.

## Step 6: Confidence Statement

`codenova.task.confidence(report)`

- State what is confirmed vs inferred.
- If insufficient evidence, request one precise follow-up input.

## Copilot Invocation Rule

Copilot synthesis is allowed only when backend evidence requires interpretation.
If backend response is complete and high confidence, return backend result directly.

## Output Limits

- Ask/explain: <= 220 words
- Discover: <= 300 words
- Max bullets: 5

