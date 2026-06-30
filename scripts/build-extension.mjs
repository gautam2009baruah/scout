import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const extensionRoot = path.join(root, "extension");
const src = path.join(extensionRoot, "src");
const joditRoot = path.join(root, "node_modules", "jodit", "es2021");
const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
const outputs = ["chrome", "edge"].map((browser) => path.join(extensionRoot, "dist", `${browser}-${stamp}`));

function stripImports(source) {
  return source
    .replace(/^import\s+type\s+[^;]+;\s*/gm, "")
    .replace(/^import\s+[^;]+;\s*/gm, "");
}

function stripExports(source) {
  return source
    .replace(/^export\s+type\s+\{[^}]+\};?\s*/gm, "")
    .replace(/\bexport\s+(?=(const|let|var|function|class|async function))/g, "");
}

async function readModule(file) {
  return stripExports(stripImports(await readFile(path.join(src, file), "utf8")));
}

async function bundle(files) {
  const source = (await Promise.all(files.map(readModule))).join("\n\n");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      strict: false
    }
  });

  return result.outputText;
}

const background = await bundle(["browserApi.ts", "background.ts"]);
const contentScript = await bundle([
  "controlIdentity.ts",
  "elementFinder.ts",
  "elementPicker.ts",
  "recorder.ts",
  "browserApi.ts",
  "contentScript.ts"
]);
const joditScript = await readFile(path.join(joditRoot, "jodit.fat.min.js"), "utf8");
const joditCss = await readFile(path.join(joditRoot, "jodit.fat.min.css"), "utf8");
const contentScriptWithEditor = [
  joditScript,
  `\nconst SCOUT_JODIT_CSS = ${JSON.stringify(joditCss)};\n`,
  contentScript
].join("\n");
const manifest = await readFile(path.join(extensionRoot, "manifest.json"), "utf8");

for (const output of outputs) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "manifest.json"), manifest);
  await writeFile(path.join(output, "background.js"), background);
  await writeFile(path.join(output, "contentScript.js"), contentScriptWithEditor);
}

console.log("Built extension bundles:");
for (const output of outputs) {
  console.log(`- ${path.relative(root, output)}`);
}
