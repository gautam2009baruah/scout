---
description: "ISF Instructions Guide ⚡ what instruction files are, how they work, and how to author them correctly. Loaded when working in the .github/instructions context."
applyTo: ".github/instructions/**"
---

# 🤖 ISF Instructions Guide

> **Part of:** ISF ⚡ Intelligent Agent Skill Framework  
> **Companion:** `.github/prompts/isf-prompts-guide.md` ⚡ the equivalent guide for prompt files  
> **Governance:** `isf/isf-framework.md` ⚡ full authoring rules and file placement decision tree

---

## What Is an Instruction File?

An instruction file (`.instructions.md`) is a **declarative context file** that GitHub Copilot and CodeNova automatically inject into the AI agent's context window ⚡ when and only when the scoped file pattern matches.

Think of it as a **rulebook that wires itself in exactly when needed** and stays silent otherwise.

Instructions files live in `.github/instructions/` and are the backbone of ISF. They define:
- **What the agent is** (identity, capabilities, and response tone ⚡ `copilot-instructions.md`)
- **How it routes commands** (priority order, skill dispatch ⚡ `codenova.instructions.md`)
- **What it knows instantly** (lookup table, no tool calls ⚡ `codenova.bridge`)
- **How it writes code** (language standards ⚡ `net-standards.instructions.md`)
- **How it authors skills** (ISF governance ⚡ `isf/isf-framework.md`)

> **Tone governance:** `copilot-instructions.md` also declares response style ⚡ brevity, formatting conventions, and communication preferences. This maps to the "tone" dimension of the GitHub instructions model.

> **Tone governance:** `copilot-instructions.md` also declares response style ⚡ brevity, formatting conventions, and communication preferences. This maps to the "tone" dimension of the GitHub instructions model.

---

## ⚡ The GUIDE Principle

Every instruction file in ISF follows the **GUIDE** principle ⚡ a 5-point test any instruction file must pass before being considered well-formed.

```
G ⚡ Govern routing     Declares intent-to-executor mappings. Never raw tool calls.
U ⚡ Uniform scoping    applyTo targets exactly the right context. Not "**" unless truly global.
I ⚡ Inject minimally   Contains only what the agent needs for this scope. No tutorials.
D ⚡ Declare, don't do  Describes triggers and rules. Execution logic goes in .prompt.md files.
E ⚡ Extract when long  Any block >15 lines describing a procedure â†’ extract to .prompt.md.
```

If your instruction file violates any GUIDE point, it is injecting more than it should.

---

## The 4 Tiers of Instructions Files

ISF uses 4 tiers of instruction files, each with a different scope and purpose:

| Tier | File | `applyTo` | Injected When |
|---|---|---|---|
| **1 ⚡ Always-on** | `copilot-instructions.md`, `codenova.bridge` | `**` | Every single turn in the workspace |
| **2 ⚡ Language-scoped** | `net-standards.instructions.md` | `**/*.cs` | Any turn where a `.cs` file is active |
| **3 ⚡ ISF-scoped** | `isf/isf-framework.md` | `.github/instructions/isf/**` | Only when working inside the ISF folder |
| **4 ⚡ Guide files** | `isf-instructions-guide.md` (this file) | `.github/instructions/**` | Only when working in the instructions folder |

> **Rule:** Use the narrowest `applyTo` possible. Every tier-1 file costs tokens on every turn. Tier-3 and Tier-4 files are free until their context fires.

> **ISF extends the GitHub model:** The GitHub instructions model treats all instruction files as session-global. ISF adds scoped-persistence ⚡ tiers 2–4 inject only when their `applyTo` context is active. This is a deliberate token-efficiency design, not a misconfiguration. See `isf/isf-mvp-roadmap.md` Gap 1.

> **ISF extends the GitHub model:** The GitHub instructions model treats all instruction files as session-global. ISF adds scoped-persistence ⚡ tiers 2–4 inject only when their `applyTo` context is active. This is a deliberate token-efficiency design, not a misconfiguration. See `isf/isf-mvp-roadmap.md` Gap 1.

---

## Anatomy of an Instruction File

```markdown
---
description: "One sentence ⚡ what this file does and when it loads."
applyTo: "glob/pattern/**"
---

  Title

   Section 1 ⚡ Short declarative rules
(Table format preferred. No narratives.)

   Section 2 ⚡ Trigger mappings
(Intent pattern â†’ executor. Not step-by-step procedures.)

â†’ Full protocol: `.github/prompts/<name>.prompt.md`
(One line replaces any >15-line procedural block.)
```

### Frontmatter Rules

| Field | Required | Rule |
|---|---|---|
| `description` | âœ… Yes | One sentence. Shown in VS Code UI. Makes loading intent visible. |
| `applyTo` | âœ… Yes | Must be the narrowest glob that correctly scopes this file. Never omit. |
| `mode` | âŒ No | Only used in `.prompt.md` files ⚡ not instruction files. |

---

## Benefits of ISF Instruction Files

| Without ISF instructions | With ISF instructions |
|---|---|
| Agent crawls workspace on every ask | Agent resolves from STM in 0 tool calls for known keys |
| Raw `grep_search` is the first move | Intent routing fires before any tool call |
| Coding standards repeated in every answer | `net-standards.instructions.md` auto-injected for `.cs` files only |
| Domain knowledge embedded in chat turns | Skill assets loaded on demand via skill index |
| No governance ⚡ anyone adds anything | GUIDE principle + `isf-framework.md` enforce quality gates |

---

## Outcomes ISF Instructions Deliver

1. **Near-zero baseline token cost** ⚡ only tier-1 files inject on every turn; everything else is scoped
2. **Deterministic routing** ⚡ every command follows a declared path ⚡ no ad-hoc improvisation
3. **Consistent code quality** ⚡ `net-standards.instructions.md` applies the same rules every time, automatically
4. **Skill accuracy** ⚡ STM lookup confirms known answers instantly; skill assets provide indexed depth
5. **Auditable governance** ⚡ every instruction file declares its own scope; nothing is hidden

---

## Governance ⚡ What Belongs Here vs. Elsewhere

| Content Type | Where It Goes |
|---|---|
| Acronym / lookup key / short mapping | `codenova.bridge` (STM ⚡ max 200 lines, always-on) |
| Command routing rules and intent triggers | `codenova.instructions.md` |
| Step-by-step execution protocol (>15 lines) | `.github/prompts/<name>.prompt.md` |
| Domain knowledge (tax, OHIP, etc.) | `isf/<skill>/` ⚡ indexed via `*.skillindex` |
| Language coding standards | `net-standards.instructions.md` (scoped to `**/*.cs`) |
| ISF authoring rules | `isf/isf-framework.md` (scoped to `isf/**`) |
| This overview | `isf-instructions-guide.md` (scoped to `instructions/**`) |

> **Anti-pattern:** Putting a full dispatch protocol inside an instruction file. The instruction file declares the trigger; the prompt file executes the protocol. One line in, full protocol out.

---

## ⚡ Quick Self-Check Before Committing an Instruction File

```
âœ…  Does it have a description and applyTo?
âœ…  Is applyTo the narrowest correct scope?
âœ…  Does it contain only rules, triggers, and mappings ⚡ not step-by-step procedures?
âœ…  Are all blocks longer than 15 lines extracted to a .prompt.md?
âœ…  Is it free of code templates, curl examples, and prose tutorials?
âœ…  Does it pass the GUIDE test (Govern, Uniform, Inject minimally, Declare, Extract)?
```

---

## How This Fits in ISF

```
ISF Architecture
  â”‚
  â”œâ”€â”€ Instructions layer  â† YOU ARE HERE
  â”‚     Instructions files are the always-on and selectively-on layer.
  â”‚     They are the wiring harness ⚡ they connect user intent to execution paths.
  â”‚
  â”œâ”€â”€ Prompts layer       â† .github/prompts/*.prompt.md
  â”‚     Loaded on demand when skill intent fires.
  â”‚     Contain the step-by-step protocols too long for instruction files.
  â”‚
  â”œâ”€â”€ Skill index layer   â† isf/<skill>/*.skillindex
  â”‚     Lazy manifests ⚡ one match loads one asset. Never all at once.
  â”‚
  â””â”€â”€ Skill asset layer   â† isf/<skill>/*.md
        Domain knowledge. Only loaded when matched by skill index.
        Never injected globally.
```

The instructions layer is the **always-present contract**. Everything else in ISF exists because the instructions layer declared it should.
