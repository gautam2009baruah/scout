# Tax Conditional Loading Rules

## Rule Set

- If input contains any Developer route keyword, load `TAX_CALCULATION_DEVELOPER_GUIDE.md`.
- If input contains any Shopping route keyword, load `TAX_CALCULATION_SHOPPING_QUICK_GUIDE.md`.
- If input contains any Business route keyword, load `TAX_CALCULATION_BUSINESS_GUIDE.md`.
- If input contains Full route keyword, load business + developer + shopping quick in sequence.
- If no route keyword matches, load `TAX_CALCULATION_BUSINESS_GUIDE.md` first.

## Precision Guards

- Do not load `TAX_CALCULATION_SHOPPING_AVAILABILITY.md` by default.
- Load deep shopping file only when user requests "deep", "detailed flow", "bottleneck", or "advanced scenario".
- For code verification asks, run targeted symbol lookup after developer guide load.
