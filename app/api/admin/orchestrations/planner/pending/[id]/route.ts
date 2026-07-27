// Step 7b: a single pending AI plan request. GET lazily converts its draft
// plan into a real, editable draft-status orchestration the first time it's
// opened (Step 5's converter) — reused on subsequent opens via
// draft_orchestration_id, never recreated.

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPendingPlanRequestById } from "@/lib/orchestrations/planner/pending-requests";
import { ensureDraftOrchestrationForPendingRequest } from "@/lib/orchestrations/planner/pending-review";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const pendingRequest = await getPendingPlanRequestById({ id, companyId: session.user.tenantId });
    if (!pendingRequest) {
      return NextResponse.json({ message: "Pending request not found" }, { status: 404 });
    }

    const draftOrchestrationId = await ensureDraftOrchestrationForPendingRequest({
      pendingRequest,
      createdById: session.user.id,
    });

    return NextResponse.json({
      pendingRequest: { ...pendingRequest, draftOrchestrationId },
      draftOrchestrationId,
    });
  } catch (error) {
    console.error("Error loading pending AI plan request:", error);
    return NextResponse.json({ message: "Failed to load pending request" }, { status: 500 });
  }
}
