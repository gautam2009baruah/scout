import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const playerSrc = path.join(root, "player");
const publicDir = path.join(root, "public");
const outputFile = path.join(publicDir, "scout-smart-adoption-player.js");

console.log("🔨 Building Scout Adoption Player...");

function stripImports(source) {
  return source
    .replace(/^import\s+type\s+[^;]+;\s*/gm, "")
    .replace(/^import\s+.*from\s+["']@\/shared\/guideTypes["'];?\s*/gm, "")
    .replace(/^import\s+.*from\s+["']\.\/types["'];?\s*/gm, "");
}

function stripExports(source) {
  return source
    .replace(/^export\s+type\s+\{[^}]+\};?\s*/gm, "")
    .replace(/\bexport\s+(?=(const|let|var|function|class|async function|type|interface))/g, "");
}

async function readModule(file) {
  const fullPath = path.join(playerSrc, file);
  const content = await readFile(fullPath, "utf8");
  return stripExports(stripImports(content));
}

async function bundle(files) {
  const modules = await Promise.all(files.map(readModule));
  const source = modules.join("\n\n");
  
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      strict: false,
      lib: ["ES2020", "DOM"],
    },
  });

  return result.outputText;
}

try {
  // Bundle player files in dependency order
  const bundled = await bundle([
    "types.ts",
    "elementFinder.ts",
    "tooltip.ts",
    "ruleBasedMatcher.ts",
    "aiMatcher.ts",
    "elementMetadataCapture.ts",
    "healingResolver.ts",
    "adoptionPlayer.ts",
  ]);

  // Wrap in IIFE to avoid global scope pollution
  const wrapped = `
/*! Scout Smart Adoption Player - Built ${new Date().toISOString()} */
(function() {
  'use strict';
  
${bundled}

  // Expose playGuide globally
  if (typeof window !== 'undefined') {
    window.ScoutAdoptionPlayer = {
      playGuide: playGuide,
      AdoptionPlayer: AdoptionPlayer,
      version: '${new Date().toISOString().slice(0, 10)}'
    };
  }
})();
`;

  await writeFile(outputFile, wrapped, "utf8");
  
  console.log("✅ Player built successfully!");
  console.log(`   Output: ${outputFile}`);
  console.log(`   Size: ${(wrapped.length / 1024).toFixed(2)} KB`);
} catch (error) {
  console.error("❌ Build failed:", error);
  process.exit(1);
}
