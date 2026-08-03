// Pending AI Plans page — "Archived Requests" tab listing (approved/rejected).

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { listResolvedPlanRequests } from "@/lib/orchestrations/planner/pending-requests";

export async function GET(request: NextRequest) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const statusParam = searchParams.get("status");
    const status = statusParam === "approved" || statusParam === "rejected" ? statusParam : "all";

    const result = await listResolvedPlanRequests({
      companyId: session.user.tenantId,
      targetAppId: searchParams.get("targetAppId"),
      environmentId: searchParams.get("environmentId"),
      status,
      resolvedFrom: searchParams.get("resolvedFrom"),
      resolvedTo: searchParams.get("resolvedTo"),
      page: searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : undefined,
      pageSize: searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error listing archived AI plan requests:", error);
    return NextResponse.json({ message: "Failed to list archived requests" }, { status: 500 });
  }
}
