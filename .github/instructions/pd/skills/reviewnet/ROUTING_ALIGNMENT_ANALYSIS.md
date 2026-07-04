# ReviewNet Routing & Response Format Alignment Analysis

**Issue**: `codenova, review pr 10757` did not follow Template B table format with A-M categorical validation.

---

## Root Cause Summary

1. ❌ **codenova.instructions.md** routes to `codenova.orchestrator` instead of loading the comprehensive prompt file via progressive disclosure
2. ❌ **codenova-comprehensive-pr-review.prompt.md** does NOT have explicit output format enforcement at the end
3. ⚠️ **No explicit link** between the comprehensive prompt and Template B in response-templates.md
4. ⚠️ **Missing router-contract.md** referenced in codenova.instructions.md but doesn't exist
5. ⚠️ **Domain skill routing** for reviewnet is not clearly mapped in the intent table

---

## Current State Analysis

### 1. codenova.instructions.md (Routing Contract)

**Current Mapping**:
```markdown
| `codenova, review pr <number>` | `codenova.orchestrator` -> `review-pr` |
```

**Problem**: Routes to orchestrator (backend) instead of loading the comprehensive prompt file with progressive disclosure.

**Expected Flow**:
```
User: codenova, review pr 10757
  ↓
Canonicalize: { intent: "review", message: "pr 10757" }
  ↓
Match: "review pr" pattern
  ↓
Progressive Disclosure:
  1. Load reviewnet/manifest.md
  2. Load reviewnet/triggers.md → classify as "full review route"
  3. Load reviewnet/loading-rules.md → route to comprehensive
  4. Load codenova-comprehensive-pr-review.prompt.md
  5. Format using response-templates.md Template B
```

**Actual Flow**:
```
User: codenova, review pr 10757
  ↓
Direct tool usage (gh pr view, gh pr diff)
  ↓
No progressive disclosure
  ↓
No comprehensive prompt loading
  ↓
Free-form narrative output (not Template B)
```

---

### 2. codenova-comprehensive-pr-review.prompt.md

**Current State**:
- ✅ Has complete A-M categorical structure defined in the middle
- ✅ Shows table format examples
- ❌ **NO explicit output format enforcement at the end**
- ❌ **NO reference to Template B from response-templates.md**
- ❌ **NO mandatory instruction**: "YOU MUST OUTPUT IN THIS FORMAT"

**Missing Section** (should be at end of file):

```markdown
---

## MANDATORY OUTPUT FORMAT

**YOU MUST use Template B from `.github/instructions/pd/skills/reviewnet/response-templates.md`.**

### Required Output Structure:

1. **Executive Summary Table** (as shown above)
2. **Issues by Severity Tables** (🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low)
3. **Categorical Summary Table** (A-M with status indicators)
4. **Detailed Category Findings** for each A-M category with:
   - Checklist items
   - Status (✅ PASS | ⚠️ FAIL | ➖ N/A)
   - Issues Found count
   - Critical count
5. **Upstream/Downstream Impact Map**
6. **Testing Gaps Table**
7. **Backward Compatibility Analysis Table** (Category M)
8. **Final Recommendation**: MERGE ✅ | DO NOT MERGE ❌ | MERGE WITH CAUTION ⚠️

### Output Format Rules:

- ALL findings MUST be in structured tables
- Use file links with line numbers: [file.cs](path/to/file.cs#L10-L15)
- Include all 13 categories (A-M) even if N/A
- Prioritize critical/high issues first
- Provide specific, actionable remediation steps
- Estimate effort for fixes
- NO free-form narrative sections
- NO bullet lists outside tables
```

---

### 3. response-templates.md

**Current State**:
- ✅ Template B structure is defined
- ⚠️ Could be more prescriptive and detailed

**Recommended Enhancement**:
Add explicit example output showing what the actual table should look like with real data.

---

### 4. Progressive Disclosure Flow

**Missing Link**: The chain from user input → progressive disclosure → comprehensive prompt → Template B output is broken.

**Current Progressive Disclosure Files**:
- ✅ manifest.md - defines scope
- ✅ triggers.md - classifies review types
- ✅ loading-rules.md - routes to comprehensive for "review pr"
- ✅ nested-loads.md - escalation triggers
- ✅ response-templates.md - defines Template B

**Gap**: No enforcement mechanism to ensure comprehensive prompt actually uses Template B.

---

## Recommended Changes

### Change 1: Update codenova.instructions.md Intent Mapping

**File**: `.github/instructions/codenova.instructions.md`

**Current**:
```markdown
| `codenova, review pr <number>` | `codenova.orchestrator` -> `review-pr` |
```

**Change to**:
```markdown
| `codenova, review pr <number>` | `codenova.task` -> `reviewnet-skill` **via progressive-disclosure** |
| `codenova, comprehensive review pr <number>` | `codenova.task` -> `reviewnet-skill` **via progressive-disclosure** |
```

**Rationale**: Ensure progressive disclosure flow is followed, loading the comprehensive prompt.

---

### Change 2: Add Explicit Output Format Section to Comprehensive Prompt

**File**: `.github/prompts/codenova-comprehensive-pr-review.prompt.md`

**Action**: Add new section at the end of file (after "Notes" section)

**New Section**:
```markdown

---

## 🎯 MANDATORY OUTPUT FORMAT REQUIREMENTS

**CRITICAL**: You MUST structure your output exactly as defined in Template B.

### Output Enforcement Rules:

1. **Use Template B** from `.github/instructions/pd/skills/reviewnet/response-templates.md`
2. **ALL findings in tables** - NO free-form narrative sections
3. **Complete all 13 categories (A-M)** - mark N/A if not applicable
4. **Use file links** with line numbers: `[file.cs](path/file.cs#L10-L15)`
5. **Severity icons required**: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
6. **Final recommendation required**: MERGE ✅ | DO NOT MERGE ❌ | MERGE WITH CAUTION ⚠️

### Structure Checklist (ALL Required):

- [ ] Executive Summary Table (8 metrics)
- [ ] Issues by Severity Tables (4 severity levels)
- [ ] Categorical Summary Table (13 categories A-M)
- [ ] Detailed findings for each A-M category
- [ ] Upstream/Downstream Impact Map
- [ ] Testing Gaps Table
- [ ] Backward Compatibility Analysis Table (Category M)
- [ ] Final Recommendation with blocking issues list

### DO NOT:

- ❌ Provide narrative-only reviews without tables
- ❌ Skip any of the 13 categories (A-M)
- ❌ Use bullet lists for findings (use tables)
- ❌ Skip the Executive Summary
- ❌ Omit line number links for issues
- ❌ Skip the final recommendation

### Table Column Requirements:

**Critical Issues Table**:
- # | Issue | File | Category | Impact | Risk | Fix

**High Priority Table**:
- # | Issue | File | Category | Impact | Risk | Recommendation

**Medium Priority Table**:
- # | Issue | File | Category | Type | Recommendation

**Low Priority Table**:
- # | Suggestion | File | Category | Benefit

**Categorical Summary**:
- Category | Name | Status | Issues | Critical | Notes

**Backward Compatibility**:
- # | Issue | Type | Affected Clients | Migration Path | Risk

**Testing Gaps**:
- Test Type | Count | Scenarios | Priority
```

---

### Change 3: Enhance response-templates.md with Example

**File**: `.github/instructions/pd/skills/reviewnet/response-templates.md`

**Action**: Add concrete example after Template B definition

**Addition**:
```markdown

### Template B Example Output

```markdown
## 📊 EXECUTIVE SUMMARY

| Metric | Count | Status |
|--------|-------|--------|
| Total Files Changed | 3 | ℹ️ |
| Critical Issues | 1 | 🔴 Blocks Merge |
| High Priority Issues | 2 | 🟠 Production Risk |
| Medium Priority Issues | 3 | 🟡 Tech Debt |
| Low Priority Suggestions | 2 | 🟢 Enhancement |
| Breaking Changes Detected | Yes | ⚠️ |
| Backward Compatibility Issues | 1 | ⚠️ |
| Impacted Endpoints | 4 | 📍 |

---

## 🔴 CRITICAL ISSUES (BLOCKS MERGE)

| # | Issue | File | Category | Impact | Risk | Fix |
|---|-------|------|----------|--------|------|-----|
| 1 | Null reference potential on extraDetails access | [UpgradeInfoMapper.cs](path#L26) | G | Downstream | NullRef | Add null check before access |

---

## 📊 CATEGORICAL VALIDATION (A-M)

| Category | Name | Status | Issues | Critical | Notes |
|----------|------|--------|--------|----------|-------|
| A | Async/Await | ➖ | 0 | 0 | N/A - no async methods |
| B | WCF Patterns | ➖ | 0 | 0 | N/A - mapper class |
| C | Dependency Injection | ✅ | 0 | 0 | Not applicable |
| D | Logging | 🟡 | 1 | 0 | Missing business rule logging |
| E | Collections | ✅ | 0 | 0 | Proper DTO usage |
| F | NHibernate | ➖ | 0 | 0 | N/A - not data layer |
| G | Code Quality | ⚠️ | 2 | 1 | Null safety issue + missing docs |
| H | Test Coverage | 🟡 | 1 | 0 | No unit tests visible in PR |
| I | Security | ✅ | 0 | 0 | No security concerns |
| J | Performance | ✅ | 0 | 0 | No performance issues |
| K | Breaking Changes | ⚠️ | 1 | 0 | Behavioral change detected |
| L | Impacted Endpoints | 🟡 | 0 | 0 | Reservation retrieval endpoints |
| M | Backward Compatibility | ⚠️ | 1 | 0 | Response structure may differ |

---

### **G - Code Quality**
- [x] Follow SynXis C# coding standards
- [ ] No code duplication (DRY)
- [x] Cyclomatic complexity reasonable (<10)
- [x] Magic numbers replaced with constants
- [ ] Proper null-handling patterns (`?.`, `??`)
- [ ] SOLID principles followed

**Status**: ⚠️ FAIL  
**Issues Found**: 2 | **Critical**: 1

**Findings**:
1. **Critical**: Line 26 accesses `extraDetails` without null check (potential NullReferenceException)
2. **Medium**: Missing XML documentation comments on public method

---

## 🎯 RECOMMENDATION

**MERGE WITH CAUTION ⚠️**

**Blocking Issues**: 1  
**Must Fix Before Merge**:
1. Add null safety check on extraDetails access at line 26

**Estimated Remediation Effort**: 15 minutes
```
```

---

### Change 4: Create Missing router-contract.md

**File**: `.github/instructions/pd/shared/router-contract.md` (NEW)

**Content**:
```markdown
# Progressive Disclosure Router Contract

## Authoritative Guard Rules

### Rule 1: Single Primary File
- Load ONE primary concern file per skill invocation
- Never load all guide files at once
- Default to overview/manifest before deep files

### Rule 2: Nested Loading Conditions
- Load nested files ONLY when:
  - User explicitly requests deep analysis
  - Initial analysis returns low confidence
  - Blocking issues found requiring detailed remediation
  - Multiple domain areas detected (compound skill)

### Rule 3: Response Template Enforcement
- All skills MUST reference their response template
- Output format is NOT optional
- Template structure is mandatory, not suggested

### Rule 4: Ambiguity Resolution
- If intent unclear, ask ONE clarifying question
- Do not load files speculatively
- Do not search workspace before classifying intent

### Rule 5: Skill Routing Priority
1. Explicit skill commands (tax, ohip, architect, reviewnet)
2. Pattern-matched intents (review pr, design, ask)
3. Fallback to ask/discover only if no skill matches

## ReviewNet Specific Rules

### PR Review Default Path
```
"review pr <number>" (no modifiers)
  ↓
Load: manifest.md
  ↓
Classify: triggers.md → "full review route"
  ↓
Route: loading-rules.md → comprehensive review
  ↓
Execute: codenova-comprehensive-pr-review.prompt.md
  ↓
Format: Template B (response-templates.md)
```

### Quick Review Path
```
"review pr <number> quick" OR "review pr <number> checklist"
  ↓
Load: manifest.md
  ↓
Classify: triggers.md → "checklist route"
  ↓
Route: loading-rules.md → quick checklist
  ↓
Execute: PR_CHECKLIST.md (future)
  ↓
Format: Template A (response-templates.md)
```

### Escalation Path
```
Quick checklist finds blockers
  ↓
Escalate: nested-loads.md → comprehensive review
  ↓
Execute: codenova-comprehensive-pr-review.prompt.md
  ↓
Format: Template B
```
```

---

### Change 5: Update Domain Skill Routing Section

**File**: `.github/instructions/codenova.instructions.md`

**Current**:
```markdown
- C# standards review intent -> `codenova.task` -> `review-synxis-guidelines` or `review-synxis-checklist` **via progressive-disclosure**
```

**Change to**:
```markdown
- PR/code review intent -> `codenova.task` -> `reviewnet-skill` **via progressive-disclosure** (comprehensive review by default, checklist if "quick" specified)
- C# standards review intent -> `codenova.task` -> `reviewnet-skill` **via progressive-disclosure**
```

**Add new bullet**:
```markdown
- `.github/prompts/codenova-comprehensive-pr-review.prompt.md` (loaded via reviewnet-skill progressive disclosure)
```

---

## Implementation Checklist

- [ ] Update codenova.instructions.md intent mapping table
- [ ] Add MANDATORY OUTPUT FORMAT section to comprehensive prompt
- [ ] Enhance response-templates.md with concrete example
- [ ] Create router-contract.md in pd/shared/
- [ ] Update domain skill routing section in codenova.instructions.md
- [ ] Test with: `codenova, review pr 10757`
- [ ] Verify Template B output with all 13 categories
- [ ] Validate table formatting
- [ ] Confirm file links with line numbers
- [ ] Check final recommendation presence

---

## Expected Result After Changes

When a user executes: `codenova, review pr 10757`

**Progressive Disclosure Flow**:
1. ✅ Load reviewnet/manifest.md
2. ✅ Classify via reviewnet/triggers.md → "full review route"
3. ✅ Route via reviewnet/loading-rules.md → comprehensive
4. ✅ Execute codenova-comprehensive-pr-review.prompt.md
5. ✅ Format via Template B (response-templates.md)

**Output Structure**:
- ✅ Executive Summary Table
- ✅ Critical/High/Medium/Low Issues Tables
- ✅ Categorical Summary Table (A-M)
- ✅ Detailed findings for all 13 categories
- ✅ Impact Map
- ✅ Testing Gaps
- ✅ Backward Compatibility Analysis
- ✅ Final Recommendation

**No More**:
- ❌ Free-form narrative reviews
- ❌ Direct tool usage without progressive disclosure
- ❌ Missing categories
- ❌ Non-table output
