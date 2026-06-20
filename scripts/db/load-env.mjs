import { readFile } from "node:fs/promises";
import { join } from "node:path";

const envFiles = [".env.local", ".env"];

for (const fileName of envFiles) {
  try {
    const file = await readFile(join(process.cwd(), fileName), "utf8");

    for (const line of file.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Missing env files are fine; deployment environments can provide variables directly.
  }
}
