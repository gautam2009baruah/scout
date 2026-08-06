import { NextResponse } from "next/server";
import { createRole, MasterDataError } from "@/lib/admin/administration";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { readJsonBody, REQUEST_BODY_LIMITS, RequestValidationError } from "@/lib/validation/request";
import { mapDatabaseInputError } from "@/lib/db/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  const hasCompany =
    typeof body?.companyId === "string" ||
    (Array.isArray(body?.companyIds) && body.companyIds.some((value: unknown) => typeof value === "string"));

  if (!body || !hasCompany || typeof body.name !== "string") {
    return NextResponse.json({ message: "Company and role name are required." }, { status: 400 });
  }

  try {
    const role = await createRole(
      {
        companyId: typeof body.companyId === "string" ? body.companyId : undefined,
        companyIds: Array.isArray(body.companyIds)
          ? body.companyIds.filter((value: unknown): value is string => typeof value === "string")
          : undefined,
        name: body.name,
        isAdminRole: body.isAdminRole === true,
        description: typeof body.description === "string" ? body.description : undefined,
        moduleKeys: Array.isArray(body.moduleKeys)
          ? body.moduleKeys.filter((value: unknown): value is string => typeof value === "string")
          : []
      },
      session
    );

    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    const databaseError = mapDatabaseInputError(error);
    if (databaseError) return NextResponse.json({ message: databaseError.message }, { status: databaseError.statusCode });

    throw error;
  }
}
