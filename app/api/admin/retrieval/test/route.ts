import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { RetrievalEngine } from "@/lib/search/retrieval-engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.query !== "string") {
    return NextResponse.json({ message: "Search query is required." }, { status: 400 });
  }

  const companyId = typeof body.company_id === "string" && body.company_id ? body.company_id : session.user.tenantId;
  const topK = Number(body.top_k ?? 10);

  try {
    const response = await RetrievalEngine.retrieve(companyId, session.user.id, body.query, topK);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Retrieval test failed." },
      { status: 400 }
    );
  }
}
