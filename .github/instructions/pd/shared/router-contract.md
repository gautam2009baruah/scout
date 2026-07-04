# Router Contract (Progressive Disclosure)

Apply this dispatch order for every skill.

1. Detect skill intent by top-level trigger.
2. Load `<skill>/manifest.md` only.
3. Evaluate `<skill>/triggers.md` and classify route.
4. Load exactly one primary concern file from `<skill>/loading-rules.md`.
5. Load nested files only if `nested-loads.md` conditions are met.
6. Use `<skill>/response-templates.md` to format output.

For compound intents, use `.github/instructions/pd/shared/compound-skill-routing.md` after skill detection and before any deep load.

## Hard Guards

- Never load all files in a skill folder by default.
- Never load deep reference files without a matching trigger.
- If no trigger matches, ask one clarifying question.
- If two routes match, choose the narrower route first.
- For ambiguous asks, load overview/light file before deep file.
- If 2+ domain skills are intentionally chained, do not collapse to one skill; switch to bounded compound routing.

## Escalation Policy

- Escalate to deeper files only when:
  - User explicitly asks for deep detail, or
  - Confidence is low after primary file load, or
  - Output requires exact identifiers unavailable in the primary file.

## Token Budget Guidance

- First response target: 1 primary file only.
- Follow-up response target: add 1 nested file max.
- Full multi-file load only for explicit "full overview" or "full audit" requests.
- Compound routing target: 1 primary file per supporting skill, then destination skill orchestrator.
