# OHIP Conditional Loading Rules

## Rule Set

- If input contains any OHIP activation keyword, load `OHIP_DOMAIN_OVERVIEW.md` first.
- If input contains registry keywords, then load `OHIP_ACTION_REGISTRY.md`.
- If input contains one mode keyword, load only that mode file.
- If input contains end-to-end keywords, load mode files in sequence as needed, not all at once.
- If mode is unclear but implementation intent is clear, ask one question: "Which mode should I run?".

## Precision Guards

- Never load all mode files for a single mode question.
- Never load registry unless user asks about existing action status.
- Use `preflight.md` only for input validation requests or before implementation.
