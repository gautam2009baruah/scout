import { NextResponse } from "next/server";
import { DocumentError, listDocumentVersions } from "@/lib/admin/documents";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await listDocumentVersions(id, session);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
