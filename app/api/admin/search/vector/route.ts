import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getSearchRoleIds, VectorSearchService } from "@/lib/search/vector-search";

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
    const roleIds = await getSearchRoleIds(companyId, session.user.id, session.user.roleId, session.user.isAdminRole);
    const results = await VectorSearchService.search(companyId, body.query, roleIds, topK, session.user.id);

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Vector search failed." },
      { status: 400 }
    );
  }
}
