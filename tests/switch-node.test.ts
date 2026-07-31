import assert from "node:assert/strict";
import test from "node:test";
import { executeSwitchNode } from "@/lib/orchestrations/nodes/switch-node";
import type { SwitchNodeConfig } from "@/shared/orchestrationTypes";

function config(overrides: Partial<SwitchNodeConfig> = {}): SwitchNodeConfig {
  return {
    type: "switch",
    variable: "{{request.status}}",
    routes: [
      { id: "draft", name: "Draft", operator: "equals", value: "draft" },
      { id: "approved", name: "Approved", operator: "equals", value: "approved" },
    ],
    ...overrides,
  };
}

test("switch follows the first matching route", async () => {
  const result = await executeSwitchNode(
    config({
      routes: [
        { id: "contains-app", name: "Contains app", operator: "contains", value: "app" },
        { id: "approved", name: "Approved", operator: "equals", value: "approved" },
      ],
    }),
    { request: { status: "approved" } }
  );

  assert.equal(result.success, true);
  assert.equal(result.outputHandle, "contains-app");
  assert.deepEqual(result.output?.switchResult, {
    variable: "{{request.status}}",
    matchedRouteId: "contains-app",
    matchedRouteName: "Contains app",
    usedDefault: false,
  });
});

test("switch follows Default when no route matches", async () => {
  const result = await executeSwitchNode(config(), { request: { status: "rejected" } });

  assert.equal(result.success, true);
  assert.equal(result.outputHandle, "default");
  assert.equal((result.output?.switchResult as Record<string, unknown>).usedDefault, true);
});

test("switch supports case-sensitive routes", async () => {
  const result = await executeSwitchNode(
    config({
      routes: [
        { id: "exact", name: "Exact", operator: "equals", value: "Approved", caseSensitive: true },
      ],
    }),
    { request: { status: "approved" } }
  );

  assert.equal(result.outputHandle, "default");
});

test("switch automatically converts numeric comparison values", async () => {
  const result = await executeSwitchNode(
    config({
      variable: "{{request.amount}}",
      routes: [
        { id: "high", name: "High value", operator: "greater_than", value: "1000", valueType: "auto" },
      ],
    }),
    { request: { amount: 2500 } }
  );

  assert.equal(result.outputHandle, "high");
});

test("switch rejects a missing variable expression", async () => {
  const result = await executeSwitchNode(config({ variable: "" }), {});

  assert.equal(result.success, false);
  assert.match(result.error || "", /variable is required/i);
});
