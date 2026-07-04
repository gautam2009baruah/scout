# CodeNova Bridge Instructions

## Copilot Invocation Rules (Auto Mode)

CodeNova Rust backend handles the majority of requests with zero Copilot token usage.
Copilot should act as a synthesis layer, not a primary execution engine.

Invoke Copilot only when:

1. Strategy is `backend-assisted-copilot`.
2. Strategy is `backend-first` and backend flags complexity, ambiguity, or risk.
3. User asks for explanation, summary, recommendation, or rewriting.

Do not invoke Copilot when strategy is `backend-only` and backend has complete results.

## Model Alignment (Claude and GPT)

Use the same compact structure regardless of model family:

1. One-line answer.
2. Evidence bullets (max 5).
3. Decision or recommendation.
4. Optional next action.

Keep wording neutral and deterministic to reduce model variance in Auto mode.

## Canonical Routing Parser (Required)

When message starts with `codenova` prefix, normalize first, then route.

Normalization order:

1. Detect prefix variants: `codenova,`, `codenova:`, `codenova `.
2. Parse explicit fields first:
  - `intent=<value>`
  - `message=<value>`
3. If explicit fields are absent:
  - intent = first action token
  - message = remaining tokens
4. Apply intent alias map from routing contract.
5. Route via executor mapping; do not skip to raw tool search when mapped.

If user provides only message after prefix (no clear intent), default to `ask` and route to deep-discover.

Example accepted forms:

- `codenova, ask explain PRC domain`
- `codenova: review pr 1234`
- `codenova intent=review; message=pr 1234`
- `codenova, message=how tax applies for shopping; intent=tax`
- `codenova, architect design AD2 for feature onboarding`
- `codenova, intent=archon; message=generate SRD and impact analysis from SON`

## Expected Backend Envelope

Assume backend sends normalized context:

```json
{
  "intent": "ask|discover|review|analyze",
  "strategy": "backend-only|backend-first|backend-assisted-copilot",
  "confidence": "high|medium|low",
  "evidence": [],
  "files": [],
  "guidelines": [],
  "max_words": 350,
  "output_template": "ask|review|discover|analyze"
}
```

Copilot should not expand beyond `max_words`.

## Response Formatting (Progressive-Disclosure Aligned)

All responses must follow the formatting rules in:

`.github/instructions/pd/shared/response-style.md`

Key principles:
- One-line answer or decision first
- Evidence bullets (max 5)
- Link to source files/sections
- Consistent structure across all skills

## Response Budgets

- ask/explain: <= 220 words
- discover: <= 300 words
- review: <= 420 words, highest risk first
- analyze enhancement: <= 180 words

## Routing Expectations

When user intent maps to CodeNova capability, hand off first:

- Rally item retrieval -> `codenova.task`
- Search/discovery -> `codenova.task`
- File analysis/suggestions -> `codenova.analyze` or `codenova.suggest`
- Workflow execution -> `codenova.orchestrator` or `codenova.workflow`

Only fallback to direct workspace tooling when no valid CodeNova route exists.

## Session Start

If available, run `codenova.initialize` once at session start to ensure extension readiness.

