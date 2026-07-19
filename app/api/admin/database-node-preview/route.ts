import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { DatabaseSchemaAdminError } from "@/lib/admin/database-schemas";
import { executeDatabaseNode } from "@/lib/orchestrations/nodes/database-node";
import { setVariablePath } from "@/lib/orchestrations/expression-evaluator";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ message: "Authentication required." }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ message: "You do not have permission to preview database SQL." }, { status: 403 });
}

function getValueByPath(value: unknown, path: string): unknown {
  if (!path.trim()) return value;
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) return unauthorized();
  if (!hasModuleAccess(session, MODULE_KEYS.orchestrationDesigner)) return forbidden();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Preview payload is required." }, { status: 400 });
  }

  try {
    const config = (body.config && typeof body.config === "object" ? body.config : {}) as Record<string, unknown>;
    const userRequestPath = String(config.userRequestVariablePath || "userMessage").trim() || "userMessage";
    const extractedInputPath = String(config.extractedInputVariablePath || "extracted").trim() || "extracted";
    const additionalContextPath = String(config.additionalContextVariablePath || "").trim();
    const outputVariable = String(config.outputVariable || "databaseQuery").trim() || "databaseQuery";

    const context: Record<string, unknown> = {};
    setVariablePath(userRequestPath, String(body.userRequest || ""), context);
    setVariablePath(extractedInputPath, body.extractedInput ?? {}, context);
    if (additionalContextPath) {
      setVariablePath(additionalContextPath, body.additionalContext ?? {}, context);
    }

    setVariablePath("trigger.input.userMessage", String(body.userRequest || ""), context);
    setVariablePath("trigger.input.companyId", session.user.tenantId, context);
    if (typeof body.targetAppId === "string" && body.targetAppId.trim()) {
      setVariablePath("trigger.input.targetAppId", body.targetAppId.trim(), context);
    }

    const result = await executeDatabaseNode(
      {
        type: "database",
        schemaId: String(body.schemaId || ""),
        outputVariable,
        userRequestVariablePath: userRequestPath,
        extractedInputVariablePath: extractedInputPath,
        additionalContextVariablePath: additionalContextPath || undefined,
        maxRows: Number(config.maxRows || 25),
        clarificationTimeoutMinutes: Number(config.clarificationTimeoutMinutes || 15),
        customInstructions: String(config.customInstructions || ""),
        allowSelectStar: config.allowSelectStar === true,
      },
      context,
      {
        companyId: session.user.tenantId,
        targetAppId: typeof body.targetAppId === "string" ? body.targetAppId : null,
      }
    );

    const preview = result.output ? getValueByPath(result.output, outputVariable) : undefined;

    if (!result.success) {
      return NextResponse.json({ message: result.error || "Unable to generate SQL preview.", preview: preview ?? null }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      preview: preview ?? null,
      output: result.output ?? null,
    });
  } catch (error) {
    if (error instanceof DatabaseSchemaAdminError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to generate SQL preview." }, { status: 500 });
  }
}
