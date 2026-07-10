import { NextResponse } from "next/server";
import {
  createCompanyTargetApplication,
  listCompanyTargetApplications,
  MasterDataError
} from "@/lib/admin/administration";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const apps = await listCompanyTargetApplications(session);
    return NextResponse.json({ apps });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.companyId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ message: "Company and target application name are required." }, { status: 400 });
  }

  try {
    const app = await createCompanyTargetApplication(
      {
        companyId: body.companyId,
        name: body.name,
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : ""
      },
      session
    );

    return NextResponse.json({ app }, { status: 201 });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
