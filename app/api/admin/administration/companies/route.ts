import { NextResponse } from "next/server";
import { createCompany, MasterDataError } from "@/lib/admin/administration";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ message: "Company name is required." }, { status: 400 });
  }

  try {
    const company = await createCompany(
      {
        name: body.name,
        slug: typeof body.slug === "string" ? body.slug : undefined
      },
      session
    );

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
