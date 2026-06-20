import { NextResponse } from "next/server";
import { deleteCompany, MasterDataError, updateCompany } from "@/lib/admin/administration";
import { getCurrentAdminSession } from "@/lib/admin/session";

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

  const body = await request.json().catch(() => null);

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
