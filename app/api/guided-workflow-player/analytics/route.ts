import { NextResponse } from "next/server";
import { recordWorkflowAnalyticsEvents, type WorkflowAnalyticsEventInput } from "@/lib/guided-workflows/analytics";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events as WorkflowAnalyticsEventInput[] : [];

  if (events.length === 0) {
    return NextResponse.json({ recorded: 0 });
  }

  const result = await recordWorkflowAnalyticsEvents(events.slice(0, 50));
  return NextResponse.json(result);
}
