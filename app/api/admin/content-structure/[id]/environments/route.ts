// GET/PUT which environments a folder is released to. Uploading/embedding
// documents into a folder is not sufficient for it to be searchable on the
// live chat path — see lib/admin/environment-releases.ts.
//
// Unlike orchestrations/guides, a folder can be scoped to multiple target
// apps (or none, i.e. global) via folder_target_apps, and each target app
// has its own independent environment list. The caller must specify which
// target app's environment list it's viewing/editing via targetAppId —
// releases belonging to a different target app's environments are never
// touched by an edit scoped to another one (see replaceEnvironmentReleases).

import { NextResponse } from "next/server";
import { assertCanManageFolderDocumentAccess, TopicError } from "@/lib/admin/content-structure";
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
    await assertCanManageFolderDocumentAccess(id, session);

    const [environments, releasedEnvironmentIds] = await Promise.all([
      listEnvironmentsForTargetApp(targetAppId),
      getReleasedEnvironmentIds("folder", id),
    ]);

    return NextResponse.json({ environments, releasedEnvironmentIds });
  } catch (error) {
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
    await assertCanManageFolderDocumentAccess(id, session);

    const environmentIds = Array.isArray(body?.environmentIds)
      ? body.environmentIds.filter((value: unknown): value is string => typeof value === "string")
      : [];

    const visibleEnvironments = await listEnvironmentsForTargetApp(targetAppId);
    const releasedEnvironmentIds = await replaceEnvironmentReleases(
      "folder",
      id,
      environmentIds,
      visibleEnvironments.map((environment) => environment.id),
      session.user.id
    );

    return NextResponse.json({ releasedEnvironmentIds });
  } catch (error) {
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}
