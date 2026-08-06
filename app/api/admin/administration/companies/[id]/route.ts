import { NextResponse } from "next/server";
import { deleteCompany, MasterDataError, updateCompany } from "@/lib/admin/administration";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { readJsonBody, REQUEST_BODY_LIMITS, RequestValidationError } from "@/lib/validation/request";
import { mapDatabaseInputError } from "@/lib/db/errors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await readJsonBody<Record<string, unknown>>(request, REQUEST_BODY_LIMITS.adminJson);
  } catch (error) {
    if (error instanceof RequestValidationError) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    throw error;
  }

  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ message: "Company name is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const company = await updateCompany(
      id,
      {
        name: body.name,
        slug: typeof body.slug === "string" ? body.slug : undefined
      },
      session
    );

    return NextResponse.json({ company });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    const databaseError = mapDatabaseInputError(error);
    if (databaseError) return NextResponse.json({ message: databaseError.message }, { status: databaseError.statusCode });

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteCompany(id, session);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
