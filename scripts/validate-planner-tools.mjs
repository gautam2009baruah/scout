// Validates config/planner-tools.json against config/node-catalog.json.
// Run with: node scripts/validate-planner-tools.mjs
//
// Checks:
//   1. Every tool has name, description, and a syntactically valid JSON-Schema-shaped input_schema
//      (type "object", properties is an object, required (if present) is an array of strings that
//      are all actual keys in properties).
//   2. No duplicate tool names.
//   3. Every catalog inputSchema entry marked required:true (excluding the "type" discriminant,
//      which is intentionally omitted from the tool schema) appears in the matching tool's
//      input_schema.required array.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const toolsPath = path.join(root, "config", "planner-tools.json");
const catalogPath = path.join(root, "config", "node-catalog.json");

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

async function loadJson(filePath, label) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    fail(`Could not read ${label} at ${filePath}: ${error.message}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function validateToolShape(tool, index) {
  const label = `tools[${index}]${tool && typeof tool.name === "string" ? ` ("${tool.name}")` : ""}`;

  if (typeof tool !== "object" || tool === null || Array.isArray(tool)) {
    fail(`${label}: entry is not an object`);
    return;
  }

  if (typeof tool.name !== "string" || tool.name.trim() === "") {
    fail(`${label}: missing or empty "name"`);
  }

  if (typeof tool.description !== "string" || tool.description.trim() === "") {
    fail(`${label}: missing or empty "description"`);
  }

  const schema = tool.input_schema;
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    fail(`${label}: missing or invalid "input_schema"`);
    return;
  }

  if (schema.type !== "object") {
    fail(`${label}: input_schema.type must be "object" (got ${JSON.stringify(schema.type)})`);
  }

  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    fail(`${label}: input_schema.properties must be an object`);
    return;
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required)) {
      fail(`${label}: input_schema.required must be an array when present`);
    } else {
      for (const key of schema.required) {
        if (typeof key !== "string") {
          fail(`${label}: input_schema.required contains a non-string entry (${JSON.stringify(key)})`);
          continue;
        }
        if (!(key in properties)) {
          fail(`${label}: input_schema.required lists "${key}", which is not a key in input_schema.properties`);
        }
      }
    }
  }
}

function checkDuplicateNames(tools) {
  const seen = new Map();
  for (const tool of tools) {
    if (typeof tool?.name !== "string") continue;
    seen.set(tool.name, (seen.get(tool.name) ?? 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      fail(`Duplicate tool name "${name}" appears ${count} times`);
    }
  }
}

function crossCheckRequiredFields(tools, catalog) {
  const toolsByName = new Map();
  for (const tool of tools) {
    if (typeof tool?.name === "string") toolsByName.set(tool.name, tool);
  }

  for (const entry of catalog) {
    const nodeType = entry?.type;
    if (typeof nodeType !== "string") {
      warn(`Catalog entry "${entry?.name ?? "?"}" has no "type" — skipped in cross-check`);
      continue;
    }

    const tool = toolsByName.get(nodeType);
    if (!tool) {
      fail(`Catalog node type "${nodeType}" has no matching tool in planner-tools.json`);
      continue;
    }

    const requiredArray = Array.isArray(tool.input_schema?.required) ? tool.input_schema.required : [];
    const requiredSet = new Set(requiredArray);

    const catalogFields = Array.isArray(entry.inputSchema) ? entry.inputSchema : [];
    for (const field of catalogFields) {
      if (field.field === "type") continue; // discriminant, intentionally omitted from tool schema
      if (field.required !== true) continue;

      if (!requiredSet.has(field.field)) {
        fail(
          `Tool "${nodeType}": catalog field "${field.field}" is required:true but missing from ` +
            `input_schema.required (got [${requiredArray.join(", ")}])`
        );
      }
    }
  }

  // Flag tools with no catalog counterpart (not a failure — just informational).
  const catalogTypes = new Set(catalog.map((e) => e?.type).filter((t) => typeof t === "string"));
  for (const name of toolsByName.keys()) {
    if (!catalogTypes.has(name)) {
      warn(`Tool "${name}" has no matching entry in node-catalog.json`);
    }
  }
}

async function main() {
  const tools = await loadJson(toolsPath, "config/planner-tools.json");
  const catalog = await loadJson(catalogPath, "config/node-catalog.json");

  if (tools === null || catalog === null) {
    printSummary();
    process.exit(1);
  }

  if (!Array.isArray(tools)) {
    fail("config/planner-tools.json must be a JSON array");
  } else {
    tools.forEach(validateToolShape);
    checkDuplicateNames(tools);
  }

  if (!Array.isArray(catalog)) {
    fail("config/node-catalog.json must be a JSON array");
  } else if (Array.isArray(tools)) {
    crossCheckRequiredFields(tools, catalog);
  }

  printSummary();
  process.exit(failures.length > 0 ? 1 : 0);
}

function printSummary() {
  console.log("\n--- validate-planner-tools ---");
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s):`);
    for (const f of failures) console.log(`  x ${f}`);
    console.log("\nFAIL");
  } else {
    console.log("\nAll checks passed.");
    console.log("PASS");
  }
}

main();
