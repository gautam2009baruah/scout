import { NextResponse } from "next/server";
import { compareDocumentVersions, DocumentError } from "@/lib/admin/documents";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseVersion(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const fromVersion = parseVersion(params.get("fromVersion") || params.get("from"));
  const toVersion = parseVersion(params.get("toVersion") || params.get("to"));

  if (!fromVersion || !toVersion) {
    return NextResponse.json({ message: "fromVersion and toVersion are required positive integers." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const comparison = await compareDocumentVersions(id, fromVersion, toVersion, session);
    return NextResponse.json({ comparison });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
