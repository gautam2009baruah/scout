// GET/PUT which environments a specific document is released to. This is a
// second, independent gate on top of its folder's own environment release —
// see lib/admin/content-structure.ts and lib/search/retrieval-engine.ts's
// getAllowedDocumentIds. A folder being released to an environment does not
// by itself make a document inside it eligible there; both must be released.

import { NextResponse } from "next/server";
import { DocumentError, getDocumentById } from "@/lib/admin/documents";
import { assertTargetAppBelongsToFolder, TopicError } from "@/lib/admin/content-structure";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getReleasedEnvironmentIds, listEnvironmentsForTargetApp, replaceEnvironmentReleases } from "@/lib/admin/environment-releases";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const targetAppId = new URL(request.url).searchParams.get("targetAppId") || "";
  if (!targetAppId) {
    return NextResponse.json({ message: "targetAppId is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const document = await getDocumentById(id, session);
    await assertTargetAppBelongsToFolder(document.folderId, document.companyId, targetAppId);

    const [environments, releasedEnvironmentIds] = await Promise.all([
      listEnvironmentsForTargetApp(targetAppId),
      getReleasedEnvironmentIds("document", id),
    ]);

    return NextResponse.json({ environments, releasedEnvironmentIds });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const targetAppId = typeof body?.targetAppId === "string" ? body.targetAppId : "";
  if (!targetAppId) {
    return NextResponse.json({ message: "targetAppId is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const document = await getDocumentById(id, session);
    await assertTargetAppBelongsToFolder(document.folderId, document.companyId, targetAppId);

    const environmentIds = Array.isArray(body?.environmentIds)
      ? body.environmentIds.filter((value: unknown): value is string => typeof value === "string")
      : [];

    const visibleEnvironments = await listEnvironmentsForTargetApp(targetAppId);
    const releasedEnvironmentIds = await replaceEnvironmentReleases(
      "document",
      id,
      environmentIds,
      visibleEnvironments.map((environment) => environment.id),
      session.user.id
    );

    return NextResponse.json({ releasedEnvironmentIds });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}
