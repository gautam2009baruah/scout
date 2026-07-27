// Step 7b: Reject a pending AI plan request. Clears the pending-request
// lock from Step 7 (status leaves "pending") and notifies the requester —
// plain language only, optionally including the admin's reason.

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPendingPlanRequestById, resolvePendingPlanRequest } from "@/lib/orchestrations/planner/pending-requests";
import { appendConversationExchange } from "@/lib/chat/conversations";

type RejectBody = {
  reason?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body: RejectBody = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    const pendingRequest = await getPendingPlanRequestById({ id, companyId: session.user.tenantId });
    if (!pendingRequest) {
      return NextResponse.json({ message: "Pending request not found" }, { status: 404 });
    }
    if (pendingRequest.status !== "pending") {
      return NextResponse.json({ message: `Already ${pendingRequest.status}.` }, { status: 400 });
    }

    const resolved = await resolvePendingPlanRequest({
      id: pendingRequest.id,
      companyId: session.user.tenantId,
      status: "rejected",
      resolvedById: session.user.id,
      rejectionReason: reason || null,
    });

    if (pendingRequest.conversationId) {
      const notification = [
        "Your request wasn't approved this time.",
        reason ? `Reason: ${reason}` : "",
        "Feel free to ask AI Planner again with more detail, or try a different request.",
      ].filter(Boolean).join("\n");

      await appendConversationExchange({
        companyId: pendingRequest.companyId,
        userId: pendingRequest.externalUserId,
        conversationId: pendingRequest.conversationId,
        question: "(AI Planner rejection notification)",
        answer: notification,
        citations: [],
        metadata: { source: "ai_planner_rejection", pendingRequestId: pendingRequest.id },
      });
    }

    return NextResponse.json({ pendingRequest: resolved });
  } catch (error) {
    console.error("Error rejecting pending AI plan request:", error);
    return NextResponse.json({ message: "Failed to reject pending request" }, { status: 500 });
  }
}
