import { NextResponse } from "next/server";
import { listProcessingJobs, ProcessingJobError } from "@/lib/admin/processing-jobs";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;

  try {
    const result = await listProcessingJobs(
      {
        status: searchParams.get("status") || undefined,
        jobType: searchParams.get("job_type") || searchParams.get("jobType") || undefined,
        page: Number(searchParams.get("page") || 1),
        pageSize: Number(searchParams.get("pageSize") || searchParams.get("page_size") || 20)
      },
      session
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProcessingJobError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
