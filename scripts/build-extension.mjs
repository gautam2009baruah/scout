import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const extensionRoot = path.join(root, "extension");
const src = path.join(extensionRoot, "src");
const joditRoot = path.join(root, "node_modules", "jodit", "es2021");
const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
// Must match the list the Workflow Training Setup download UI offers
// (components/admin/guided-workflow-training-setup.tsx `pluginBrowsers`) and the
// per-browser folder names the download route expects (`<browser>-<stamp>`).
const browsers = ["brave", "chrome", "edge", "firefox", "opera", "safari"];

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
const manifestText = await readFile(path.join(extensionRoot, "manifest.json"), "utf8");

// Chromium browsers (Chrome, Edge, Brave, Opera) and Safari use the standard
// MV3 manifest as-is. Firefox needs an event-page background (it doesn't run a
// Chromium service worker) plus a gecko id so it can be installed/signed.
function manifestFor(browser) {
  if (browser !== "firefox") {
    return manifestText;
  }
  const manifest = JSON.parse(manifestText);
  manifest.background = { scripts: ["background.js"] };
  manifest.browser_specific_settings = {
    gecko: { id: "scout-recorder@scout.app", strict_min_version: "115.0" }
  };
  return JSON.stringify(manifest, null, 2);
}

const zipCrcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function zipCrc32(buffer) {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    value = zipCrcTable[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

// Minimal "stored" (uncompressed) ZIP so a build can be uploaded/loaded without
// the download endpoint. Mirrors the encoder in the plugin download route.
function zipStore(files) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name);
    const content = file.content;
    const checksum = zipCrc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, content);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(dosTime, 12);
    entry.writeUInt16LE(dosDate, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(content.length, 20);
    entry.writeUInt32LE(content.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + content.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

const outputs = [];
for (const browser of browsers) {
  const output = path.join(extensionRoot, "dist", `${browser}-${stamp}`);
  outputs.push(output);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const files = [
    { name: "manifest.json", content: Buffer.from(manifestFor(browser)) },
    { name: "background.js", content: Buffer.from(background) },
    { name: "contentScript.js", content: Buffer.from(contentScriptWithEditor) }
  ];

  for (const file of files) {
    await writeFile(path.join(output, file.name), file.content);
  }
  await writeFile(path.join(extensionRoot, "dist", `${browser}-${stamp}.zip`), zipStore(files));
}

console.log("Built extension bundles:");
for (const output of outputs) {
  console.log(`- ${path.relative(root, output)}`);
}
