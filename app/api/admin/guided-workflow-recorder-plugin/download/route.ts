import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

function parseBrowser(input: string | null) {
  const raw = (input ?? "edge").trim().toLowerCase();
  if (!/^[a-z]+$/.test(raw)) {
    return null;
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.guidedWorkflows)) {
    return NextResponse.json({ message: "You do not have permission to download the recorder plugin." }, { status: 403 });
  }

  const browser = parseBrowser(request.nextUrl.searchParams.get("browser"));
  if (!browser) {
    return NextResponse.json({ message: "Invalid browser option." }, { status: 400 });
  }

  // scripts/build-extension.mjs writes each browser's build straight to a zip
  // (dist/<browser>.zip) — nothing is unpacked to disk, so this just serves
  // that file as-is instead of re-zipping a folder on every request.
  const zipPath = path.join(process.cwd(), "extension-training", "dist", `${browser}.zip`);
  const zip = await readFile(zipPath).catch(() => null);

  if (!zip) {
    const label = browser.charAt(0).toUpperCase() + browser.slice(1);
    return NextResponse.json({ message: `No ${label} plugin build was found. Please build that browser plugin first.` }, { status: 404 });
  }

  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="scout-recorder-plugin-${browser}.zip"`
    }
  });
}
