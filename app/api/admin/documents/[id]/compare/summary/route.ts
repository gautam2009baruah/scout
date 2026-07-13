import { NextResponse } from "next/server";
import { DocumentError, generateDocumentVersionChangeSummary } from "@/lib/admin/documents";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseVersion(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const fromVersion = parseVersion(body?.fromVersion ?? body?.from);
  const toVersion = parseVersion(body?.toVersion ?? body?.to);

  if (!fromVersion || !toVersion) {
    return NextResponse.json({ message: "fromVersion and toVersion are required positive integers." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const result = await generateDocumentVersionChangeSummary(id, fromVersion, toVersion, session);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    const message = error instanceof Error ? error.message : "Unable to generate summary.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
