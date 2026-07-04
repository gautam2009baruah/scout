# Compound Skill Routing

Use this only when one user message intentionally chains multiple domain skills.

## When To Use

- Two or more domain skills are explicitly named.
- Earlier skill output is needed as evidence for a later skill.
- Final user goal is a synthesis artifact, not separate parallel answers.

## Routing Shape

1. Choose the destination skill from the final deliverable.
2. Treat all earlier domain skills as supporting skills.
3. Run supporting skills in dependency order.
4. Pass only compact evidence packets forward.
5. Let the destination skill own the final answer.

## Supported Destination Outcomes

- Domain synthesis and cross-domain recommendation output.
- Impact analysis and blast-radius assessment output.
- Archon design outputs (deconstruct, AD2, ADR, stories).
- Defect implementation/fix handoff packets for execution-oriented flows.

## Destination Skill Selection

- `architect-skill`: deconstruct/design/ADR/story deliverables.
- `reviewnet`: impact analysis and standards-constrained remediation guidance.
- `ask` or execution task route: defect code implementation/fixing plans when user asks for code-change execution.

## Purpose Guard

- Use compound routing only for true dependency handoff, not for broad multi-topic Q&A.
- If one skill can satisfy the goal directly, do not invoke compound orchestration.
- If the destination artifact is unclear, ask one clarifying question before any deep load.

## Performance Guard

- Enforce one-pass support execution: each supporting skill runs once unless confidence is low.
- Do not run raw workspace search as a first move when a skill route is already high-confidence.
- Stop early if destination packet confidence is high and required constraints are present.
- Keep packet size small: summary <= 5 sentences, max 6 constraints, max 6 recommendations.

## Evidence Packet Shape

```json
{
  "skill": "tax-skill|ohip-skill|synxisnom-skill|reviewnet|architect-skill",
  "route": "selected route name",
  "summary": "3-5 sentence compact summary",
  "constraints": [],
  "risks": [],
  "recommended_changes": [],
  "confidence": "high|medium|low"
}
```

## Skill Ordering Rules

- Constraint or rule skills first: `tax`, `synxisnom`
- Domain implementation/discovery skills second: `ohip`
- Synthesis/design/review skill last: `architect`, `reviewnet`

## Bounded Load Rules

- Max 3 skills in one compound pass.
- Max 1 primary file per supporting skill initially.
- Destination skill may load its orchestrator after receiving support packets.
- If confidence is low after a supporting skill, allow one nested file for that skill only.
- Allow at most one retry cycle for a low-confidence supporting skill; then escalate with one focused question.

## Clarify Instead Of Guessing When

- Two destination skills are requested in one clause.
- The final artifact is unclear.
- Supporting skill evidence conflicts materially.

## Example

Input:
- `codenova, check tax logic that can be incorporated to ohip flows and archon deconstruct should take it as extra context`

Execution:
- `tax-skill` -> identify tax constraints and applicable logic
- `ohip-skill` -> map OHIP touchpoints and recommended changes using tax packet
- `architect-skill` -> deconstruct/design using tax + OHIP packets as upstream context