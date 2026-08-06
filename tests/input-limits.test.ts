import assert from "node:assert/strict";
import test from "node:test";
import {
  assertArrayLimit,
  assertCharacterLimit,
  assertSerializedByteLimit,
  exceedsCharacterLimit,
} from "../lib/validation/input-limits";
import { readJsonBody, RequestValidationError } from "../lib/validation/request";
import { mapDatabaseInputError } from "../lib/db/errors";
import { readFile } from "node:fs/promises";

test("character limits accept the boundary and reject boundary plus one", () => {
  assert.equal(exceedsCharacterLimit("a".repeat(32), 32), false);
  assert.equal(exceedsCharacterLimit("a".repeat(33), 32), true);
  assert.doesNotThrow(() => assertCharacterLimit("a".repeat(32), 32, "Name"));
  assert.throws(
    () => assertCharacterLimit("a".repeat(33), 32, "Name"),
    /Name must be 32 characters or fewer\./,
  );
});

test("character limits count Unicode code points instead of UTF-16 code units", () => {
  assert.equal(exceedsCharacterLimit("😀".repeat(32), 32), false);
  assert.equal(exceedsCharacterLimit("😀".repeat(33), 32), true);
});

test("array and serialized JSON limits reject oversized values", () => {
  assert.doesNotThrow(() => assertArrayLimit([1, 2], 2, "Items"));
  assert.throws(() => assertArrayLimit([1, 2, 3], 2, "Items"), /Items must contain 2 items or fewer\./);
  assert.doesNotThrow(() => assertSerializedByteLimit({ value: "ok" }, 32, "Metadata"));
  assert.throws(() => assertSerializedByteLimit({ value: "x".repeat(40) }, 32, "Metadata"), /Metadata must be 32 bytes or fewer\./);
});

test("JSON request reader accepts valid bodies and rejects invalid or oversized bodies", async () => {
  const valid = new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ ok: true }) });
  assert.deepEqual(await readJsonBody(valid, 64), { ok: true });

  const invalid = new Request("http://localhost/test", { method: "POST", body: "{" });
  await assert.rejects(() => readJsonBody(invalid, 64), (error: unknown) => {
    return error instanceof RequestValidationError && error.statusCode === 400;
  });

  const oversized = new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) });
  await assert.rejects(() => readJsonBody(oversized, 32), (error: unknown) => {
    return error instanceof RequestValidationError && error.statusCode === 413;
  });
});

test("database input errors map to safe client responses", () => {
  assert.deepEqual(mapDatabaseInputError({ code: "22001", detail: "sensitive column detail" }), {
    message: "One or more values exceed the allowed length.",
    statusCode: 400,
  });
  assert.deepEqual(mapDatabaseInputError({ code: "22003" }), {
    message: "One or more numeric values are outside the allowed range.",
    statusCode: 400,
  });
  assert.deepEqual(mapDatabaseInputError({ code: "23514" }), {
    message: "One or more values violate an input constraint.",
    statusCode: 400,
  });
  assert.equal(mapDatabaseInputError(new Error("internal connection failure")), null);
});

test("input constraint migration is deployment-compatible with legacy rows", async () => {
  const sql = await readFile(new URL("../db/migrations/007_input_length_constraints.sql", import.meta.url), "utf8");
  const constraints = sql.match(/ADD CONSTRAINT/g) ?? [];
  const notValidConstraints = sql.match(/CHECK \([\s\S]*?\) NOT VALID/g) ?? [];
  assert.ok(constraints.length >= 30);
  assert.equal(notValidConstraints.length, constraints.length);
});
