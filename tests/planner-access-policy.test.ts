// Step 8: policy-presence checks that can't be verified behaviorally without
// a real database and a real (currently-unimplemented) external-user access
// system. These are structural checks on the source itself — confirming the
// policy is actually written into the code — not proof of runtime behavior.
// Behavioral coverage lives in tests/planner-agent.test.ts (the pending-lock
// rejection is exercised there via the injectable getActivePendingPlanRequest
// dependency) and, for real matching queries, Step 5/7's live smoke-tested
// verification against the dev database (see conversation history — not
// something a unit test can reproduce without a live Postgres instance).

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const plannerDir = join(__dirname, "..", "lib", "orchestrations", "planner");

function readPlannerFile(fileName: string): string {
  return readFileSync(join(plannerDir, fileName), "utf8");
}

test("matching.ts's queries only ever consider matchable_without_validation = true orchestrations", () => {
  const source = readPlannerFile("matching.ts");

  // Both the pgvector and jsonb-fallback query paths (findTopMatchVector /
  // findTopMatchJson) must carry this filter independently — neither is a
  // fallthrough of the other. Matched against the actual SQL clause shape
  // (table-aliased, in an AND chain) so a mention in a doc comment above
  // doesn't inflate the count.
  const occurrences = source.match(/AND\s+o\.matchable_without_validation\s*=\s*true/g) ?? [];
  assert.equal(
    occurrences.length,
    2,
    "expected the matchable_without_validation = true filter in both findTopMatchVector and findTopMatchJson"
  );

  // And the published-only gate (a draft isn't "existing" in the sense of
  // ready-to-run — see Step 3b) is likewise present in both.
  const publishedOccurrences = source.match(/o\.status\s*=\s*'published'/g) ?? [];
  assert.equal(publishedOccurrences.length, 2, "expected the status = 'published' filter in both query paths");
});

test("every access-decision call site in the planner module goes through checkExternalUserAccess()", () => {
  const matchingSource = readPlannerFile("matching.ts");
  const agentSource = readPlannerFile("agent.ts");

  assert.match(
    matchingSource,
    /checkExternalUserAccess\(/,
    "findMatchingOrchestration must gate the existing-orchestration match path through checkExternalUserAccess()"
  );
  assert.match(
    agentSource,
    /checkExternalUserAccess\(/,
    "the drafting-acceptance path in handleTurn must gate through checkExternalUserAccess() too (Step 8)"
  );

  // Both import it from the single real seam rather than redefining/aliasing
  // their own copy — the whole point is a one-file swap later.
  for (const [name, source] of [["matching.ts", matchingSource], ["agent.ts", agentSource]] as const) {
    assert.match(
      source,
      /from ["']@\/lib\/chat\/access-validator["']/,
      `${name} must import checkExternalUserAccess from lib/chat/access-validator.ts, not an ad hoc equivalent`
    );
  }
});

test("checkExternalUserAccess() documents that it is not itself a safety control yet", () => {
  const source = readFileSync(join(__dirname, "..", "lib", "chat", "access-validator.ts"), "utf8");
  assert.match(
    source,
    /matchable_without_validation/,
    "the stub's doc comment should name the actual current safety controls (Step 8)"
  );
  assert.match(source, /admin-only drafting approval|Step 7b/i);
});
