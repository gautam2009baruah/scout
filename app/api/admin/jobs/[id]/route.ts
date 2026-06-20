import { NextResponse } from "next/server";
import { getProcessingJobById, ProcessingJobError } from "@/lib/admin/processing-jobs";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const job = await getProcessingJobById(id, session);

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof ProcessingJobError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
