# ReviewNet Conditional Loading Rules

## Rule Set

- If input contains checklist-route keywords, load `PR_CHECKLIST.md` only.
- If input contains full-review keywords, load `REVIEW_GUIDELINES.md`.
- If input is ambiguous review request, load checklist first.
- If checklist detects violations or user asks for details, escalate to guidelines.
- If input is impact analysis, do not load standards files first; run impact discovery flow.

## Precision Guards

- Do not load both checklist and guidelines at start.
- Do not apply standards files to pure impact-only requests unless asked.
