import { NextResponse } from "next/server";
import { appendRecordedActionByToken, GuidedWorkflowError } from "@/lib/admin/guided-workflows";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Recorder payload is required." }, { status: 400 });
  }

  try {
    const result = await appendRecordedActionByToken(
      String(body.recorderToken ?? body.recorder_token ?? ""),
      body.action,
      request.headers.get("origin") ?? undefined
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
