---
description: "Technical documentation for the Tax Skill  architecture, dispatch mechanics, token model, auto-refresh system, and delivery outcomes. Reference for skill authors and contributors."
applyTo: ".github/instructions/isf/**"
---

# Tax Skill  Technical Intelligence Document

> **Audience:** Skill contributors, CodeNova administrators, developers working in or around the tax subsystem.  
> **Scope:** How the Tax skill is architected inside CodeNova, what each layer does, the 3-layer freshness model, and what the skill concretely delivers.

---

## 1. What the Tax Skill Is

The Tax skill is a **knowledge-indexed, lazily-loaded AI domain layer** built on top of CodeNova's task executor. It provides authoritative answers about the SynXis tax calculation subsystem  business rules, C# implementation patterns, and shopping pipeline integration  without crawling the workspace on every question.

It differs from the OHIP skill in that it does **not generate code or execute multi-phase workflows**. Its primary function is accurate, cited knowledge delivery from three pre-indexed guides covering distinct layers of the same domain. Its secondary function is a **3-layer knowledge freshness system** that keeps the guides synchronized with live codebase changes automatically.

---

## 2. System Architecture

```
User message (tax intent)
    
    
codenova.instructions.md  Intent Recognition
      Trigger keywords: tax, taxes, TaxCalculation, TaxRule,
      ITaxCalculator, tax fee, tax rate, hotel tax, tax subsystem, etc.
    
    
codenova.task.run("tax-skill", subject)
    
    
codenova-tax-skill.prompt.md  Dispatch Protocol (loaded on demand)
      Step 1: Read tax.skillindex
      Step 2: Match subject  single asset
      Step 3: Cross-reference codebase (code questions only)
      Step 4: Synthesize answer
    
     business / rules / config / fees
           
       TAX_CALCULATION_BUSINESS_GUIDE.md
           
       Answer  cites guide section
    
     code / implementation / classes / methods
           
       TAX_CALCULATION_DEVELOPER_GUIDE.md
           
       Answer + optional grep_search cross-reference
    
     shopping / availability / storefront
           
       TAX_CALCULATION_SHOPPING_AVAILABILITY.md
           
       Answer  cites guide section
    
     ambiguous
            
        TAX_CALCULATION_BUSINESS_GUIDE.md first
            
        Escalate to TAX_CALCULATION_DEVELOPER_GUIDE.md if code evidence needed
```

**Auto-refresh runs in parallel with normal responses** when a tax identifier is detected in a `.cs` file being edited  see Section 6.

---

## 3. File Layer Map

```
.github/instructions/isf/taxskill/
 tax.skillindex                          Index file  sole entry point for asset loading
 TAX_CALCULATION_BUSINESS_GUIDE.md       Business rules, tax types, configuration, seasons, examples
 TAX_CALCULATION_DEVELOPER_GUIDE.md      C# classes, interfaces, algorithms, DB schema, integration points
 TAX_CALCULATION_SHOPPING_AVAILABILITY.md  Shopping pipeline architecture, request flow, performance

.github/prompts/codenova-tax-skill.prompt.md  Dispatch protocol + refresh protocol (on-demand)
scripts/codenova-tax-watcher.ps1              Layer 3 auto-refresh FileSystemWatcher (VS Code task)
GitHelpers/post-commit                        Layer 3 auto-refresh Git post-commit hook
.vscode/tasks.json                            Launches watcher on folderOpen (runOn: folderOpen)
```

---

## 4. Skill Index Mechanics

`tax.skillindex` is the only file CodeNova reads first. It maps three intent tags to three distinct guides.

```
# Format: [Description | type | intent-tag]::path
[Tax Calculation Business Guide | *.md | tax-business]::.github/instructions/isf/taxskill/TAX_CALCULATION_BUSINESS_GUIDE.md
[Tax Calculation Developer Guide | *.md | tax-developer]::.github/instructions/isf/taxskill/TAX_CALCULATION_DEVELOPER_GUIDE.md
[Tax in Shopping Availability (Quick) | *.md | tax-shopping]::.github/instructions/isf/taxskill/TAX_CALCULATION_SHOPPING_QUICK_GUIDE.md
[Tax in Shopping Availability (Deep)  | *.md | tax-shopping-deep]::.github/instructions/isf/taxskill/TAX_CALCULATION_SHOPPING_AVAILABILITY.md
```

**Asset resolution rules:**
- One asset per query  the index tag that best matches the question's domain layer
- `tax-business` is the default for ambiguous questions (lowest risk of missing the answer)
- `tax-developer` is escalated to only if code-level evidence is needed after reading `tax-business`
- Loading all three assets is the **last resort**, only when explicitly asked for a full overview

---

## 5. Dispatch Steps  Technical Detail

### Step 1  Read skill index
Load `tax.skillindex`. No workspace search at this point.

### Step 2  Subject-matched asset load (single file)

| Subject matches | Asset loaded |
|---|---|
| business rules / config / fees / rates / seasons | `TAX_CALCULATION_BUSINESS_GUIDE.md` |
| code / classes / interface / implementation / method | `TAX_CALCULATION_DEVELOPER_GUIDE.md` |
| shopping / availability / search / storefront / pipeline | `TAX_CALCULATION_SHOPPING_QUICK_GUIDE.md` |
| ambiguous | `TAX_CALCULATION_BUSINESS_GUIDE.md` first; `TAX_CALCULATION_DEVELOPER_GUIDE.md` added only if code evidence needed |
| explicit "full overview / all guides" | All three  last resort |

### Step 3  Cross-reference (code questions only)
For implementation questions, after loading `TAX_CALCULATION_DEVELOPER_GUIDE.md`:
- `grep_search` for class/method identifiers found in the guide
- Correlate against live workspace to confirm accuracy or detect drift
- Step 3 does **not** run for pure business or shopping questions

### Step 4  Synthesize
Answer from indexed knowledge + any workspace evidence from Step 3. Cites the guide section. Notes any discrepancies between documentation and code if found.

---

## 6. Three-Layer Knowledge Freshness System

The tax skill has a unique freshness guarantee that OHIP does not have  the guides are actively monitored for drift against the live codebase.

### Layer 1  Real-Time Cross-Reference (every tax answer)
Every time `TAX_CALCULATION_DEVELOPER_GUIDE.md` is loaded (Step 2), Step 3 runs a targeted `grep_search` for identifiers found in the guide. Any discrepancy between the guide and the live code is surfaced inline in the response.

**Cost:** ~200400 extra tokens on developer questions only. Zero cost on business/shopping questions.

### Layer 2  Manual Refresh (`codenova, refresh tax skill`)
Full audit on demand:
1. `grep_search` all `*.cs` for `TaxCalculation|TaxRule|ITaxCalculator|TaxType|TaxFee|TaxRate|ApplyTax|CalculateTax`
2. Load all three guide files
3. Diff discovered signatures and logic against guide content
4. Report: what is still accurate / what is outdated (changed or removed) / what is missing (in code but not in guides)
5. Recommend specific guide file edits

### Layer 3  Automatic Refresh (no command required)
Two independent implementations watch for codebase changes:

**FileSystemWatcher (VS Code):**
- `scripts/codenova-tax-watcher.ps1` runs as a VS Code task (`runOn: folderOpen`)
- Watches all `*.cs` files in the workspace for write events
- On save: checks content for any of the 8 tax identifiers (`TaxCalculation`, `TaxRule`, `ITaxCalculator`, `TaxType`, `TaxFee`, `TaxRate`, `ApplyTax`, `CalculateTax`)
- If a match is found: emits a VS Code-compatible warning prompting the developer to run `codenova, refresh tax skill`
- Debounced at 300ms to skip partial/temp writes

**Git post-commit hook:**
- `GitHelpers/post-commit` fires after every commit
- Scans staged `.cs` files for the same 8 identifiers
- If a match is found: appends a reminder to the commit output

**In-response auto-refresh:**
- When Copilot/CodeNova writes, edits, or reviews any `.cs` containing the 8 identifiers: automatically executes Steps 14 of the Refresh Protocol at the end of the response
- Appends ` Tax Skill Auto-Refresh` to the response listing any discrepancies found
- Appends ` Tax skill guides are current.` if no drift detected

---

## 7. Guide Content  What Each Covers

### `TAX_CALCULATION_BUSINESS_GUIDE.md`  `tax-business`
Business-level reference for the tax calculation domain:
- Shopping pipeline context (how tax calculation fits into availability search)
- Tax calculation principles: hierarchical application, date-aware, guest-based, inclusive vs. exclusive, cascading
- Tax types and configuration
- Tax rules and applicability logic
- Seasonal tax management
- Pricing calculation examples
- Data structures for tax output

**Audience:** Product owners, business analysts, developers needing domain orientation

---

### `TAX_CALCULATION_DEVELOPER_GUIDE.md`  `tax-developer`
Code-level implementation reference:
- C# class and interface map for the tax subsystem
- Full tax application algorithm (step-by-step)
- Daily vs. stay tax calculation logic
- Hierarchical application order (Hotel  Room  Rate  Package)
- Inclusive/exclusive tax mode handling
- Cascading tax-on-tax implementation
- Database schema for tax tables
- Integration points with the shopping engine
- Performance targets and optimization patterns

**Audience:** Developers implementing or debugging tax-related features

---

### `TAX_CALCULATION_SHOPPING_QUICK_GUIDE.md`  `tax-shopping`
Shopping pipeline architecture focused on the tax layer:
- High-level system architecture (all layers from user request to response)
- Component architecture diagram
- End-to-end tax calculation flow through the shopping request
- Daily tax calculation detail
- Stay tax calculation detail
- Tax aggregation and total computation
- Response formatting with tax breakdown
- Advanced scenarios (multi-season stays, guest-age-based taxes, channel overrides)
- Performance considerations and known bottlenecks
- Troubleshooting guide for tax-related shopping issues
- Code examples

**Audience:** Developers working on availability/shopping pipelines, debugging tax in search results

---

## 8. Intent Trigger Map

Triggers are declared in `codenova.instructions.md` and `.codenova-config.json`. Any message matching these routes to `codenova.task`  `tax-skill` before any raw tool call.

| Category | Trigger Words |
|---|---|
| **Direct** | tax, taxes, tax calculation, tax logic, tax rules, tax fee, tax rate, tax types |
| **Contextual** | hotel tax, room tax, booking tax, reservation tax, fee calculation, tax in shopping |
| **Technical** | TaxCalculation, TaxType, TaxRule, ITaxCalculator, tax subsystem, tax breakdown |

---

## 9. Token Cost Model

| Operation | Assets loaded | Approx. tokens |
|---|---|---|
| Business question | `TAX_CALCULATION_BUSINESS_GUIDE.md` | ~1,5002,000 |
| Developer question | `TAX_CALCULATION_DEVELOPER_GUIDE.md` + grep cross-ref | ~2,0002,500 |
| Shopping question | `TAX_CALCULATION_SHOPPING_QUICK_GUIDE.md` | ~300-600 |
| Ambiguous question | `TAX_CALCULATION_BUSINESS_GUIDE.md` | ~1,500 |
| Manual refresh | All three guides + grep scan | ~5,0006,000 |
| Auto-refresh (in-response) | All three guides + grep scan | ~5,0006,000 |

**Baseline (no tax in message):** 0 tokens  the entire skill is dormant.

The tax guides are large (comprehensive domain references). Token costs are higher than OHIP's overview-only Path A because the guides are intentionally complete rather than compact. The trade-off is higher answer accuracy and fewer follow-up questions.

---

## 10. Why It Exists  Benefits

### Without the Tax Skill

Tax calculation questions against this codebase require:
- Knowing which classes implement the calculation pipeline
- Running `grep_search` or `semantic_search` across a large codebase to find the right files
- Interpreting implementation code without documented business context
- No guarantee the answer reflects current code vs. stale patterns

Answers are slow (full workspace crawl) and brittle (no freshness validation).

### With the Tax Skill

| Outcome | Detail |
|---|---|
| **Domain-separated answers** | Business questions go to the business guide; code questions go to the developer guide; shopping questions go to the shopping guide  no cross-contamination |
| **No workspace crawl for business questions** | `TAX_CALCULATION_BUSINESS_GUIDE.md` answers tax type, rule, and configuration questions with zero `grep_search` |
| **Live cross-reference on code questions** | Developer guide answers are always validated against live code via Step 3  the response reflects both documented intent and actual signatures |
| **Freshness guarantee** | Three independent auto-refresh mechanisms ensure guide drift is detected and surfaced before a developer acts on stale information |
| **Consistent onboarding** | A developer new to the tax subsystem gets the same structured, layered explanation as a domain expert would give |
| **Audit trail** | The refresh command produces a structured diff  what changed, what was removed, what is undocumented  usable as a documentation debt tracker |

---

## 11. Known Limitations

| Limitation | Detail |
|---|---|
| Guides are large | Each guide is a comprehensive reference document. Token cost per query is higher than OHIP's compact skill assets. Consider splitting very large guides if token budget becomes a constraint. |
| Auto-refresh is advisory | Layer 3 (watcher + hook) prompts the developer to run a refresh  it does not automatically rewrite the guides. Guide updates require human review. |
| Cross-reference is identifier-based | Step 3 searches for class/method names found in the guide. If the codebase uses different identifiers than those documented, drift goes undetected until a manual refresh. |
| No code generation | The tax skill is knowledge-only  it does not generate or scaffold tax-related code. For code generation, answers from `tax-developer` guide must be applied manually. |
| Guide scope is shopping-focused | All three guides cover tax calculation during availability/shopping. Tax at booking confirmation and modification stages may require separate documentation. |
