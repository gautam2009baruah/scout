// Step 7b/9: Approve a pending AI plan request.
//
// On approve: ensure the draft plan is persisted as a real orchestration
// (picking up any edits the admin made in the builder, since those were
// already saved to that same orchestration row via the builder's normal
// save flow before this is called), publish it (index hook from Step 3b
// fires automatically via lib/orchestrations/db.ts) — this part always
// happens, per Step 9: every approved draft becomes a saved orchestration,
// full stop. Whether it also becomes matchable_without_validation (so AI
// Planner can find it again for a *future* request — this is a normal
// company/target-app-scoped match per lib/orchestrations/planner/matching.ts,
// available to any external user in scope, not just this requester) and
// whether the requester gets recorded as its originating_external_user_id
// (audit metadata only, no access granted) is gated by the "Allow
// [requester] to re-run this from chat" checkbox — see allowRerunFromChat
// below, checked by default in the UI (components/admin/orchestration-designer.tsx).
// Also runs the plan once for the original requester and notifies them —
// plain language only, never the raw graph (Step 6b's summary format).

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPool } from "@/lib/db/pool";
import { getOrchestrationById, getNodes, getConnections, createExecution, publishOrchestration } from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import { getPendingPlanRequestById, resolvePendingPlanRequest } from "@/lib/orchestrations/planner/pending-requests";
import { ensureDraftOrchestrationForPendingRequest } from "@/lib/orchestrations/planner/pending-review";
import { appendConversationExchange } from "@/lib/chat/conversations";

type ApproveBody = {
  allowRerunFromChat?: boolean;
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
    const body: ApproveBody = await request.json().catch(() => ({}));
    const allowRerunFromChat = body.allowRerunFromChat !== false;

    const pendingRequest = await getPendingPlanRequestById({ id, companyId: session.user.tenantId });
    if (!pendingRequest) {
      return NextResponse.json({ message: "Pending request not found" }, { status: 404 });
    }
    if (pendingRequest.status !== "pending") {
      return NextResponse.json({ message: `Already ${pendingRequest.status}.` }, { status: 400 });
    }

    const orchestrationId = await ensureDraftOrchestrationForPendingRequest({
      pendingRequest,
      createdById: session.user.id,
    });

    const published = await publishOrchestration(orchestrationId, session.user.id);

    if (allowRerunFromChat) {
      // Available again from AI Planner going forward (Step 3b's matching
      // index) — the admin approving it here is exactly the human review
      // gate Step 3b's own safety comment describes as the only thing
      // standing in for real access validation today.
      await getPool().query(
        `UPDATE orchestrations SET matchable_without_validation = true, originating_external_user_id = $2 WHERE id = $1`,
        [orchestrationId, pendingRequest.externalUserId]
      );
    }

    const execution = await createExecution({
      orchestrationId,
      orchestrationVersion: published.version,
      context: {},
      triggerData: {
        triggerType: "chatbot",
        companyId: pendingRequest.companyId,
        targetAppId: pendingRequest.targetAppId,
        userMessage: pendingRequest.requestText,
        source: "ai_planner_approval",
      },
      triggeredBy: pendingRequest.externalUserId,
    });
    const nodes = await getNodes(orchestrationId);
    const connections = await getConnections(orchestrationId);
    const engine = new OrchestrationEngine(execution, nodes, connections);
    const runResult = await engine.execute();

    const resolved = await resolvePendingPlanRequest({
      id: pendingRequest.id,
      companyId: session.user.tenantId,
      status: "approved",
      resolvedById: session.user.id,
    });

    if (pendingRequest.conversationId) {
      const runSummary =
        runResult.status === "completed"
          ? "I ran it now and it completed successfully."
          : runResult.status === "paused"
            ? "I started running it now — it needs one more thing before it can finish, so check back in chat."
            : `I tried running it now but it hit an error: ${runResult.error || "unknown error"}. You can ask for it again.`;

      const notification = [
        `Good news — your request was approved: "${published.name}".`,
        "",
        pendingRequest.planSummary,
        "",
        runSummary,
        allowRerunFromChat
          ? "You can ask for this again anytime from AI Planner."
          : "This one was approved as a one-off — ask AI Planner again if you need it another time.",
      ].join("\n");

      await appendConversationExchange({
        companyId: pendingRequest.companyId,
        userId: pendingRequest.externalUserId,
        conversationId: pendingRequest.conversationId,
        question: "(AI Planner approval notification)",
        answer: notification,
        citations: [],
        metadata: { source: "ai_planner_approval", pendingRequestId: pendingRequest.id, orchestrationId },
      });
    }

    return NextResponse.json({
      pendingRequest: resolved,
      orchestrationId,
      executionStatus: runResult.status,
      allowRerunFromChat,
    });
  } catch (error) {
    console.error("Error approving pending AI plan request:", error);
    return NextResponse.json({ message: "Failed to approve pending request" }, { status: 500 });
  }
}
