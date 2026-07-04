---
description: "ISF MVP Roadmap and GitHub model alignment gaps. Reference when planning ISF improvements or onboarding contributors to the framework."
applyTo: ".github/instructions/isf/**"
---

#  ISF  MVP Roadmap & GitHub Model Alignment

> **Part of:** ISF  Intelligent Agent Skill Framework  
> **Governance:** `isf-framework.md`  authoring rules and file placement decision tree  
> **Last Updated:** April 3, 2026

---

##  Section 1  GitHub Model Alignment Gaps

ISF intentionally extends the GitHub Copilot instructions/prompts model. This section documents where ISF **diverges by design** and where genuine gaps exist that should be closed.

### The Core GitHub Model (Reference)

| Concept | GitHub Definition |
|---|---|
| **Instructions** | The agent's "personality"  persistent rules injected on every request. Behavior, tone, coding standards. |
| **Prompts** | On-demand tasks  explicitly called to perform a one-time action (scaffold, fix, generate). |

| Feature | Instructions | Prompts |
|---|---|---|
| When they run | Automatically on every request | Only when explicitly called |
| Duration | Persistent across session/workspace | Transient  one interaction |
| Best for | Global rules, architecture standards, "never do X" | Reusable workflows, multi-step tasks |
| Control | Developer-managed "constitution" | User-controlled for immediate results |

---

###  Gap 1  Tiers 24 Are Scoped-Persistent (Intentional Deviation) `[DOCUMENTED]`

**GitHub model:** All instructions are session-global.  
**ISF behavior:** Tiers 24 inject only when their `applyTo` scope matches the active file.

This is a deliberate token-efficiency design. `net-standards.instructions.md` only fires when a `.cs` file is open. `isf-framework.md` only fires inside the ISF folder.

> **ISF rule:** Use the narrowest `applyTo` possible. Only Tier 1 files (`applyTo: "**"`) are truly session-global.

**Status:**  Documented in `isf-instructions-guide.md` (4-tier table note)

---

###  Gap 2  Reference Prompt Files Are Not Executable Tasks (Intentional Deviation) `[DOCUMENTED]`

**GitHub model:** Prompts are reusable workflows and one-time task executors.  
**ISF behavior:** `isf-framework.prompt.md` and `isf-prompts-guide.md` are **reference protocols**  loaded on architectural discussion intent, not task execution.

ISF adds a **reference-protocol subtype** for prompt files that serve as passive architectural references rather than implementation executors. They still satisfy CHAIN (no `applyTo`, intent-triggered, on-demand) but do not produce code output.

**Status:**  Documented in `isf-prompts-guide.md` (reference-protocol subtype note)

---

###  Gap 3  Tone Governance Not Explicitly Declared `[CLOSED]`

**GitHub model:** Instructions define behavior, tone, and coding standards.  
**ISF gap:** `isf-instructions-guide.md` listed identity, routing, knowledge, and standards  but omitted tone.

ISF's tone governance lives in `copilot-instructions.md` (brevity, response style, formatting). It was undocumented in the instructions guide.

**Status:**  Closed  added explicit mention in `isf-instructions-guide.md` "What Is an Instruction File?" section

---

###  Gap 4  User Control Is Intent-Dispatched, Not Slash-Command `[DOCUMENTED]`

**GitHub model:** Prompts are user-controlled via explicit `/slash-command` invocation.  
**ISF behavior:** Users invoke `codenova, ...` commands; the routing layer resolves which prompt fires internally. The end-user never names a `.prompt.md` file directly.

This is a deliberate UX design  prompt internals are hidden from the user; they interact only with the `codenova` command surface.

**Status:**  Documented in `isf-prompts-guide.md` (CHAIN **I** note)

---

###  Gap 5  `codenova.bridge` Extension Warning `[MONITOR]`

**Issue:** `codenova.bridge` has no `.instructions.md` extension after the rename. Copilot discovers instruction files by the `.instructions.md` extension pattern. The `applyTo: "**"` frontmatter is still present and currently respected, but this depends on Copilot's file discovery implementation.

**Risk:** If a Copilot update changes file discovery to require `.instructions.md` extension, `codenova.bridge` stops injecting silently  breaking Step 0 of every `deep-discover` execution.

**Mitigation options (in priority order):**
1. Monitor Copilot release notes for changes to instruction file discovery
2. If injection breaks: rename to `codenova.bridge.instructions.md` (keeps the "bridge" identity)
3. Fallback: restore `codenova.stm.instructions.md` with `"bridge"` in the description field only

**Status:**  Monitor  no action required today; re-evaluate if Step 0 BRAIN LOOKUP stops working

---

##  Section 2  MVP Roadmap

###  MVP 1  ISF Foundation Complete *(April 2026)*
**Deliverable:** OHIP and Tax skills fully operational at L5 maturity; ISF governance documented; all assets under `.github/instructions/isf/`  
**Status:**  Complete  
**Value:** 90%+ token reduction for known domain Q&A; consistent OHIP implementation pattern; self-healing tax documentation

---

###  MVP 2  Bridge Enrichment  Full SynXis Domain Coverage
**Deliverable:** Expand `codenova.bridge` with remaining domain acronyms and architecture flows  OXI, ARI, ChannelConnect (CHC), GDS (SDX/TDX), ICE, CPD, Shopping Engine  
**Target:** Bridge covers all live service domains without exceeding 200-line ceiling  
**Value:** BRIDGE 0 fast path resolves the majority of domain questions without any search or skill load; onboarding time for new developers reduced

---

###  MVP 3  ChannelConnect Skill (ISF Skill  5)
**Deliverable:** New skill under `isf/channelskill/` following the established ISF pattern  domain overview, action registry, implementation mode guides for new channel event types  
**Target:** L5 maturity from day one  
**Value:** Proves ISF is a repeatable pattern, not a one-off; ChannelConnect implementation time reduced by 6080% using the same mode-guided workflow as OHIP

---

###  MVP 4  ISF Skill Scaffold Command
**Deliverable:** `codenova, isf new-skill <name>`  generates the complete skill folder structure (`skillindex`, domain overview template, intel doc template, dispatch protocol stub) pre-wired into `codenova.instructions.md` and `.codenova-config.json`  
**Target:** New skill goes from concept to wired L3 skeleton in one command  
**Value:** Eliminates manual setup steps; enables any developer to contribute new domain knowledge without understanding the full wiring

---

###  MVP 5  ISF Drift Dashboard
**Deliverable:** `codenova, isf status`  cross-skill drift report: scans all `*.skillindex`-registered assets, runs identifier-based grep across relevant `.cs` namespaces, outputs accuracy / outdated / missing coverage per skill  
**Target:** Single command gives the team a real-time health check on all indexed domain knowledge  
**Value:** Turns knowledge maintenance from reactive to proactive; feeds directly into sprint planning when a domain has significant undocumented changes
