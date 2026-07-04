# Conditional Loader Patterns

Use these patterns in prompts or index logic.

## Pattern 1: One-Concern First

- If input contains `X-keywords`, load `X-file`.
- Else if input contains `Y-keywords`, load `Y-file`.
- Else load `overview-file`.

## Pattern 2: Clarify Before Deep Load

- If no keywords match and confidence is low:
  - Ask one targeted question.
  - Do not load deep references yet.

## Pattern 3: Nested File Load

- Load `array.md` for array questions.
- If input also contains nested-array signals (`array of arrays`, `jagged`, `multi-dimensional`), then load `nested-array.md`.
- Keep nested load disabled for simple array questions.

## Pattern 4: Escalation by Precision Need

- If user asks for exact enum/class/path names, escalate from overview to reference file.
- If user asks concept-only, stay in overview.

## Pattern 5: Bounded Multi-Load

- At start: max 1 primary file.
- On first follow-up: add max 1 nested file.
- Load 3+ files only for explicit full-audit requests.
