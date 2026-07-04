---
description: "Tax skill dispatch and auto-refresh protocol ⚡ loaded on demand when tax intent is detected."
mode: "agent"
---

# Tax Skill Dispatch Protocol

---

## Progressive-Disclosure Dispatch Sequence

```
codenova.task.run("tax-skill", subject)
  ├─ Step 1: Load manifest
  │    → .github/instructions/pd/skills/tax/manifest.md
  │
  ├─ Step 2: Load trigger map
  │    → .github/instructions/pd/skills/tax/triggers.md
  │
  ├─ Step 3: Apply conditional loading rules
  │    → .github/instructions/pd/skills/tax/loading-rules.md
  │    → Load one primary tax guide only (business OR developer OR shopping quick)
  │
  ├─ Step 4: Apply nested-load rules only if needed
  │    → .github/instructions/pd/skills/tax/nested-loads.md
  │    → Load deep shopping guide only for explicit deep/advanced requests
  │
  ├─ Step 5: Cross-reference codebase (developer questions only)
  │    → Targeted grep_search for requested class/method identifiers
  │
  └─ Step 6: Format output using template
       → .github/instructions/pd/skills/tax/response-templates.md
```

## Canonical Intent Source

Intent alias normalization is centralized in `.github/instructions/codenova.instructions.md`.
This prompt is execution-only after the route resolves to `tax-skill`.

If route selection is ambiguous, ask one clarifying question before loading deep files.

## Compound-Skill Output Support

When tax-skill runs as a supporting skill in `compound-skill`, emit a compact packet that downstream skills can consume:

```json
{
  "skill": "tax-skill",
  "route": "business|developer|shopping",
  "summary": "3-5 sentence compact summary",
  "constraints": [],
  "risks": [],
  "recommended_changes": [],
  "confidence": "high|medium|low"
}
```

Supported downstream consumption targets:

- Domain synthesis flows.
- Impact analysis and blast-radius analysis.
- Archon deconstruct/design/ADR/story generation.
- Story/defect code implementation or fixing handoff flows.

---

## Refresh Protocol (`codenova, refresh tax skill`)

When the refresh command is invoked:

1. `grep_search`: scan `*.cs` for `TaxCalculation|TaxRule|ITaxCalculator|TaxType|TaxFee|TaxRate|ApplyTax|CalculateTax`
2. Read all three guide files from `tax.skillindex`
3. Diff discovered signatures and logic against guide documentation
4. Output:
   - What is still accurate
   - What is outdated (in guides but changed/removed in code)
   - What is missing (in code but not in guides)
5. Recommend specific guide file edits

---

## Auto-Refresh Rule (no command required)

> **Whenever Copilot/CodeNova writes, edits, or reviews any `.cs` file containing `TaxCalculation`, `TaxRule`, `ITaxCalculator`, `TaxType`, `TaxFee`, `TaxRate`, `ApplyTax`, or `CalculateTax` ⚡ automatically execute steps 1–4 of the Refresh Protocol at the end of the response.**

Append to response:
- If discrepancies found → `📋 Tax Skill Auto-Refresh` section listing findings
- If no discrepancies → single line: `✅ Tax skill guides are current.`

Auto-refresh is triggered by:
- Editing or creating a `.cs` file with any tax identifier above
- Reviewing a PR diff touching tax-related files
- Answering a code question involving a tax class or method
- `editorContext` is a `.cs` file in a tax-related namespace

