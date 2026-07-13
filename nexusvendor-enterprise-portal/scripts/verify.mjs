import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const data = await readFile(join(root, "data.js"), "utf8");
const app = await readFile(join(root, "app.js"), "utf8");
const workflow = await readFile(join(root, "workflow.js"), "utf8");
const docs = await readdir(join(root, "public", "documents"));
const index = JSON.parse(await readFile(join(root, "public", "documents", "index.json"), "utf8"));
const failures = [];
const moduleCount = (data.match(/\["[a-z-]+",\s*"[^"]+",\s*"[a-z]+"\]/g) || []).length;
if (moduleCount < 15) failures.push(`Expected at least 15 modules, found ${moduleCount}`);
if (!app.includes("function sid(")) failures.push("Stable ID helper is missing");
if (app.includes("Math.random") || app.includes("randomUUID")) failures.push("Random ID generation is prohibited");
if (workflow.includes("Math.random") || workflow.includes("randomUUID")) failures.push("Workflow uses random ID generation");
for (const stableId of ["nv-workflow-vendor-name", "nv-workflow-vendor-id", "nv-workflow-onboarding-case-id", "nv-workflow-procurement-request-id", "nv-workflow-rfp-id", "nv-workflow-purchase-order-id"]) {
  if (!workflow.includes(stableId)) failures.push(`Missing shared stable ID: ${stableId}`);
}
if (!workflow.includes('localStorage.setItem(KEY')) failures.push("Cross-page workflow persistence is missing");
if (docs.filter(name => name.endsWith(".md")).length < 300) failures.push("Expected at least 300 Markdown documents");
if (index.count !== 300) failures.push(`Document index count is ${index.count}, expected 300`);
if (index.documents.some(document => document.word_count < 500)) failures.push("One or more documents are too short for useful RAG training");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`Verified ${moduleCount} modules, deterministic IDs, and ${index.count} substantive documents.`);
