# Architect Conditional Loading Rules

## Rule Set

- If input contains SON/SRD keywords, load `SON_TO_SRD_TEMPLATE.md`.
- If input contains ADR keywords, load `ADR_FEAXXXX_Topic.md`.
- If input contains AD2 keywords, load `AD2_FEAXXXX_FULL.md`.
- If input contains Impact keywords, load `IMPACT_ANALYSIS_TEMPLATE.md`.
- If input contains Story keywords, load `STORY_BREAKDOWN_TEMPLATE.md`.
- If deliverable is unclear, ask: "Which artifact do you want: SON/SRD, ADR, AD2, impact, or stories?".

## Precision Guards

- Do not load all templates for one request.
- Load `ARCHITECT_DOMAIN_OVERVIEW.md` only when user asks conceptual architecture questions.
- Load orchestrator only for multi-step generation workflows.
