import { NextResponse } from "next/server";
import { deleteDocument, DocumentError, getDocumentById, updateDocument } from "@/lib/admin/documents";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function requireSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return { response: NextResponse.json({ message: "Authentication required." }, { status: 401 }) };
  }

  return { session };
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const document = await getDocumentById(id, auth.session);

    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ message: "Document update payload is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const document = await updateDocument(
      id,
      {
        name: typeof body.name === "string" ? body.name : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : body.errorMessage === null ? null : undefined,
        storagePath: typeof body.storagePath === "string" ? body.storagePath : body.storagePath === null ? null : undefined,
        version: typeof body.version === "number" ? body.version : undefined
      },
      auth.session
    );

    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    await deleteDocument(id, auth.session);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
