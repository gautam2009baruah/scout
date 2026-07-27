// Step 7b: admin "Pending AI plans" queue listing.

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { listPendingPlanRequests } from "@/lib/orchestrations/planner/pending-requests";

export async function GET() {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const requests = await listPendingPlanRequests(session.user.tenantId);
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Error listing pending AI plan requests:", error);
    return NextResponse.json({ message: "Failed to list pending requests" }, { status: 500 });
  }
}
