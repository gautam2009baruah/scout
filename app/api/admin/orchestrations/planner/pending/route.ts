// Step 7b: admin "Pending AI plans" queue listing.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { listPendingPlanRequests } from "@/lib/orchestrations/planner/pending-requests";

export async function GET(request: NextRequest) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const result = await listPendingPlanRequests({
      companyId: session.user.tenantId,
      targetAppId: searchParams.get("targetAppId"),
      environmentId: searchParams.get("environmentId"),
      requestedFrom: searchParams.get("requestedFrom"),
      requestedTo: searchParams.get("requestedTo"),
      page: searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : undefined,
      pageSize: searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!, 10) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error listing pending AI plan requests:", error);
    return NextResponse.json({ message: "Failed to list pending requests" }, { status: 500 });
  }
}
