import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import {
  isShortNameInUse,
  normalizeShortName,
  validateShortNameFormat,
} from "@/lib/orchestrations/http-trigger/endpoint-resolution";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const shortNameRaw = request.nextUrl.searchParams.get("shortName") || "";
    const orchestrationId = request.nextUrl.searchParams.get("orchestrationId") || undefined;
    const shortName = normalizeShortName(shortNameRaw);

    const formatErrors = validateShortNameFormat(shortName);
    if (formatErrors.length > 0) {
      return NextResponse.json({
        valid: false,
        shortName,
        errors: formatErrors,
        duplicate: false,
      });
    }

    const duplicate = await isShortNameInUse(shortName, orchestrationId);
    return NextResponse.json({
      valid: !duplicate,
      shortName,
      errors: duplicate ? ["Short name is already in use"] : [],
      duplicate,
    });
  } catch (error) {
    return NextResponse.json(
      {
        valid: false,
        shortName: null,
        errors: [error instanceof Error ? error.message : "Validation failed"],
        duplicate: false,
      },
      { status: 500 }
    );
  }
}
